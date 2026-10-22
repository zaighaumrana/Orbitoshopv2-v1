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
import {outsideRepos,nativeCliCandidates} from './setup-byo.mjs';
import {validShopProject,validClientId} from './byo-identity.mjs';
export class UpgradeError extends Error {}
const root=resolve(import.meta.dirname,'..'),literal=s=>"'"+String(s).replaceAll("'","''")+"'";
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
export async function upgradeBackend(argv){
 const o={};for(let i=0;i<argv.length;i++){const k=argv[i];if(['--apply','--review'].includes(k)){o[k]=true;continue}if(!['--mode','--project-ref','--client-id','--from-sha','--journal','--cli','--confirm-provider-complete','--provider-reference'].includes(k)||o[k]||!argv[i+1])throw new UpgradeError('Invalid upgrade arguments');o[k]=argv[++i]}
 const ref=o['--project-ref'],client=Number(o['--client-id']);
 if(!['managed','byo'].includes(o['--mode'])||!validShopProject(ref)||!validClientId(String(client))||!o['--journal']||!o['--from-sha'])throw new UpgradeError('Specify mode, exact customer project/client, approved source fingerprint and original private journal.');
 const manifest=JSON.parse(readFileSync(join(root,'scripts/byo-release-manifest.json'),'utf8')),release=buildRelease(root,{support:true});
 if(manifest.sha256!==release.sha256||manifest.review_status!=='approved-shared')throw new UpgradeError('Completed source differs from the approved shared release. No upgrade allowed.');
 const catalog=JSON.parse(readFileSync(join(root,'scripts/backend-release-catalog.json'),'utf8')),source=catalog[o['--from-sha']];
 if(!source)throw new UpgradeError('Unapproved source release; manual provenance review required.');
 const path=outsideRepos(o['--journal']),old=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;
 const identity={mode:o['--mode'],project:ref,client,source:o['--from-sha'],target:release.sha256};
 if(old&&Object.keys(identity).some(k=>old[k]!==identity[k]))throw new UpgradeError('Original upgrade target/source changed; keep the original journal.');
 const j=old||{contract:'retrasell-backend-upgrade-v1',...identity,request_id:randomUUID(),steps:{}};
 const lock=path+'.lock';let locked=false;const terminal=createInterface({input:process.stdin,output:process.stdout});
 const save=()=>{writeFileSync(path+'.tmp',JSON.stringify(j,null,2)+'\n',{mode:0o600,flush:true});renameSync(path+'.tmp',path)};
 try{
  writeFileSync(lock,'Upgrade process owns this lock. Confirm it stopped before removing a stale lock.\n',{flag:'wx',mode:0o600});locked=true;
  let query,deploy,listFunctions,authorize=async()=>{};
  if(o['--mode']==='byo'){
   const cli=o['--cli']||nativeCliCandidates()[0];if(!cli||/\.(cmd|bat|ps1)$/i.test(cli))throw new UpgradeError('Native customer Supabase CLI required.');
   const invoke=a=>{const r=spawnSync(cli,a,{cwd:root,encoding:'utf8',windowsHide:true,shell:false,timeout:180000,maxBuffer:8e6});if(r.error||r.status!==0)throw new UpgradeError('Customer CLI operation failed; provider output suppressed.');return r.stdout};
   if(!JSON.parse(invoke(['projects','list','--output','json'])).some(p=>p.id===ref))throw new UpgradeError('Customer account cannot see the exact project.');
   query=async sql=>{const dir=mkdtempSync(join(tmpdir(),'retrasell-upgrade-')),file=join(dir,'query.sql');try{writeFileSync(file,sql,{mode:0o600});const data=JSON.parse(invoke(['db','query','--linked','--project-ref',ref,'--file',file,'--output-format','json']));return Array.isArray(data)?data:data.rows}finally{unlinkSync(file);rmdirSync(dir)}};
   listFunctions=async()=>JSON.parse(invoke(['functions','list','--project-ref',ref,'--output','json']));
   deploy=async fn=>invoke(['functions','deploy',fn.name,'--project-ref',ref,'--use-api',...(fn.verify_jwt?[]:['--no-verify-jwt'])]);
  }else{
   const env=process.env,url=env.PLATFORM_URL,key=env.PLATFORM_ANON,jwt=env.PLATFORM_OPERATOR_JWT,token=env.PLATFORM_MANAGEMENT_TOKEN;
   if(!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(url||'')||url===`https://${ref}.supabase.co`||!key||!jwt||!token)throw new UpgradeError('Server/operator-only Platform URL, public anon JWT, live Master bearer and Management authorization are required. Never use browser VITE secrets.');
   const rpc=async(name,args)=>{const r=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:key,Authorization:'Bearer '+jwt,'Content-Type':'application/json'},body:JSON.stringify(args)});if(!r.ok){await r.body?.cancel();throw new UpgradeError('Current Platform authority unavailable')}return r.json()};
   authorize=async()=>{const u=await rpc('platform_operator_identity',{}),d=await rpc('platform_client_operations',{p_client:client});if(u.role!=='master_admin'||!u.session_id||d.client?.id!==client||d.client.pairing_mode!=='managed'||!['Active','Suspended'].includes(d.client.lifecycle_state)||d.client.infrastructure_state!=='present'||d.client.supabase_url!==`https://${ref}.supabase.co`)throw new UpgradeError('Exact active managed target and current Master session required.');};
   const api=async(path,body)=>{await authorize();const r=await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(60000),headers:{Authorization:'Bearer '+token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});if(!r.ok){await r.body?.cancel();throw new UpgradeError('Management outcome unavailable; provider response suppressed.')}const text=await r.text();return text?JSON.parse(text):null};
   if((await api(''))?.id!==ref)throw new UpgradeError('Managed project identity mismatch');
   query=sql=>api('/database/query',{query:sql});listFunctions=()=>api('/functions');
   deploy=fn=>{const data=new FormData();for(const f of fn.files)data.append('file',new Blob([f.content],{type:'application/typescript'}),f.path);data.append('metadata',JSON.stringify({name:fn.name,entrypoint_path:fn.entrypoint,verify_jwt:fn.verify_jwt}));return api('/functions/deploy?slug='+fn.name,data)};
  }
  const inspect=async()=>{
   const rows=await query("select s.onboarding_version,s.onboarding_completed_at,s.platform_client_id,s.suspended,b.client_binding,b.source_id,o.payload->>'request_id' as owner_request,(public.bridge_runtime_preflight()->>'owner_account') as owner_account from public.shop_config s cross join app_private.bridge_config b left join app_private.owner_bootstrap o on o.singleton where s.id=1 and b.singleton");
   const r=rows?.[0];if(rows?.length!==1||r.onboarding_version!==2||r.platform_client_id!==client||r.client_binding!==`orbito-client-${client}`||!r.source_id||!r.owner_request||r.owner_account!=='active'||!r.onboarding_completed_at||r.suspended)throw new UpgradeError('Exact active owner/onboarding/source binding required; historical state needs manual review.');return r;
  };
  const before=await inspect();if(old?.binding&&old.binding!==JSON.stringify(before))throw new UpgradeError('Original owner/source snapshot changed.');j.binding=JSON.stringify(before);
  const history=await query('select version,name,statements from supabase_migrations.schema_migrations order by version');
  const missing=upgradePlan(history,release,source,1,Boolean(old));
  const functions=await listFunctions();if(!Array.isArray(functions))throw new UpgradeError('Function inventory unavailable.');
  for(const fn of functions){const desired=release.functions.find(f=>f.name===(fn.slug||fn.name));if(desired&&fn.verify_jwt!==desired.verify_jwt)throw new UpgradeError('Existing gateway setting differs; manual compatibility review required.');}
  console.log(JSON.stringify({review_only:!o['--apply'],mode:identity.mode,project:ref,client,source_release:source.release_id,source_sha256:identity.source,target_release:manifest.release_id,target_sha256:identity.target,missing_migrations:missing.map(m=>m.version),functions:release.functions.map(f=>({name:f.name,verify_jwt:f.verify_jwt})),request_id:j.request_id}));
  if(!o['--apply'])return;
  if(await terminal.question(`Type UPGRADE ${ref} ${release.sha256} to authorize only this additive package: `)!==`UPGRADE ${ref} ${release.sha256}`)throw new UpgradeError('Upgrade not authorized.');
  save();
  if(o['--confirm-provider-complete']){
   const step=o['--confirm-provider-complete'],receipt=o['--provider-reference'];if(!['unknown','running'].includes(j.steps[step])||!/^function:[a-z-]+$/.test(step)||!/^[A-Za-z0-9-]{5,100}$/.test(receipt||''))throw new UpgradeError('Original unknown function step and public provider completion reference required.');
   if(await terminal.question(`After authoritative source/gateway completion review, type CONFIRM ${ref} ${step}: `)!==`CONFIRM ${ref} ${step}`)throw new UpgradeError('Provider completion not confirmed.');
   j.attestations={...(j.attestations||{}),[step]:{kind:'operator-reported',reference:receipt,at:new Date().toISOString()}};j.steps[step]='passed';save();
  }
  // Missing SQL runs with atomic ledger verification; a lost commit acknowledgment
  // is reconciled by the next exact history read, never guessed from elapsed time.
  for(const m of missing){await query(migrationEnvelope(m));j.steps['migration:'+m.version]='passed';save()}
  for(const fn of release.functions)await upgradeStep(j,save,'function:'+fn.name,()=>deploy(fn));
  if(JSON.stringify(await inspect())!==JSON.stringify(before))throw new UpgradeError('Owner/source snapshot changed; investigate before acceptance.');
  const gateways=await listFunctions();if(release.functions.some(f=>!gateways.some(g=>(g.slug||g.name)===f.name&&g.verify_jwt===f.verify_jwt)))throw new UpgradeError('Required function/gateway verification incomplete.');
  j.state='Backend upgraded; hosted acceptance pending';save();console.log('PASS: additive backend upgrade recorded. No secrets or owner bootstrap were changed. Real browser/ticket/POS acceptance remains pending.');
 }finally{terminal.close();if(locked)unlinkSync(lock)}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))upgradeBackend(process.argv.slice(2)).catch(error=>{console.error(error instanceof UpgradeError?error.message:'Upgrade stopped. Retain the original private journal. Review exact identity/history, gateway configuration or the recorded unknown step; no provider output or credentials are disclosed.');process.exitCode=1});
