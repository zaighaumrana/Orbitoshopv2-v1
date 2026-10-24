import {installationPlan} from './backend-plan.mjs';
import {executeUpgrade} from './upgrade-engine.mjs';
import {makeUpgradePlan,requireShopReady,requireUpgradeProgress,verifyUpgradeResult,digest,shopUpgradeQuery,migrationEvidenceQuery} from './upgrade-contract.mjs';
// Explicit operator/customer upgrade tool. Never reads .env, rotates credentials,
// bootstraps an owner, or contacts a provider unless invoked with exact inputs.
import {readFileSync,writeFileSync,renameSync,existsSync,unlinkSync,mkdtempSync,rmdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {buildRelease} from './build-platform-release.mjs';
import {planMigrations,migrationEnvelope} from './byo-support-release.mjs';
import {outsideRepos,nativeCliCandidates,checkedCli} from './setup-byo.mjs';
import {validShopProject,validClientId} from './byo-identity.mjs';
export class UpgradeError extends Error {}
const root=resolve(import.meta.dirname,'..'),literal=s=>"'"+String(s).replaceAll("'","''")+"'";
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
export async function verifyPlatformPublicKey(ref,key,fetcher=fetch){
 const invalid=()=>new UpgradeError('Public Platform publishable or legacy anon key required; privileged or wrong-project keys are forbidden.');
 if(!/^[a-z]{20}$/.test(ref||'')||typeof key!=='string'||key.length>4096)throw invalid();
 if(!/^sb_publishable_[A-Za-z0-9_-]{1,256}$/.test(key)){
  try{
   if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(key))throw invalid();
   const [header,claims]=key.split('.').slice(0,2).map(s=>JSON.parse(Buffer.from(s,'base64url').toString()));
   if(header?.alg!=='HS256'||claims?.role!=='anon'||claims?.ref!==ref)throw invalid();
  }catch{throw invalid();}
 }
 // Neither a prefix nor decoded claims authenticate a key. The exact project's
 // API gateway must accept it before any clearance token is sent. No redirects.
 try{
  const r=await fetcher(`https://${ref}.supabase.co/auth/v1/settings`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(25000),headers:{apikey:key,Accept:'application/json'}});
  if(r.status!==200||r.redirected){await r.body?.cancel();throw Error();}
  const settings=await r.json();
  if(!settings||!settings.external||typeof settings.external!=='object'||Array.isArray(settings.external))throw Error();
 }catch{throw new UpgradeError('Public Platform key could not be verified for the exact Platform project. Keep the original clearance and journal; no customer write was started.');}
}
export function upgradePlan(history,release,source,count,resuming=false){
 if(!source||!Number.isInteger(source.migrations)||(!resuming&&history.length!==source.migrations))throw new UpgradeError('Declared source package does not match history; manual provenance review required.');
 return planMigrations(history,release,'existing',count);
}
export async function upgradeStep(j,save,name,work){
 if(j.steps[name]==='passed')return;
 if(['running','unknown'].includes(j.steps[name]))throw new UpgradeError('Unknown provider step requires reviewed completion attestation; no write was repeated.');
 j.steps[name]='running';save();
 try{await work();j.steps[name]='passed';save()}catch{j.steps[name]='unknown';save();throw new UpgradeError('Provider outcome unknown. Retain this original journal and review the recorded step.');}
}
export async function upgradeBackend(argv,deps={}){
 const o={};for(let i=0;i<argv.length;i++){const k=argv[i];if(['--apply','--review'].includes(k)){o[k]=true;continue}if(!['--mode','--project-ref','--client-id','--from-sha','--journal','--cli','--report','--approval-file','--platform-project-ref'].includes(k)||o[k]||!argv[i+1])throw new UpgradeError('Invalid upgrade arguments');o[k]=argv[++i]}
 const ref=o['--project-ref'],client=Number(o['--client-id']);
 if(o['--mode']!=='byo')throw new UpgradeError('Managed upgrades require the live Master Platform approval and bounded execution workflow.');
 if(!validShopProject(ref)||!validClientId(String(client))||!o['--journal']||!o['--from-sha']||Boolean(o['--apply'])===Boolean(o['--review']))throw new UpgradeError('Specify exact BYO project/client, source, private journal and review OR apply.');
 const manifest=JSON.parse(readFileSync(join(root,'scripts/byo-release-manifest.json'),'utf8')),release=buildRelease(root,{support:true}),plan=installationPlan(release,o['--mode']);
 if(manifest.sha256!==release.sha256||manifest.review_status!=='approved-shared')throw new UpgradeError('Completed source differs from the approved shared release. No upgrade allowed.');
 const catalog=JSON.parse(readFileSync(join(root,'scripts/backend-release-catalog.json'),'utf8')),source=catalog[o['--from-sha']];
 if(!source?.supported)throw new UpgradeError('Unapproved or superseded source release; manual provenance review required.');
 const path=outsideRepos(o['--journal']),old=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;
 const identity={mode:o['--mode'],project:ref,client,source:o['--from-sha'],target:release.sha256};
 if(old&&Object.keys(identity).some(k=>old[k]!==identity[k]))throw new UpgradeError('Original upgrade target/source changed; keep the original journal.');
 let approval;
 if(o['--apply']){
  if(!o['--approval-file']||!/^[a-z]{20}$/.test(o['--platform-project-ref']||'')||o['--platform-project-ref']===ref)throw new UpgradeError('A separate private Master clearance file and exact Platform project are required before any customer write.');
  const approvalPath=outsideRepos(o['--approval-file']);if(approvalPath===path)throw new UpgradeError('Clearance and journal must be different files.');
  approval=JSON.parse(readFileSync(approvalPath,'utf8'));
  if(approval.contract!=='retrasell-byo-upgrade-clearance-v1'||approval.platform_url!==`https://${o['--platform-project-ref']}.supabase.co`||!uuid(approval.request_id)||!/^[a-f0-9]{64}$/.test(approval.token||'')||approval.plan_sha256!==await digest(approval.plan)||approval.plan.source_sha256!==identity.source||approval.plan.target_sha256!==identity.target||approval.plan.client_id!==client||approval.plan.project_ref!==ref)throw new UpgradeError('Exact original source/target clearance required.');
  if(old&&(old.request_id!==approval.request_id||old.plan_sha256!==approval.plan_sha256))throw new UpgradeError('The original journal cannot be replaced by a different request or plan.');
  await verifyPlatformPublicKey(o['--platform-project-ref'],approval.platform_public_key,deps.fetch||fetch);
 }
 const j=old||{contract:'retrasell-backend-upgrade-v2',...identity,request_id:approval?.request_id||randomUUID(),plan_sha256:approval?.plan_sha256,steps:{}};
 const lock=path+'.lock';let locked=false;const terminal=createInterface({input:process.stdin,output:process.stdout});
 const save=()=>{writeFileSync(path+'.tmp',JSON.stringify(j,null,2)+'\n',{mode:0o600,flush:true});renameSync(path+'.tmp',path)};
 try{
  writeFileSync(lock,'Upgrade process owns this lock. Confirm it stopped before removing a stale lock.\n',{flag:'wx',mode:0o600});locked=true;
  let query,deploy,listFunctions;
  if(o['--mode']==='byo'){
   const cli=o['--cli']||nativeCliCandidates()[0];if(!cli||/\.(cmd|bat|ps1)$/i.test(cli))throw new UpgradeError('Native customer Supabase CLI required.');
   const invoke=deps.invoke||(a=>{const r=spawnSync(cli,a,{cwd:root,encoding:'utf8',windowsHide:true,shell:false,timeout:60000,maxBuffer:8e6});if(r.error||r.status!==0)throw new UpgradeError('Customer CLI operation failed; provider output suppressed.');return r.stdout});
   checkedCli(cli,(_cli,args)=>invoke(args));
   if(!JSON.parse(invoke(['projects','list','--output','json'])).some(p=>p.id===ref))throw new UpgradeError('Customer account cannot see the exact project.');
   query=deps.query||(async sql=>{const dir=mkdtempSync(join(tmpdir(),'retrasell-upgrade-')),file=join(dir,'query.sql');try{writeFileSync(file,sql,{mode:0o600});const data=JSON.parse(invoke(['db','query','--linked','--project-ref',ref,'--file',file,'--output-format','json']));return Array.isArray(data)?data:data.rows}finally{unlinkSync(file);rmdirSync(dir)}});
   listFunctions=async()=>JSON.parse(invoke(['functions','list','--project-ref',ref,'--output','json']));
   deploy=async fn=>invoke(['functions','deploy',fn.name,'--project-ref',ref,'--use-api',...(fn.verify_jwt?[]:['--no-verify-jwt'])]);
  }
  const observe=async()=>{
   const shop=(await query(shopUpgradeQuery))?.[0],migrations=await query(migrationEvidenceQuery),functions=(await listFunctions()).map(f=>({name:f.slug||f.name,present:true,verify_jwt:f.verify_jwt,source_sha256:null}));
   const runtime=(await query('select public.bridge_runtime_preflight() as runtime'))?.[0]?.runtime;
   return {shop,migrations,functions,origin:'customer-local-cli',runtime_ready:runtime?.owner_account==='active'&&Object.keys(runtime?.checks||{}).length>0&&Object.values(runtime.checks).every(v=>v===true)};
  };
  const observation=await observe(),binding={project_ref:ref,client_id:client,source_id:observation.shop?.source_id,client_binding:observation.shop?.client_binding};
  if(!o['--apply']){
   const assessment={contract:'retrasell-byo-upgrade-assessment-v1',...binding,source_sha256:identity.source,target_sha256:identity.target,observation};
   assessment.plan=makeUpgradePlan({sha256:identity.source,migrations:source.migration_manifest,functions:source.function_manifest},release,source,Object.values(catalog).find(c=>c.release_id===manifest.release_id),observation,binding);
   if(o['--report'])writeFileSync(outsideRepos(o['--report']),JSON.stringify(assessment,null,2)+'\n',{flag:'wx',mode:0o600});
   (deps.report||console.log)(JSON.stringify(assessment,null,2));return assessment;
  }
  if(Object.keys(binding).some(k=>approval.plan[k]!==binding[k]))throw new UpgradeError('Exact original source binding changed.');
  const platform=deps.platform||(async(action,fields={})=>{const r=await (deps.fetch||fetch)(approval.platform_url+'/functions/v1/platform-upgrade',{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{apikey:approval.platform_public_key,'Content-Type':'application/json','x-retrasell-upgrade-token':approval.token},body:JSON.stringify({action,request_id:j.request_id,...fields})});if(!r.ok){await r.body?.cancel();throw new UpgradeError('Original Platform clearance or pending-operation gate refused this action.');}return (await r.json()).job;});
  const answer=deps.confirm?await deps.confirm():await terminal.question(`Type UPGRADE ${ref} ${release.sha256} to authorize only this approved package: `);
  if(answer!==`UPGRADE ${ref} ${release.sha256}`)throw new UpgradeError('Customer did not approve the exact upgrade.');
  save();
  for(;;){
   j.state='claiming';save();const job=await platform('customer-claim');
   if(!job||job.mode!=='byo'||job.state!=='running'||!uuid(job.invocation)||job.request_id!==j.request_id||job.client_id!==client||job.project_ref!==ref||job.source_sha256!==identity.source||job.target_sha256!==release.sha256||job.source_id!==binding.source_id||job.client_binding!==binding.client_binding||job.plan_sha256!==approval.plan_sha256||await digest(job.plan)!==approval.plan_sha256)throw new UpgradeError('Original Platform plan or binding changed. Retain the original journal.');
   j.state='running';save();
   const command=async(kind,args={})=>{const result=await platform('customer-command',{invocation:job.invocation,kind,args});if(result?.state){j.state=result.state;j.steps=result.steps;j.unknown_step=result.unknown_step;save();}return result;};
   const inspect=async()=>{await command('check');if(buildRelease(root,{support:true}).sha256!==release.sha256)throw new UpgradeError('Local source changed after approval.');requireShopReady({shop:(await query(shopUpgradeQuery))?.[0]},binding);requireUpgradeProgress(release,job.plan,await query(migrationEvidenceQuery),job.steps);};
   const result=await executeUpgrade(job,release,{command,inspect,migrate:async m=>{await query(migrationEnvelope(m));const h=await query(migrationEvidenceQuery);if(!h.some(x=>x.version===m.version&&x.name===m.name&&x.sha256===m.sha256))throw new UpgradeError('Original SQL read-back incomplete.');},deploy:async f=>{await deploy(f);const list=await listFunctions();if(!list.some(g=>(g.slug||g.name)===f.name&&g.verify_jwt===f.verify_jwt))throw new UpgradeError('Gateway read-back incomplete.');},verify:async()=>verifyUpgradeResult(release,await observe(),binding)});
   (deps.report||console.log)(`Original upgrade ${j.request_id}: ${result.state}`);
   if(result.state==='paused')continue;
   (deps.report||console.log)('Components recorded; deployed-source review and hosted acceptance remain pending.');return result;
  }
 }finally{terminal.close();if(locked)unlinkSync(lock)}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))upgradeBackend(process.argv.slice(2)).catch(error=>{console.error(error instanceof UpgradeError?error.message:'Upgrade stopped. Retain the original private journal. Review exact identity/history, gateway configuration or the recorded unknown step; no provider output or credentials are disclosed.');process.exitCode=1});
