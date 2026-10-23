import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {setupByo} from '../scripts/setup-byo.mjs';import {validateInputs,parseEnv} from '../scripts/byo-setup.mjs';import {validateConfig} from '../scripts/support-setup.mjs';import {diagnosticFor} from '../scripts/byo-diagnostics.mjs';
const ref='abcdefghijklmnopqrst',platform='qrstabcdefghijklmnop';
const pairing=(id,project=ref)=>`# orbito-project-ref: ${project}\n# orbito-client-id: ${id}\nPLATFORM_BRIDGE_CALL_SECRET=${'a'.repeat(64)}\nPLATFORM_BRIDGE_SOURCE_SECRET=${'b'.repeat(64)}\nPLATFORM_BRIDGE_ENDPOINT=https://${platform}.supabase.co/functions/v1/platform-bridge\n`;
const parse=text=>parseEnv(text,['PLATFORM_BRIDGE_CALL_SECRET','PLATFORM_BRIDGE_SOURCE_SECRET','PLATFORM_BRIDGE_ENDPOINT']);
function fixture(id='1'){
 const dir=mkdtempSync(join(tmpdir(),'retrasell-reliability-')),pair=join(dir,'pair.env'),runtime=join(dir,'runtime.env'),pub=join(dir,'public.json'),journal=join(dir,'journal.json');
 writeFileSync(pair,pairing(id));writeFileSync(runtime,'TURNSTILE_SECRET=synthetic-private\n');writeFileSync(pub,JSON.stringify({VITE_SUPABASE_URL:`https://${ref}.supabase.co`,VITE_SUPABASE_ANON:'x.'+Buffer.from(JSON.stringify({role:'anon',ref,exp:Date.now()/1000+3600})).toString('base64url')+'.x',VITE_TURNSTILE_SITE_KEY:'synthetic-site'}));
 const args=['--client-id',id,'--project-ref',ref,'--journal',journal,'--pairing-file',pair,'--runtime-file',runtime,'--public-config',pub,'--mode','fresh','--cli',join(dir,'supabase.exe')];
 const calls=[],reports=[];const deps={report:s=>reports.push(s),ask:async()=>'',invoke:(_exe,a)=>a[0]==='--version'?'2.120.0':a.includes('--help')?'--linked --project-ref --file --output-format --use-api --env-file':'[]',run:async a=>{calls.push(a);return undefined}};
 return {dir,pair,runtime,pub,journal,args,deps,calls,reports};
}
test('legitimate fresh Client 1 and later IDs reach explicit authorization after exact preflight, including reset numbering; cancelled install makes no provider writes',async()=>{
 for(const id of ['1','2','42']){const f=fixture(id);try{const j=await setupByo(f.args,f.deps);assert.equal(j.client,id);assert.equal(j.state,'Ready for installation');assert.equal(f.calls.length,1);assert.ok(!f.calls[0].includes('--apply'));assert.match(f.reports.join('\n'),/no installation writes authorized/);validateInputs(ref,parse(pairing(id)),{values:{TURNSTILE_SECRET:'synthetic-private'}});}finally{rmSync(f.dir,{recursive:true,force:true})}}
 assert.equal(validateConfig({platform_ref:platform,project_ref:ref,client_id:1,source_id:'98000000-0000-4000-8000-000000000001',request_id:'99000000-0000-4000-8000-000000000001',client_binding:'orbito-client-1',pairing_mode:'byo',scopes:['ticket:create']}).client_id,1);
});
test('historical project, malformed IDs and cross-project/customer substitutions fail before provider access',async()=>{
 for(const id of ['', '0','-1','01','1.2','abc','2147483648'])assert.throws(()=>validateInputs(ref,parse(pairing(id)),{values:{TURNSTILE_SECRET:'synthetic-private'}}));
 assert.throws(()=>validateInputs('kxmovywgshyltwusghhj',parse(pairing('1','kxmovywgshyltwusghhj')),{values:{TURNSTILE_SECRET:'synthetic-private'}}));
 const f=fixture();try{writeFileSync(f.pair,pairing('2'));await assert.rejects(()=>setupByo(f.args,f.deps),e=>e.diagnostic.category==='identity'&&e.diagnostic.provider_writes==='none');assert.equal(f.calls.length,0);assert.equal(existsSync(f.journal),false)}finally{rmSync(f.dir,{recursive:true,force:true})}
});
test('missing inputs before journal, invalid mode/public JWT and original journal target conflicts have fixed actionable categories without raw private data',async()=>{
 const f=fixture();try{
  rmSync(f.runtime);await assert.rejects(()=>setupByo(f.args,f.deps),e=>e.diagnostic.category==='configuration'&&e.diagnostic.phase==='public_configuration'&&e.diagnostic.provider_writes==='none');
  writeFileSync(f.runtime,'TURNSTILE_SECRET=synthetic-private\n');writeFileSync(f.pub,'{"VITE_SUPABASE_ANON":"sensitive-unfiltered-token"}');await assert.rejects(()=>setupByo(f.args,f.deps),e=>!JSON.stringify(e.diagnostic).includes('sensitive-unfiltered-token')&&e.diagnostic.category==='configuration');
  for(const [code,expected] of [['EEXIST','lock'],['ENOENT','journal']]){const e=Object.assign(Error('sensitive-provider-body'),{code});const d=diagnosticFor(e,{phase:'journal'});assert.equal(d.category,expected);assert.ok(!JSON.stringify(d).includes('sensitive-provider-body'))}
  const d=diagnosticFor(Error('sensitive-provider-body'),{phase:'installation',writes:'possible',checks:['release','private-secret-value']});assert.equal(d.category,'internal');assert.deepEqual(d.completed_checks,['release']);assert.doesNotMatch(JSON.stringify(d),/sensitive|private-secret/);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});
test('core acceptance is independently recorded without a Support credential, keeps original journal resumable and does not claim machine verification',async()=>{
 const f=fixture();try{
  f.deps.ask=async q=>q.startsWith('To authorize')?`INSTALL ${ref}`:q.startsWith('After checking')?`CORE ACCEPT ${ref}`:'';
  f.deps.run=async a=>{f.calls.push(a);return a[a.indexOf('--phase')+1]==='status'?{owner_account:'active',onboarded:true,platform_client_id:1,client_binding:'orbito-client-1'}:undefined};
  await setupByo(f.args,f.deps);const j=await setupByo([...f.args,'--record-acceptance','--acceptance','core'],f.deps);assert.equal(j.coreAcceptance.kind,'owner-reported');assert.equal(j.coreAcceptance.scope,'core');assert.equal(j.supportInstalled,undefined);assert.notEqual(j.state,'Completed');assert.match(f.reports.join('\n'),/Support is optional and is not verified/);
  assert.doesNotMatch(readFileSync(f.journal,'utf8'),/synthetic-private/);
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});

test('wrong mode, changed original release and journal target fail before a provider operation; malformed journals stay private',async()=>{
 const f=fixture();try{
  const bad=[...f.args];bad[bad.indexOf('--mode')+1]='guess';await assert.rejects(()=>setupByo(bad,f.deps),e=>e.diagnostic.category==='mode');assert.equal(existsSync(f.journal),false);
  await setupByo(f.args,f.deps);const original=JSON.parse(readFileSync(f.journal,'utf8'));f.calls.length=0;
  writeFileSync(f.journal,JSON.stringify({...original,state:'Installing',release:'0'.repeat(64)}));await assert.rejects(()=>setupByo(f.args,f.deps),e=>e.diagnostic.category==='release'&&e.diagnostic.provider_writes==='possible');
  writeFileSync(f.journal,JSON.stringify({...original,client:'2'}));await assert.rejects(()=>setupByo(f.args,f.deps),e=>e.diagnostic.category==='identity');assert.equal(f.calls.length,0);
  writeFileSync(f.journal,'private-invalid-json');await assert.rejects(()=>setupByo(f.args,f.deps),e=>e.diagnostic.category==='journal'&&!JSON.stringify(e.diagnostic).includes('private-invalid'));
 }finally{rmSync(f.dir,{recursive:true,force:true})}
});
