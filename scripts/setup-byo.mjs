// Customer-local coordinator. Platform never receives CLI authority or private settings.
import {existsSync,readFileSync,writeFileSync,renameSync,unlinkSync,mkdirSync,readdirSync,realpathSync} from 'node:fs';
import {resolve,join,relative,isAbsolute,sep,dirname} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {buildRelease} from './build-platform-release.mjs';
import {parseEnv,SetupError} from './byo-setup.mjs';
import {ConfigurationError,validatePublicConfig,validateTurnstileSecret} from './byo-public-config.mjs';
import {runByoRelease} from './byo-support-release.mjs';
import {validClientId,validShopProject} from './byo-identity.mjs';
import {InstallerError,attachDiagnostic,diagnosticFor} from './byo-diagnostics.mjs';
const root=resolve(import.meta.dirname,'..'),sha=x=>createHash('sha256').update(x).digest('hex');
function providerWriteState(j){
 if(!j)return 'none';
 if(Object.values(j.steps||{}).some(s=>s==='unknown'||s==='running')||['Installing','Needs intervention'].includes(j.state))return 'possible';
 if(Object.values(j.steps||{}).some(s=>s==='passed')||['Runtime verified','Waiting for owner','Waiting for onboarding','Support enrollment pending','Completed'].includes(j.state))return 'confirmed';
 return ['Preflight','Ready for installation'].includes(j.state)?'none':'possible';
}
export function outsideRepos(path){
 if(!existsSync(dirname(resolve(path))))throw new ConfigurationError('Private output folder is unavailable. Create a restricted folder outside both repositories, then reuse the original journal and filenames.');
 const absolute=resolve(path),physical=existsSync(absolute)?realpathSync(absolute):join(realpathSync(dirname(absolute)),absolute.split(/[\\/]/).at(-1));
 for(const repo of [root,resolve(root,'../orbito')]){const rel=relative(existsSync(repo)?realpathSync(repo):repo,physical);if(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep))throw Error('Keep setup files outside both repositories.');}return absolute;
}
export function nativeCliCandidates(env=process.env,home=homedir()){
 const executable=process.platform==='win32'?'supabase.exe':'supabase',candidates=(env.PATH||env.Path||'').split(sep==='\\'?';':':').filter(Boolean).map(p=>join(p,executable));
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
 if(/\.(cmd|bat|ps1)$/i.test(cli))throw new ConfigurationError('Use the native Supabase executable rather than a shell wrapper.');
 const version=invoke(cli,['--version']).trim();if(!/\b2\.\d+\.\d+\b/.test(version))throw Error('A supported native Supabase CLI v2 is required.');
 for(const [args,flags] of [[['db','query','--help'],['--linked','--project-ref','--file','--output-format']],[['functions','deploy','--help'],['--use-api']],[['secrets','set','--help'],['--env-file']]]){
  const help=invoke(cli,args);if(flags.some(f=>!help.includes(f)))throw Error('CLI lacks required capabilities.');
 }return version;
}
export function findNativeCli(override,invoke,candidates=nativeCliCandidates()){
 if(override){try{checkedCli(override,invoke);return override;}catch(error){if(error instanceof ConfigurationError)throw error;throw new ConfigurationError('The explicit native CLI lacks required supported capabilities. Update it through the official Scoop bucket and run supabase --version; do not use a shell wrapper.');}}
 for(const candidate of candidates){try{checkedCli(candidate,invoke);return candidate;}catch{}}
 throw new ConfigurationError('Native Supabase CLI with required capabilities was not found. Install via the official Scoop bucket, reopen PowerShell, then run supabase --version. If installed, repair PATH or use --cli with the native executable. Do not use a shell wrapper.');
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
  if(['--status','--help','--login','--enroll','--record-acceptance'].includes(args[i])){opt[args[i]]=true;continue;}
  if(!['--journal','--pairing-file','--runtime-file','--public-config','--client-id','--project-ref','--acceptance','--provider-reference','--cli','--mode','--config','--confirm-provider-complete'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||opt[args[i]])throw new InstallerError('configuration');opt[args[i]]=args[++i];
 }
 const report=deps.report||console.log;
 if(opt['--help']){report('Run node scripts/setup-byo.mjs from the reviewed Shop checkout. --login discovers native Supabase CLI and starts customer-account login. --client-id ID --project-ref REF independently bind the intended Platform target to pairing metadata (prompted for new operations if omitted). Select --mode fresh|existing explicitly. --journal PRIVATE_JSON retains the original operation; --pairing-file PRIVATE_ENV --runtime-file PRIVATE_ENV --public-config PUBLIC_JSON select separate files outside both repositories. Preflight checks exact target/package and Turnstile separation before named INSTALL authorization. Backend preflight is not CAPTCHA proof. --status reads only the local journal. --record-acceptance --acceptance core records owner-reported core acceptance without Support. Optional --enroll continues after owner onboarding; --record-acceptance --acceptance support records separate ticket acceptance. Retain original files and request identities. Unknown provider writes require authoritative completion review, then --confirm-provider-complete STEP --provider-reference PUBLIC_RECEIPT_ID and named confirmation; never guess completion. See docs/BYO_GUIDED_SETUP.md. Never use a real project for failure tests.');return;}
 const rl=deps.ask?null:createInterface({input:process.stdin,output:process.stdout});
 const ask=deps.ask||(q=>rl.question(q+' '));
 const invoke=deps.invoke||((exe,argv)=>{const r=spawnSync(exe,argv,{cwd:root,encoding:'utf8',shell:false,windowsHide:true,timeout:180000,maxBuffer:8e6});if(r.error||r.status!==0)throw new InstallerError(argv[0]==='projects'?'cli_authorization':argv[0]==='--version'||argv.includes('--help')?'cli_unavailable':'provider');return r.stdout;});
 let lock,ownsLock=false;
 const diagnosticContext={phase:'journal',checks:[],writes:'none',journalExists:false};
 try{
  if(opt['--login']){
   let selected=opt['--cli'];if(selected)checkedCli(selected,invoke);else for(const candidate of nativeCliCandidates()){try{checkedCli(candidate,invoke);selected=candidate;break;}catch{}}
   if(!selected)throw new ConfigurationError('Native Supabase CLI is unavailable. Install with Scoop from the official Supabase bucket, reopen PowerShell and run supabase --version; repair PATH before retrying login.');
   report('Sign in only with the customer-owned Supabase account. No account token is sent to Platform or saved in the setup journal.');
   if(deps.invoke)invoke(selected,['login']);else{const result=spawnSync(selected,['login'],{cwd:root,stdio:'inherit',shell:false,windowsHide:true});if(result.error||result.status!==0)throw new ConfigurationError('Customer CLI login did not complete. Retry --login in an interactive terminal.');}
   return;
  }
  const journalPath=outsideRepos(opt['--journal']||await ask('Private journal path outside both repositories (reuse this path to resume):'));
  diagnosticContext.journalExists=existsSync(journalPath);
  diagnosticContext.writes=diagnosticContext.journalExists?'possible':'none';
  let journal=existsSync(journalPath)?JSON.parse(readFileSync(journalPath,'utf8')):null;
  diagnosticContext.writes=providerWriteState(journal);
  if(opt['--status']){
   if(!journal||journal.contract!=='retrasell-byo-setup-v1'||!validShopProject(journal.project)||!validClientId(journal.client)||!/^[a-f0-9]{64}$/.test(journal.release||''))throw new InstallerError('journal');
   const states=['Preflight','Installing','Ready for installation','Runtime verified','Waiting for owner','Waiting for onboarding','Support enrollment pending','Needs intervention','Completed'];
   const steps=Object.fromEntries(Object.entries(journal.steps||{}).filter(([k,v])=>/^(?:functions:[a-z-]{1,40}|secrets:[a-f0-9]{16})$/.test(k)&&['running','unknown','passed'].includes(v)));
   report(JSON.stringify({project:journal.project,client:journal.client,release:journal.release,state:states.includes(journal.state)?journal.state:'Needs intervention',steps,core_acceptance:journal.coreAcceptance?.kind==='owner-reported'?'owner-reported':'not recorded',support_acceptance:journal.acceptance?.kind==='owner-reported'?'owner-reported':'not recorded'},null,2));return journal;
  }
  if(journal&&(journal.contract!=='retrasell-byo-setup-v1'||!validShopProject(journal.project)||!validClientId(journal.client)||!journal.steps||typeof journal.steps!=='object'||Array.isArray(journal.steps)))throw new InstallerError('journal');
  lock=journalPath+'.lock';writeFileSync(lock,'Setup is running. If interrupted, first confirm the previous process has stopped before removing this lock.\n',{flag:'wx',mode:0o600});ownsLock=true;
  const save=()=>{writeFileSync(journalPath+'.tmp',JSON.stringify(journal,null,2)+'\n',{mode:0o600,flush:true});renameSync(journalPath+'.tmp',journalPath);};
  diagnosticContext.checks.push('journal');diagnosticContext.phase='configuration';
  const pair=outsideRepos(opt['--pairing-file']||journal?.pairing||await ask('Private pairing file path:'));
  const runtime=outsideRepos(opt['--runtime-file']||journal?.runtime||await ask('Private runtime file path containing TURNSTILE_SECRET (values will not be displayed):'));
  const pairing=parseEnv(readFileSync(pair,'utf8'),['PLATFORM_BRIDGE_CALL_SECRET','PLATFORM_BRIDGE_SOURCE_SECRET','PLATFORM_BRIDGE_ENDPOINT']);
  const project=pairing.metadata['project-ref'],client=pairing.metadata['client-id'];
  diagnosticContext.phase='pairing_identity';
  if(!validShopProject(project)||!validClientId(client))throw new InstallerError('identity');
  const intendedClient=opt['--client-id']||journal?.client||await ask('Intended Client ID from the Platform wizard (independent of this file):');
  const intendedProject=opt['--project-ref']||journal?.project||await ask('Intended Shop project ref from the Platform wizard:');
  if(!validClientId(intendedClient)||String(intendedClient)!==client||intendedProject!==project)throw new InstallerError('identity');
  diagnosticContext.checks.push('pairing_identity');diagnosticContext.phase='release';
  const release=buildRelease(root,{support:true});
  const manifest=JSON.parse(readFileSync(join(import.meta.dirname,'byo-release-manifest.json'),'utf8'));
  if(manifest.sha256!==release.sha256||manifest.migrations!==release.migrations.length||manifest.functions!==release.functions.length)throw Error('Checkout differs from the versioned setup package. Review source and manifest before any installation.');
  if(journal&&journal.release!==release.sha256)throw new InstallerError('release');
  if(journal&&(journal.project!==project||journal.client!==client||journal.pairing!==pair||journal.runtime!==runtime))throw new InstallerError('identity');
  diagnosticContext.checks.push('release');diagnosticContext.phase='journal';
  if(journal?.state==='Completed'){report('Completed (owner-reported hosted acceptance). Use --status to review the local receipt.');return journal;}
  journal||={contract:'retrasell-byo-setup-v1',project,client,release:release.sha256,pairing:pair,runtime,mode:opt['--mode']||await ask('Installation mode: fresh or existing?'),state:'Preflight',steps:{}};
  if(!['fresh','existing'].includes(journal.mode))throw new InstallerError('mode');
  diagnosticContext.writes=providerWriteState(journal);
  if(opt['--mode']&&opt['--mode']!==journal.mode)throw new InstallerError('mode');save();diagnosticContext.journalExists=true;diagnosticContext.phase='public_configuration';
  // Older journals may continue owner/Support reconciliation unchanged. Every
  // base install now requires the explicit public input before any provider write.
  let publicPath=opt['--public-config']||journal.publicConfig;
  if(!opt['--enroll']&&!opt['--record-acceptance']&&!['Runtime verified','Waiting for owner','Waiting for onboarding','Support enrollment pending'].includes(journal.state)){
   publicPath=outsideRepos(publicPath||await ask('Public frontend JSON path (three public fields only; used to compare the Turnstile site key):'));
   let publicConfig;try{publicConfig=JSON.parse(readFileSync(publicPath,'utf8'))}catch{throw new ConfigurationError('Cannot read the public frontend JSON. Save the three public fields as valid JSON at the supplied path.');}
   validatePublicConfig(publicConfig,project);
   const runtimeConfig=parseEnv(readFileSync(runtime,'utf8'),['TURNSTILE_SECRET','PLATFORM_SUPABASE_URL','PLATFORM_SUPABASE_ANON','PLATFORM_AUTH_EMAIL','PLATFORM_SUPPORT_TICKETS_ENDPOINT','PLATFORM_SUPPORT_TICKETS_SECRET']);
   validateTurnstileSecret(runtimeConfig.values.TURNSTILE_SECRET,publicConfig.VITE_TURNSTILE_SITE_KEY);
   const publicHash=sha(JSON.stringify(publicConfig));
   if(journal.publicConfig&&(journal.publicConfig!==publicPath||journal.publicConfigSha256!==publicHash))throw new ConfigurationError('Public configuration changed during this operation. Restore the reviewed file and reconcile the original journal before installing.');
   journal.publicConfig=publicPath;journal.publicConfigSha256=publicHash;save();diagnosticContext.checks.push('public_configuration');
   report('Static public target and Turnstile separation checked. Real browser CAPTCHA verification remains pending.');
  }
  diagnosticContext.phase='cli';
  let cli=opt['--cli'];if(cli)checkedCli(cli,invoke);else for(const candidate of nativeCliCandidates()){try{checkedCli(candidate,invoke);cli=candidate;break;}catch{}}
  if(!cli)throw new InstallerError('cli_unavailable');diagnosticContext.checks.push('cli');
  const guarded=guardedInvoke(journal,save,argv=>invoke(cli,argv),report);
  const core=deps.run||runByoRelease,coreDeps={invoke:guarded,release,report};
  if(opt['--record-acceptance']){
   if(opt['--acceptance']&&!['core','support'].includes(opt['--acceptance']))throw new InstallerError('configuration');
   if(opt['--acceptance']==='core'||(!opt['--acceptance']&&!journal.supportInstalled)){
    diagnosticContext.phase='owner_onboarding';
    const observed=await core(['--phase','status','--project-ref',project,'--release-sha',release.sha256,'--cli',cli],coreDeps);
    if(observed?.owner_account!=='active'||!observed.onboarded||String(observed.platform_client_id)!==client||observed.client_binding!=='orbito-client-'+client)throw new InstallerError('prerequisites');
    if(await ask(`After checking the independent frontend, real CAPTCHA login and six-step completion, type CORE ACCEPT ${project} to record owner-reported core acceptance (Support optional):`)!==`CORE ACCEPT ${project}`)throw new InstallerError('cancelled');
    journal.coreAcceptance={kind:'owner-reported',scope:'core',recorded_at:new Date().toISOString()};save();report('Core acceptance recorded locally as owner-reported. Support is optional and is not verified by this receipt. --enroll may be performed separately later.');return journal;
   }
   if(journal.state!=='Support enrollment pending'||!journal.supportTarget||!journal.supportInstalled)throw Error('Complete owner onboarding and the hash handoff first.');
   const ticket=await ask('After Platform verification/enabling and a successful Shop ticket → Platform resolution → Shop refresh, enter the public test-ticket UUID:');
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticket)||await ask(`Type ACCEPT ${project} to record your hosted acceptance (owner-reported, not machine verified):`)!==`ACCEPT ${project}`)throw Error('Hosted acceptance not confirmed.');
   journal.state='Completed';journal.acceptance={kind:'owner-reported',ticket,recorded_at:new Date().toISOString()};save();report('Completed: owner-reported hosted ticket acceptance recorded locally.');return journal;
  }
  let observation;
  diagnosticContext.phase='owner_onboarding';
  if(['Runtime verified','Waiting for owner','Waiting for onboarding','Support enrollment pending'].includes(journal.state)){
   observation=await core(['--phase','status','--project-ref',project,'--release-sha',release.sha256,'--cli',cli],coreDeps);
   if(observation?.platform_client_id!=null&&String(observation.platform_client_id)!==client)throw Error('Observed Shop belongs to another client.');
   if(observation?.client_binding!=null&&observation.client_binding!=='orbito-client-'+client)throw Error('Observed Shop binding changed.');
   journal.state=observation?.owner_account!=='active'?'Waiting for owner':!observation.onboarded?'Waiting for onboarding':'Support enrollment pending';save();
   if(!opt['--enroll']||journal.state!=='Support enrollment pending'){report(journal.state+'. Complete the current secure Platform/Shop owner step, then resume this journal.');return journal;}
  }
  if(opt['--confirm-provider-complete']){
   const step=opt['--confirm-provider-complete'];if(!['running','unknown'].includes(journal.steps[step]))throw Error('No unresolved provider step with that identity.');
   if(!/^(?:functions:[a-z-]{1,40}|secrets:[a-f0-9]{16})$/.test(step))throw new InstallerError('journal');
   const reference=opt['--provider-reference']||await ask('Public provider completion receipt ID (5–100 letters/numbers/hyphens only; no credential, file content or URL). Enter only after authoritative provider review:');
   if(!/^[A-Za-z0-9][A-Za-z0-9-]{4,99}$/.test(reference))throw new InstallerError('interrupted');
   if(await ask(`After reviewing the provider for ${project}, type CONFIRM ${project} ${step}:`)!==`CONFIRM ${project} ${step}`)throw Error('Provider completion not confirmed.');
   journal.reconciliations||={};journal.reconciliations[step]={kind:'operator-provider-completion-attestation',reference,recorded_at:new Date().toISOString()};
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
  }else{common.push('--pairing-file',pair,'--runtime-file',runtime);if(publicPath)common.push('--public-config',publicPath);}
  diagnosticContext.phase='preflight';
  await core(common,coreDeps);diagnosticContext.checks.push('preflight');journal.state=opt['--enroll']?'Support enrollment pending':'Ready for installation';save();
  report(`Target: Client #${client} / ${project}. Mode: ${journal.mode}. Exact local release: ${release.sha256}. This checkout may be an unpromoted review candidate; verify its approval before continuing.`);
  if(await ask(`To authorize the displayed package for this named target, type INSTALL ${project}:`)!==`INSTALL ${project}`){report('Stopped after preflight; no installation writes authorized.');return journal;}
  diagnosticContext.phase='installation';diagnosticContext.writes='possible';
  journal.state='Installing';save();await core([...common,'--apply'],coreDeps);diagnosticContext.writes='confirmed';diagnosticContext.checks.push('installation');
  journal.state=opt['--enroll']?'Support enrollment pending':'Runtime verified';save();
  if(opt['--enroll']){journal.supportInstalled=true;save();report('Hash handoff: '+join(dirname(journalPath),'support-'+project+'-handoff.json')+'. Share only this handoff and the public target, never the private settings.');}
  report(opt['--enroll']?'Give only the hash handoff and public target to Platform Master for Prepare → verify → enable. Final hosted ticket acceptance is still required.':'Backend runtime preflight verified; CAPTCHA is NOT browser verified. Build and deploy using the same public JSON. In Platform reserve the owner, create their confirmed Shop Auth account, check activation, then complete the existing six onboarding steps using real CAPTCHA. Retain the pairing file securely; resume this journal with --enroll afterward.');
  return journal;
 }catch(e){throw attachDiagnostic(e,diagnosticContext);}finally{rl?.close();try{if(ownsLock&&existsSync(lock))unlinkSync(lock)}catch{throw attachDiagnostic(new InstallerError('journal'),{...diagnosticContext,phase:'journal'})}}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))setupByo(process.argv.slice(2)).catch(e=>{console.error(JSON.stringify(e.diagnostic||diagnosticFor(e),null,2));process.exitCode=1;});
