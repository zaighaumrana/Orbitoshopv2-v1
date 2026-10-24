import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {upgradeBackend,verifyPlatformPublicKey} from '../scripts/upgrade-backend.mjs';
import {buildRelease} from '../scripts/build-platform-release.mjs';
import {makeUpgradePlan,digest} from '../scripts/upgrade-contract.mjs';

const platformRef='zyxwvutsrqponmlkjihg',platformUrl=`https://${platformRef}.supabase.co`;
const modern='sb_publishable_'+('synthetic_only_').repeat(3);
const jwt=(role='anon',ref=platformRef)=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({role,ref})).toString('base64url'),'s'.repeat(43)].join('.');
const settings=()=>Response.json({external:{email:true}});

test('publishable and legacy anon keys require acceptance by the exact project without sending clearance authority',async()=>{
 for(const key of [modern,jwt()]){
  let calls=0;
  await verifyPlatformPublicKey(platformRef,key,async(url,init)=>{calls++;assert.equal(url,platformUrl+'/auth/v1/settings');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.ok(init.signal);assert.deepEqual(init.headers,{apikey:key,Accept:'application/json'});assert.equal(init.body,undefined);return settings();});
  assert.equal(calls,1);
 }
});

test('privileged, malformed and wrong-project legacy keys fail before any network request',async()=>{
 let calls=0;
 for(const key of [jwt('service_role'),'sb_secret_synthetic_only','sbp_synthetic_pat',jwt('anon','abcdefghijklmnopqrst'),'sb_publishable_','not-a-key',null]){
  await assert.rejects(verifyPlatformPublicKey(platformRef,key,async()=>{calls++;throw Error();}),/Public Platform|privileged/);
 }
 assert.equal(calls,0);
});

test('a publishable prefix alone cannot bypass a wrong-project/revoked key, redirect, outage or malformed successful response',async()=>{
 for(const answer of [()=>new Response('private provider body',{status:401}),()=>new Response(null,{status:302}),()=>{throw Error('network detail must not escape');},()=>Response.json([]),()=>new Response('<html>not Auth settings</html>')]){
  await assert.rejects(verifyPlatformPublicKey(platformRef,modern,async()=>answer()),error=>/could not be verified/.test(error.message)&&!/private provider body|network detail/.test(error.message));
 }
});

const catalog=JSON.parse(readFileSync(new URL('../scripts/backend-release-catalog.json',import.meta.url),'utf8'));
const [sourceSha,sourceMetadata]=Object.entries(catalog).find(([,r])=>r.release_id==='support-v4');
const source={...sourceMetadata,sha256:sourceSha},target=buildRelease(undefined,{support:true});
const identity={client_id:100,project_ref:'abcdefghijklmnopqrst',source_id:'99500000-0000-4000-8000-000000000001',client_binding:'fixture-100'};
const request='99500000-0000-4000-8000-000000000010';
const observation={shop:{...identity,owner_ready:true,owner_busy:false,invalid_config_receipts:0},migrations:source.migration_manifest,functions:source.function_manifest.map(f=>({...f,present:true,source_sha256:null})),origin:'customer-local-cli',runtime_ready:true};
const plan=makeUpgradePlan({sha256:source.sha256,migrations:source.migration_manifest,functions:source.function_manifest},target,source,catalog[target.sha256],observation,identity);

// Exercise the real CLI transport with synthetic responses; never run Supabase.
async function customer(options,check){
 const dir=mkdtempSync(join(tmpdir(),'retrasell-clearance-')),journal=join(dir,'journal.json'),approvalFile=join(dir,'approval.json');
 const approval={contract:'retrasell-byo-upgrade-clearance-v1',platform_url:platformUrl,platform_public_key:options.key||modern,request_id:request,plan:structuredClone(plan),plan_sha256:await digest(plan),token:'b'.repeat(64)};
 let history=source.migration_manifest;const stats={writes:0,keyChecks:0,claims:0,commands:0};
 const ledger={...identity,mode:'byo',request_id:request,source_sha256:source.sha256,target_sha256:target.sha256,plan:structuredClone(plan),plan_sha256:await digest(plan),steps:{},state:'approved'};
 try{
  await options.alter?.(approval);writeFileSync(approvalFile,JSON.stringify(approval),{mode:0o600});
  if(options.originalJournal)writeFileSync(journal,JSON.stringify({contract:'retrasell-backend-upgrade-v2',mode:'byo',project:identity.project_ref,client:100,source:source.sha256,target:target.sha256,request_id:request,plan_sha256:await digest(plan),steps:{},state:'claiming'}),{mode:0o600});
  const original=existsSync(journal)?readFileSync(journal,'utf8'):null;
  const fetch=async(url,init)=>{
   if(url===platformUrl+'/auth/v1/settings'){stats.keyChecks++;assert.equal(init.headers['x-retrasell-upgrade-token'],undefined);assert.equal(init.headers.Authorization,undefined);return settings();}
   assert.equal(stats.keyChecks,1);assert.equal(url,platformUrl+'/functions/v1/platform-upgrade');assert.equal(init.method,'POST');assert.equal(init.redirect,'error');assert.equal(init.headers.apikey,approval.platform_public_key);assert.equal(init.headers['x-retrasell-upgrade-token'],approval.token);
   const b=JSON.parse(init.body);assert.equal(b.request_id,request);
   if(b.action==='customer-claim'){
    stats.claims++;if(options.denied)return Response.json({error:'private provider detail'},{status:options.denied});
    assert.ok(['approved','paused'].includes(ledger.state));ledger.state='running';ledger.invocation='99500000-0000-4000-8000-'+String(20+stats.claims).padStart(12,'0');
    const job=structuredClone(ledger);options.alterJob?.(job);return Response.json({job});
   }
   assert.equal(b.action,'customer-command');assert.equal(b.invocation,ledger.invocation);stats.commands++;
   const {kind,args}=b;
   if(kind==='dispatch'){assert.equal(ledger.unknown_step,undefined);ledger.unknown_step=args.step;}
   if(kind==='passed'){assert.equal(args.step,ledger.unknown_step);assert.equal(args.sha256,plan.steps.find(s=>s.name===args.step).sha256);ledger.steps[args.step]={state:'passed'};delete ledger.unknown_step;}
   if(kind==='pause')ledger.state='paused';if(kind==='finish'){ledger.state='verification_required';ledger.verification={...args.verification,full_source_verified:false,components_verified:false,evidence_strength:'customer-reported'};}
   return Response.json({job:kind==='check'?{}:ledger});
  };
  const invoke=a=>{if(a[0]==='--version')return '2.120.0';if(a.includes('--help'))return '--linked --project-ref --file --output-format --use-api --env-file';if(a[0]==='projects')return JSON.stringify([{id:identity.project_ref}]);if(a[0]==='functions'&&a[1]==='list')return JSON.stringify(target.functions.map(f=>({name:f.name,verify_jwt:f.verify_jwt})));assert.equal(a[0],'functions');assert.equal(a[1],'deploy');stats.writes++;return '{}';};
  const query=async q=>{if(q.startsWith('begin;')){stats.writes++;history=target.migrations;return [];}assert.ok(q.startsWith('select '));if(q.includes('schema_migrations'))return history;if(q.includes('from public.shop_config'))return [observation.shop];return [{runtime:{owner_account:'active',checks:{database:true}}}];};
  const run=()=>upgradeBackend(['--mode','byo','--project-ref',identity.project_ref,'--client-id','100','--from-sha',source.sha256,'--journal',journal,'--approval-file',approvalFile,'--platform-project-ref',platformRef,'--cli','C:/fixture/supabase.exe','--apply'],{fetch,invoke,query,confirm:async()=>`UPGRADE ${identity.project_ref} ${target.sha256}`,report:()=>{}});
  await check({run,stats,journal,original,dir});assert.equal(existsSync(journal+'.lock'),false);
 }finally{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert.ok(basename(dir).startsWith('retrasell-clearance-'));rmSync(dir,{recursive:true,force:true});}
}

test('altered URL, fingerprints, plan, binding and original request are rejected without customer writes',async()=>{
 const cases=[
  {alter:a=>a.platform_url='https://abcdefghijklmnopqrst.supabase.co',pattern:/clearance/},
  {alter:a=>a.plan_sha256='0'.repeat(64),pattern:/clearance/},
  {alter:async a=>{a.plan.source_sha256='0'.repeat(64);a.plan_sha256=await digest(a.plan);},pattern:/clearance/},
  {alter:async a=>{a.plan.client_binding='different';a.plan_sha256=await digest(a.plan);},pattern:/binding/},
  {originalJournal:true,alter:a=>a.request_id='99500000-0000-4000-8000-000000000011',pattern:/original journal/},
  {alterJob:j=>j.plan.steps[0].sha256='0'.repeat(64),pattern:/Platform plan/},
  {alterJob:j=>j.source_id='99500000-0000-4000-8000-000000000099',pattern:/Platform plan/}
 ];
 for(const c of cases)await customer(c,async({run,stats,journal,original})=>{await assert.rejects(run(),c.pattern);assert.equal(stats.writes,0);assert.equal(stats.commands,0);if(original)assert.equal(readFileSync(journal,'utf8'),original);});
});

test('both clearance formats complete the mocked original three-step flow; expired, revoked and unauthorized clearance fail closed',async()=>{
 for(const key of [modern,jwt()])await customer({key},async({run,stats,journal})=>{
  const result=await run();assert.equal(result.state,'verification_required');assert.equal(result.verification.full_source_verified,false);assert.equal(result.verification.evidence_strength,'customer-reported');assert.equal(Object.keys(result.steps).length,3);assert.equal(stats.writes,3);assert.equal(stats.claims,2);assert.equal(JSON.parse(readFileSync(journal,'utf8')).request_id,request);
 });
 for(const denied of [401,403,409])await customer({denied},async({run,stats,journal})=>{
  await assert.rejects(run(),error=>/clearance or pending-operation gate/.test(error.message)&&!error.message.includes('private provider detail'));assert.equal(stats.writes,0);assert.equal(stats.commands,0);const j=JSON.parse(readFileSync(journal,'utf8'));assert.equal(j.request_id,request);assert.equal(j.state,'claiming');
 });
});
