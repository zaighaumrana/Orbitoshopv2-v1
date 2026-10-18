import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createSupportClient} from '../src/platform/support.js';
import {supportPage} from '../src/admin/pages/support.js';
import {validateConfig,supportEnv,runSupportSetup} from '../scripts/support-setup.mjs';
import {buildRelease} from '../scripts/build-platform-release.mjs';
const id='97000000-0000-4000-8000-000000000001',sid='97000000-0000-4000-8000-000000000002';
const session=()=>({user:{id},access_token:'x.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.x'});
test('lost response retains original UUID and canonical payload; session changes discard private Support state',async()=>{
 let current=session(),uncertain=true;const sent=[];
 const sb={auth:{getSession:async()=>({data:{session:current}})},functions:{invoke:async(_,options)=>{
  sent.push(structuredClone(options.body));if(options.body.action==='list')return {data:{tickets:[],has_more:false}};
  if(uncertain)return {error:Error('network')};return {data:{accepted:true,ticket_id:id,status:'Open'}};
 }}};
 const c=createSupportClient(sb);await c.list();c.view.draft={subject:'Scanner',category:'technical',message:'Disconnects'};
 await assert.rejects(()=>c.create(),/unavailable/);const original=structuredClone(c.view.pending);assert.ok(original.request_id);
 uncertain=false;await c.create();const creates=sent.filter(b=>b.action==='create');assert.deepEqual(creates,[original,original]);assert.equal(c.view.pending,null);assert.equal(c.view.receipt,id);
 c.view.tickets=[{message:'private'}];current=null;await assert.rejects(()=>c.list(),/Sign in/);assert.equal(c.view.tickets.length,0);assert.equal(c.view.receipt,null);
});
test('late response cannot populate a replacement session and repeated clicks reuse pending request',async()=>{
 let current=session(),complete;const sb={auth:{getSession:async()=>({data:{session:current}})},functions:{invoke:async()=>new Promise(resolve=>{complete=resolve;})}};
 const c=createSupportClient(sb),pending=c.list();await new Promise(r=>setTimeout(r,0));current=null;complete({data:{tickets:[{message:'private'}]}});await assert.rejects(()=>pending,/Sign in|changed/);assert.deepEqual(c.view.tickets,[]);
});
test('Support text, ticket attributes, resolution and uncertain drafts render escaped',()=>{
 const malicious='<img src=x onerror=alert(1)>',v={tickets:[{ticket_id:'" onclick="bad()',subject:malicious,status:'Open',created_at:'2026-10-18'}],draft:{subject:malicious,category:'technical',message:'</textarea><script>bad()</script>'},detail:{subject:malicious,message:malicious,resolution:malicious,status:'Resolved',created_at:'2026-10-18'},pending:{request_id:id},error:malicious,offset:0};
 const html=supportPage(v);assert.doesNotMatch(html,/<img|<script|ticket-id="" onclick/);assert.match(html,/&lt;img/);assert.match(html,/Retry original request/);assert.match(html,/readonly/);
});
test('Help & Support navigation grants only Owner/Manager and never privileged handoff identity',()=>{
 const s=readFileSync(new URL('../src/shared.js',import.meta.url),'utf8');const access=s.slice(s.indexOf('export const ACCESS'),s.indexOf('export function can'));
 for(const role of ['Business Owner','Manager'])assert.match(access.split('\n').find(l=>l.includes("'"+role+"':")),/customer-support/);
 for(const role of ['Cashier','Technician','Orbito Support'])assert.doesNotMatch(access.split('\n').find(l=>l.includes("'"+role+"':")),/customer-support/);
});
test('optional Support package is reproducible, explicit, JWT protected and preserves the six-function default',()=>{
 const ordinary=buildRelease(),future=buildRelease(undefined,{support:true});assert.equal(ordinary.functions.length,6);assert.equal(future.functions.length,7);
 assert.equal(future.functions.find(f=>f.name==='support-tickets').verify_jwt,true);
 assert.ok(future.migrations.some(m=>m.name==='customer_support_actor'));assert.ok(!ordinary.migrations.some(m=>m.name==='customer_support_actor'));
 assert.deepEqual(future,buildRelease(undefined,{support:true}));assert.notEqual(ordinary.sha256,future.sha256);
 for(const fn of future.functions)for(const file of fn.files)assert.equal(file.content,readFileSync(new URL('../supabase/functions/'+file.path,import.meta.url),'utf8').replaceAll('\r\n','\n'));
 assert.deepEqual(JSON.parse(readFileSync(new URL('../../orbito/supabase/releases/shop-release-support-v1.json',import.meta.url),'utf8')),future,'staged candidate exactly matches the reviewed current source');
 assert.doesNotMatch(readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),/shop-release-support-v1/);
});
test('BYO hash enrollment targets distinct exact projects and accepts only dedicated Support settings',()=>{
 const c={platform_ref:'ukbhyerxshteyetwomqy',project_ref:'tufvoxxlgfydoknxczoy',client_id:42,source_id:id,request_id:sid,client_binding:'fixture',pairing_mode:'byo',scopes:['ticket:create','ticket:read']};
 assert.deepEqual(validateConfig(c),c);assert.throws(()=>validateConfig({...c,platform_ref:c.project_ref}));
 const text='PLATFORM_SUPPORT_TICKETS_SECRET='+'f'.repeat(64)+'\nPLATFORM_SUPPORT_TICKETS_ENDPOINT=https://'+c.platform_ref+'.supabase.co/functions/v1/platform-support-tickets\n';
 assert.equal(supportEnv(text,c).PLATFORM_SUPPORT_TICKETS_SECRET.length,64);assert.throws(()=>supportEnv(text+'PLATFORM_BRIDGE_SOURCE_SECRET=private',c));assert.throws(()=>supportEnv(text.replace('platform-support-tickets','platform-bridge'),c));
});
test('split-operator BYO export shares only a hash and exact target metadata, with no network mutation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'support-export-'));
 try{
  const c={platform_ref:'ukbhyerxshteyetwomqy',project_ref:'tufvoxxlgfydoknxczoy',client_id:42,source_id:id,request_id:sid,client_binding:'fixture',pairing_mode:'byo',scopes:['ticket:create','ticket:read']};
  const config=join(dir,'config.json'),runtime=join(dir,'runtime.env'),enrollment=join(dir,'enrollment.json');writeFileSync(config,JSON.stringify(c));
  await runSupportSetup(['--config',config,'--action','generate','--runtime-file',runtime]);
  await runSupportSetup(['--config',config,'--action','export','--runtime-file',runtime,'--enrollment-file',enrollment]);
  const shared=JSON.parse(readFileSync(enrollment,'utf8')),secret=supportEnv(readFileSync(runtime,'utf8'),c).PLATFORM_SUPPORT_TICKETS_SECRET;
  assert.ok(!JSON.stringify(shared).includes(secret),'plaintext never enters enrollment handoff');assert.equal(shared.secret_sha256.length,64);assert.equal(shared.request_id,sid);
  await assert.rejects(()=>runSupportSetup(['--config',config,'--action','prepare','--enrollment-file',enrollment]),/--apply/);
 }finally{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep+'support-export-'));rmSync(dir,{recursive:true,force:true});}
});
test('a customer with only a Shop checkout can generate private BYO settings without a sibling Platform checkout',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'support-export-'));
 try{
  const scripts=join(dir,'shop','scripts');mkdirSync(scripts,{recursive:true});const copied=join(scripts,'support-setup.mjs');writeFileSync(copied,readFileSync(new URL('../scripts/support-setup.mjs',import.meta.url),'utf8'));
  const standalone=await import(pathToFileURL(copied).href),config=join(dir,'target.json'),runtime=join(dir,'private.env');
  writeFileSync(config,JSON.stringify({platform_ref:'ukbhyerxshteyetwomqy',project_ref:'tufvoxxlgfydoknxczoy',client_id:42,source_id:id,request_id:sid,client_binding:'fixture',pairing_mode:'byo',scopes:['ticket:create','ticket:read']}));
  await standalone.runSupportSetup(['--config',config,'--action','generate','--runtime-file',runtime]);assert.match(readFileSync(runtime,'utf8'),/^PLATFORM_SUPPORT_TICKETS_SECRET=[a-f0-9]{64}\n/);
 }finally{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep+'support-export-'));rmSync(dir,{recursive:true,force:true});}
});
