import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setupByo,guardedInvoke,checkedCli,nativeCliCandidates,outsideRepos} from '../scripts/setup-byo.mjs';
import {runByoRelease} from '../scripts/byo-support-release.mjs';
import {buildRelease} from '../scripts/build-platform-release.mjs';
import {paperHistory} from '../src/admin/pages/paper-history.js';
const ref='abcdefghijklmnopqrst',pairing=`# orbito-project-ref: ${ref}\n# orbito-client-id: 42\nPLATFORM_BRIDGE_CALL_SECRET=${'a'.repeat(64)}\nPLATFORM_BRIDGE_SOURCE_SECRET=${'b'.repeat(64)}\nPLATFORM_BRIDGE_ENDPOINT=https://qrstabcdefghijklmnop.supabase.co/functions/v1/platform-bridge\n`;
const fixture=()=>{const dir=mkdtempSync(join(tmpdir(),'retrasell-guided-test-')),pair=join(dir,'pair.env'),runtime=join(dir,'runtime.env'),journal=join(dir,'journal.json');writeFileSync(pair,pairing);writeFileSync(runtime,'TURNSTILE_SECRET=synthetic-private\n');return{dir,pair,runtime,journal,args:['--journal',journal,'--pairing-file',pair,'--runtime-file',runtime,'--mode','fresh','--cli',join(dir,'supabase.exe')]};};
const cli=(_exe,argv)=>argv[0]==='--version'?'2.120.0':argv.includes('--help')?'--linked --project-ref --file --output-format --use-api --env-file':'[]';
test('CLI capability discovery includes arbitrary npm cache directories without shell wrappers',()=>{
 const dir=mkdtempSync(join(tmpdir(),'retrasell-cli-test-'));try{const bin=join(dir,'_npx','random-cache-entry','node_modules','@supabase','cli-windows-x64','bin');mkdirSync(bin,{recursive:true});const exe=join(bin,process.platform==='win32'?'supabase.exe':'supabase');writeFileSync(exe,'');assert.ok(nativeCliCandidates({PATH:'',npm_config_cache:dir}).includes(exe));assert.equal(checkedCli(exe,cli),'2.120.0');assert.throws(()=>checkedCli(exe,()=>''));}finally{rmSync(dir,{recursive:true,force:true});}
});
test('unknown provider writes fence re-entry and retain completed steps without secrets in the journal',()=>{
 const journal={state:'Preflight',steps:{}},saves=[];let writes=0;
 const invoke=guardedInvoke(journal,()=>saves.push(JSON.stringify(journal)),()=>{writes++;throw Error('synthetic-private')});
 const args=['functions','deploy','login','--project-ref',ref,'--use-api'];assert.throws(()=>invoke(args),/Outcome unknown/);assert.throws(()=>invoke(args),/Needs intervention/);assert.equal(writes,1);assert.equal(journal.steps['functions:login'],'unknown');assert.ok(saves.every(s=>!s.includes('synthetic-private')));
 journal.steps['functions:login']='passed';assert.equal(invoke(args),'');assert.equal(writes,1);
});
test('guided preflight declines without writes, local-only status, exact-target journal binding and concurrent lock ownership',async()=>{
 const f=fixture(),calls=[],reports=[];try{
  const deps={invoke:cli,ask:async()=>'',report:s=>reports.push(s),run:async args=>calls.push(args)};
  await setupByo(f.args,deps);assert.equal(calls.length,1);assert.ok(!calls[0].includes('--apply'));
  const j=JSON.parse(readFileSync(f.journal));assert.equal(j.state,'Ready for installation');assert.ok(!JSON.stringify(j).includes('synthetic-private'));
  await setupByo(['--journal',f.journal,'--status'],{invoke:()=>{throw Error('must not contact CLI')},report:()=>{},ask:async()=>''});
  writeFileSync(f.journal+'.lock','other process');await assert.rejects(()=>setupByo(f.args,deps),/EEXIST/);assert.ok(existsSync(f.journal+'.lock'));rmSync(f.journal+'.lock');
  writeFileSync(f.pair,pairing.replace(ref,'bcdefghijklmnopqrstu'));await assert.rejects(()=>setupByo(f.args,deps),/target, release/);
  assert.throws(()=>outsideRepos(new URL('../scripts/byo-release-manifest.json',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')),/outside both/);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('real BYO planner uses owner-tested exact query flags and rejects malformed/foreign CLI output before mutation',async()=>{
 const f=fixture(),release=buildRelease(undefined,{support:true}),queries=[];
 try{
  const args=['--phase','install','--mode','fresh','--project-ref',ref,'--release-sha',release.sha256,'--pairing-file',f.pair,'--runtime-file',f.runtime];
  const invoke=argv=>{if(argv[0]==='projects')return JSON.stringify([{id:ref}]);assert.deepEqual(argv.slice(0,5),['db','query','--linked','--project-ref',ref]);assert.deepEqual(argv.slice(-2),['--output-format','json']);const q=readFileSync(argv[argv.indexOf('--file')+1],'utf8');queries.push(q);return JSON.stringify(q.includes('to_regclass')?[{present:false}]:[{count:0}]);};
  await runByoRelease(args,{invoke,setup:async()=>{},report:()=>{}});assert.equal(queries.length,2);assert.ok(!queries.some(q=>q.includes('insert into')));
  await assert.rejects(()=>runByoRelease(args,{invoke:()=>JSON.stringify([{id:'wrongproject'}]),setup:async()=>{}}),/cannot access/);
  await assert.rejects(()=>runByoRelease(args,{invoke:argv=>argv[0]==='projects'?JSON.stringify([{id:ref}]):'{"unknown":true}',setup:async()=>{}}),/Unrecognized/);
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('guided authorized installation advances through observed owner/onboarding waits, stable automatic Support target, and explicit owner acceptance',async()=>{
 const f=fixture(),calls=[];let observed={owner_account:'missing',onboarded:false,platform_client_id:42,client_binding:'orbito-client-42',source_id:'98000000-0000-4000-8000-000000000001'};
 const release=buildRelease(undefined,{support:true});
 const deps={invoke:cli,report:()=>{},ask:async q=>q.startsWith('To authorize')?`INSTALL ${ref}`:q.startsWith('After Platform')?'99000000-0000-4000-8000-000000000002':q.startsWith('Type ACCEPT')?`ACCEPT ${ref}`:'',run:async args=>{calls.push(args);return args[args.indexOf('--phase')+1]==='status'?observed:undefined;}};
 try{
  assert.equal((await setupByo(f.args,deps)).state,'Runtime verified');assert.equal(calls.filter(a=>a.includes('--apply')).length,1);
  assert.equal((await setupByo(f.args,deps)).state,'Waiting for owner');observed={...observed,owner_account:'active'};
  assert.equal((await setupByo(f.args,deps)).state,'Waiting for onboarding');observed={...observed,onboarded:true};
  const enrolled=await setupByo([...f.args,'--enroll'],deps);assert.equal(enrolled.state,'Support enrollment pending');assert.equal(enrolled.supportInstalled,true);
  const target=JSON.parse(readFileSync(join(f.dir,'support-target-'+ref+'.json')));assert.equal(target.client_id,42);assert.equal(target.source_id,observed.source_id);assert.match(target.request_id,/^[a-f0-9-]{36}$/);assert.ok(!JSON.stringify(target).includes('SECRET'));
  const accepted=await setupByo([...f.args,'--record-acceptance'],deps);assert.equal(accepted.state,'Completed');assert.equal(accepted.acceptance.kind,'owner-reported');
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('Shop paper history escapes customer messages, preserves supplied dates and does not invent an ETA',()=>{
 const html=paperHistory([{request_id:'<img src=x>',status:'rejected',requested_at:'2026-10-20',communication:[{status:'rejected',message:'<script>bad()</script>',expectation:'',at:'2026-10-20'}]}]);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('Expected delivery:'));assert.match(html,/Rejected/);assert.match(paperHistory([{status:'fulfilled',communication:[]}]),/earlier update/);
});
