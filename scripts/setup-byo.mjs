// Customer-local coordinator. Platform never receives CLI authority or private settings.
import {existsSync,readFileSync,writeFileSync,renameSync,unlinkSync,mkdirSync,readdirSync,realpathSync} from 'node:fs';
import {resolve,join,relative,isAbsolute,sep,dirname} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {buildRelease} from './build-platform-release.mjs';
import {parseEnv} from './byo-setup.mjs';
import {runByoRelease} from './byo-support-release.mjs';
const root=resolve(import.meta.dirname,'..'),sha=x=>createHash('sha256').update(x).digest('hex');
export function outsideRepos(path){
 const absolute=resolve(path),physical=existsSync(absolute)?realpathSync(absolute):join(realpathSync(dirname(absolute)),absolute.split(/[\\/]/).at(-1));
 for(const repo of [root,resolve(root,'../orbito')]){const rel=relative(existsSync(repo)?realpathSync(repo):repo,physical);if(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep))throw Error('Keep setup files outside both repositories.');}return absolute;
}
export function nativeCliCandidates(env=process.env,home=homedir()){
 const executable=process.platform==='win32'?'supabase.exe':'supabase',candidates=(env.PATH||'').split(sep==='\\'?';':':').filter(Boolean).map(p=>join(p,executable));
 const cache=env.npm_config_cache|| (process.platform==='win32'?join(env.LOCALAPPDATA||join(home,'AppData','Local'),'npm-cache'):join(home,'.npm'));
 const npx=join(cache,'_npx');
 if(existsSync(npx))for(const entry of readdirSync(npx,{withFileTypes:true}).filter(e=>e.isDirectory())){
  const modules=join(npx,entry.name,'node_modules');
  candidates.push(join(modules,'supabase','bin',executable));
  const scoped=join(modules,'@supabase');if(existsSync(scoped))for(const pkg of readdirSync(scoped))if(pkg.startsWith('cli-'))candidates.push(join(scoped,pkg,'bin',executable));
 }
 return [...new Set(candidates)].filter(p=>existsSync(p)&&! /\.(cmd|bat|ps1)$/i.test(p));
}
export function checkedCli(cli,invoke){
 const version=invoke(cli,['--version']).trim();if(!/\b2\.\d+\.\d+\b/.test(version))throw Error('A supported native Supabase CLI v2 is required.');
 for(const [args,flags] of [[['db','query','--help'],['--linked','--project-ref','--file','--output-format']],[['functions','deploy','--help'],['--use-api']],[['secrets','set','--help'],['--env-file']]]){
  const help=invoke(cli,args);if(flags.some(f=>!help.includes(f)))throw Error('CLI lacks required capabilities.');
 }return version;
}
export function guardedInvoke(journal,save,invoke,report=()=>{}){
 return argv=>{
  const write=(argv[0]==='secrets'&&argv[1]==='set'&&!argv.includes('--help'))||(argv[0]==='functions'&&argv[1]==='deploy'&&!argv.includes('--help'));
  if(!write)return invoke(argv); // Migration retries reconcile atomically under the SQL advisory lock.
  const key=argv[0]+':'+(argv[0]==='functions'?argv[2]:sha(argv.join('\0')).slice(0,16));
  const old=journal.steps[key];
  if(old==='passed'){report('Retained completed step: '+key);return '';}
  if(old==='running'||old==='unknown')throw Error('Needs intervention: '+key+'. Review provider completion before confirming this step; no write was repeated.');
  journal.state='Installing';journal.steps[key]='running';save();report('Installing '+key);
  try{const out=invoke(argv);journal.steps[key]='passed';save();return out;}
  catch{journal.steps[key]='unknown';journal.state='Needs intervention';save();throw Error('Outcome unknown for '+key+'. Keep the same files and review the provider; no automatic repeat.');}
 };
}
export async function setupByo(args,deps={}){
 const opt={};for(let i=0;i<args.length;i++){
  if(['--status','--help','--enroll','--record-acceptance'].includes(args[i])){opt[args[i]]=true;continue;}
  if(!['--journal','--pairing-file','--runtime-file','--cli','--mode','--config','--confirm-provider-complete'].includes(args[i])||!args[i+1]||opt[args[i]])throw Error('Unknown or duplicate setup option.');opt[args[i]]=args[++i];
 }
 const report=deps.report||console.log;
 if(opt['--help']){report('Run node scripts/setup-byo.mjs from the reviewed Shop checkout. Prompts select private files, verify exact project/package and require named-target authorization. Optional --journal PRIVATE_JSON resumes; --status reads only that local journal. --enroll continues after owner onboarding with a public Support target file. Unknown provider writes require review, then --confirm-provider-complete STEP. Never use a real project for failure tests.');return;}
 const rl=deps.ask?null:createInterface({input:process.stdin,output:process.stdout});
 const ask=deps.ask||(q=>rl.question(q+' '));
 const invoke=deps.invoke||((exe,argv)=>{const r=spawnSync(exe,argv,{cwd:root,encoding:'utf8',shell:false,windowsHide:true,timeout:180000,maxBuffer:8e6});if(r.error||r.status!==0)throw Error('CLI failed; provider output suppressed.');return r.stdout;});
 let lock,ownsLock=false;
 try{
  const journalPath=outsideRepos(opt['--journal']||await ask('Private journal path outside both repositories (reuse this path to resume):'));
  let journal=existsSync(journalPath)?JSON.parse(readFileSync(journalPath,'utf8')):null;
  if(opt['--status']){if(!journal)throw Error('No setup journal exists.');report(JSON.stringify({project:journal.project,client:journal.client,release:journal.release,state:journal.state,steps:journal.steps,acceptance:journal.acceptance},null,2));return journal;}
  if(journal&&(journal.contract!=='retrasell-byo-setup-v1'||! /^[a-z]{20}$/.test(journal.project)||typeof journal.steps!=='object'))throw Error('Invalid local journal.');
  lock=journalPath+'.lock';writeFileSync(lock,'Setup is running. If interrupted, first confirm the previous process has stopped before removing this lock.\n',{flag:'wx',mode:0o600});ownsLock=true;
  const save=()=>{writeFileSync(journalPath+'.tmp',JSON.stringify(journal,null,2)+'\n',{mode:0o600,flush:true});renameSync(journalPath+'.tmp',journalPath);};
  const pair=outsideRepos(opt['--pairing-file']||journal?.pairing||await ask('Private pairing file path:'));
  const runtime=outsideRepos(opt['--runtime-file']||journal?.runtime||await ask('Private runtime file path containing TURNSTILE_SECRET (values will not be displayed):'));
  const pairing=parseEnv(readFileSync(pair,'utf8'),['PLATFORM_BRIDGE_CALL_SECRET','PLATFORM_BRIDGE_SOURCE_SECRET','PLATFORM_BRIDGE_ENDPOINT']);
  const project=pairing.metadata['project-ref'],client=pairing.metadata['client-id'];
  if(!/^[a-z]{20}$/.test(project||'')||! /^[2-9][0-9]*$|^1[0-9]+$/.test(client||''))throw Error('Exact customer pairing metadata required.');
  const release=buildRelease(root,{support:true});
  const manifest=JSON.parse(readFileSync(join(import.meta.dirname,'byo-release-manifest.json'),'utf8'));
  if(manifest.sha256!==release.sha256||manifest.migrations!==release.migrations.length||manifest.functions!==release.functions.length)throw Error('Checkout differs from the versioned setup package. Review source and manifest before any installation.');
  if(journal&&(journal.project!==project||journal.client!==client||journal.release!==release.sha256||journal.pairing!==pair||journal.runtime!==runtime))throw Error('Setup target, release or original files changed. Review the original operation; no writes allowed.');
  if(journal?.state==='Completed'){report('Completed (owner-reported hosted acceptance). Use --status to review the local receipt.');return journal;}
  journal||={contract:'retrasell-byo-setup-v1',project,client,release:release.sha256,pairing:pair,runtime,mode:opt['--mode']||await ask('Installation mode: fresh or existing?'),state:'Preflight',steps:{}};
  if(opt['--mode']&&opt['--mode']!==journal.mode)throw Error('Cannot change the saved installation mode.');save();
  let cli=opt['--cli'];if(cli)checkedCli(cli,invoke);else for(const candidate of nativeCliCandidates()){try{checkedCli(candidate,invoke);cli=candidate;break;}catch{}}
  if(!cli)throw Error('Compatible native Supabase CLI not found. Install the official CLI and sign in to the customer account, then resume.');
  const guarded=guardedInvoke(journal,save,argv=>invoke(cli,argv),report);
  const core=deps.run||runByoRelease,coreDeps={invoke:guarded,release,report};
  if(opt['--record-acceptance']){
   if(journal.state!=='Support enrollment pending'||!journal.supportTarget||!journal.supportInstalled)throw Error('Complete owner onboarding and the hash handoff first.');
   const ticket=await ask('After Platform verification/enabling and a successful Shop ticket → Platform resolution → Shop refresh, enter the public test-ticket UUID:');
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticket)||await ask(`Type ACCEPT ${project} to record your hosted acceptance (owner-reported, not machine verified):`)!==`ACCEPT ${project}`)throw Error('Hosted acceptance not confirmed.');
   journal.state='Completed';journal.acceptance={kind:'owner-reported',ticket,recorded_at:new Date().toISOString()};save();report('Completed: owner-reported hosted ticket acceptance recorded locally.');return journal;
  }
  let observation;
  if(['Runtime verified','Waiting for owner','Waiting for onboarding','Support enrollment pending'].includes(journal.state)){
   observation=await core(['--phase','status','--project-ref',project,'--release-sha',release.sha256,'--cli',cli],coreDeps);
   if(observation?.platform_client_id!=null&&String(observation.platform_client_id)!==client)throw Error('Observed Shop belongs to another client.');
   if(observation?.client_binding!=null&&observation.client_binding!=='orbito-client-'+client)throw Error('Observed Shop binding changed.');
   journal.state=observation?.owner_account!=='active'?'Waiting for owner':!observation.onboarded?'Waiting for onboarding':'Support enrollment pending';save();
   if(!opt['--enroll']||journal.state!=='Support enrollment pending'){report(journal.state+'. Complete the current secure Platform/Shop owner step, then resume this journal.');return journal;}
  }
  if(opt['--confirm-provider-complete']){
   const step=opt['--confirm-provider-complete'];if(!['running','unknown'].includes(journal.steps[step]))throw Error('No unresolved provider step with that identity.');
   if(await ask(`After reviewing the provider for ${project}, type CONFIRM ${project} ${step}:`)!==`CONFIRM ${project} ${step}`)throw Error('Provider completion not confirmed.');
   journal.steps[step]='passed';journal.state='Preflight';save();
  }
  const common=['--phase',opt['--enroll']?'enroll':'install','--mode',journal.mode,'--project-ref',project,'--release-sha',release.sha256,'--cli',cli];
  if(opt['--enroll']){
   const config=outsideRepos(opt['--config']||journal.config||join(dirname(journalPath),'support-target-'+project+'.json'));
   if(!existsSync(config)){
    observation||=await core(['--phase','status','--project-ref',project,'--release-sha',release.sha256,'--cli',cli],coreDeps);
    if(observation?.owner_account!=='active'||!observation.onboarded||String(observation.platform_client_id)!==client||observation.client_binding!=='orbito-client-'+client)throw Error('Confirmed owner, completed onboarding and exact binding required.');
    const target={platform_ref:new URL(pairing.values.PLATFORM_BRIDGE_ENDPOINT).hostname.split('.')[0],project_ref:project,client_id:Number(client),source_id:observation.source_id,client_binding:observation.client_binding,request_id:randomUUID(),pairing_mode:'byo',scopes:['ticket:create','ticket:read']};
    writeFileSync(config,JSON.stringify(target,null,2)+'\n',{flag:'wx',mode:0o600,flush:true});report('Public Support target prepared locally with a stable request identity.');
   }
   const c=JSON.parse(readFileSync(config,'utf8'));if(c.project_ref!==project||String(c.client_id)!==client)throw Error('Support target differs from pairing.');
   const target=JSON.stringify(Object.fromEntries(['project_ref','platform_ref','client_id','source_id','client_binding','request_id','scopes'].map(k=>[k,c[k]])));
   if(journal.supportTarget&&journal.supportTarget!==target)throw Error('Support enrollment identity changed. Retain the original request.');journal.supportTarget=target;
   if(journal.config&&journal.config!==config)throw Error('Retain the original Support target file.');journal.config=config;save();
   const supportFile=join(dirname(journalPath),'support-'+project+'.env');
   const supportStep='secrets:'+sha(['secrets','set','--project-ref',project,'--env-file',supportFile].join('\0')).slice(0,16);
   if(journal.steps[supportStep]&&!existsSync(supportFile))throw Error('Original private Support settings are missing. Do not generate a replacement for this operation.');
   common.push('--config',config,'--support-file',supportFile,'--enrollment-file',join(dirname(journalPath),'support-'+project+'-handoff.json'));
  }else common.push('--pairing-file',pair,'--runtime-file',runtime);
  await core(common,coreDeps);journal.state=opt['--enroll']?'Support enrollment pending':'Ready for installation';save();
  report(`Target: Client #${client} / ${project}. Mode: ${journal.mode}. Exact local release: ${release.sha256}. This checkout may be an unpromoted review candidate; verify its approval before continuing.`);
  if(await ask(`To authorize the displayed package for this named target, type INSTALL ${project}:`)!==`INSTALL ${project}`){report('Stopped after preflight; no installation writes authorized.');return journal;}
  journal.state='Installing';save();await core([...common,'--apply'],coreDeps);
  journal.state=opt['--enroll']?'Support enrollment pending':'Runtime verified';save();
  if(opt['--enroll']){journal.supportInstalled=true;save();report('Hash handoff: '+join(dirname(journalPath),'support-'+project+'-handoff.json')+'. Share only this handoff and the public target, never the private settings.');}
  report(opt['--enroll']?'Give only the hash handoff and public target to Platform Master for Prepare → verify → enable. Final hosted ticket acceptance is still required.':'Runtime verified. In Platform reserve the owner, create their confirmed Shop Auth account, check activation, then complete the existing six onboarding steps. Resume this journal with --enroll afterward.');
  return journal;
 }catch(e){throw e;}finally{rl?.close();if(ownsLock&&existsSync(lock))unlinkSync(lock);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))setupByo(process.argv.slice(2)).catch(e=>{console.error(e.message.startsWith('Needs intervention')||e.message.startsWith('Outcome unknown')?e.message:'Setup stopped. Check the exact target, retained files and local journal. Credentials and raw provider output are suppressed.');process.exitCode=1;});
