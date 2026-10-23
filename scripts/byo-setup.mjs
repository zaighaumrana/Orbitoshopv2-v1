import {installationPlan} from './backend-plan.mjs';
import {buildRelease} from './build-platform-release.mjs';
import {readFileSync,unlinkSync,realpathSync,statSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {ConfigurationError,validatePublicConfig,validateTurnstileSecret} from './byo-public-config.mjs';
import {validClientId,validShopProject} from './byo-identity.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');

const REQUIRED=['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','database_reachable','bridge_configuration','edge_functions','runtime_configuration','authentication'];
const TICKETS=['PLATFORM_SUPPORT_TICKETS_ENDPOINT','PLATFORM_SUPPORT_TICKETS_SECRET'];
const SUPPORT=['PLATFORM_SUPABASE_URL','PLATFORM_SUPABASE_ANON','PLATFORM_AUTH_EMAIL'];
export class SetupError extends Error {}
function fail(message){throw new SetupError(message)}
export function parseEnv(text,allowed){
 const values={},metadata={};
 for(const line of text.split(/\r?\n/)){
  if(!line.trim())continue;
  if(line.startsWith('#')){const match=/^# orbito-([a-z-]+): (.+)$/.exec(line);if(match)metadata[match[1]]=match[2];continue;}
  const match=/^([A-Z][A-Z0-9_]*)=(.+)$/.exec(line);
  if(!match || !allowed.includes(match[1]) || Object.hasOwn(values,match[1]) || /[\x00-\x1f]/.test(match[2]))fail('Invalid or unapproved environment entry. Use only the documented names; values are never printed.');
  values[match[1]]=match[2];
 }
 return {values,metadata};
}
export function validateInputs(ref,pairing,runtime,publicConfig){
 if(!validShopProject(ref))fail('Choose the exact eligible customer project; historical protected projects are excluded.');
 if(pairing.metadata['project-ref']!==ref || !validClientId(pairing.metadata['client-id']))fail('Pairing file target metadata does not match this customer/project. Compare the original Platform package; do not regenerate it to bypass a mismatch.');
 const p=pairing.values;
 if(!/^[a-f0-9]{64}$/.test(p.PLATFORM_BRIDGE_CALL_SECRET||'')||!/^[a-f0-9]{64}$/.test(p.PLATFORM_BRIDGE_SOURCE_SECRET||'')||p.PLATFORM_BRIDGE_CALL_SECRET===p.PLATFORM_BRIDGE_SOURCE_SECRET)fail('Two valid, distinct bridge credentials are required.');
 let endpoint;try{endpoint=new URL(p.PLATFORM_BRIDGE_ENDPOINT);}catch{fail('Invalid Platform bridge destination.');}
 if(!/^https:\/\/[a-z]{20}\.supabase\.co\/functions\/v1\/platform-bridge$/.test(endpoint.href)||endpoint.hostname===ref+'.supabase.co')fail('Platform and Shop must be different Supabase projects.');
 if(publicConfig)validatePublicConfig(publicConfig,ref);
 validateTurnstileSecret(runtime.values.TURNSTILE_SECRET,publicConfig?.VITE_TURNSTILE_SITE_KEY);
 if([p.PLATFORM_BRIDGE_CALL_SECRET,p.PLATFORM_BRIDGE_SOURCE_SECRET,runtime.values.PLATFORM_SUPPORT_TICKETS_SECRET].filter(Boolean).includes(runtime.values.TURNSTILE_SECRET))fail('TURNSTILE_SECRET must be the private Turnstile widget secret, separate from bridge and Support credentials.');
 const tickets=TICKETS.filter(k=>runtime.values[k]);
 if(tickets.length && (tickets.length!==2 || !/^[a-f0-9]{64}$/.test(runtime.values.PLATFORM_SUPPORT_TICKETS_SECRET||'') || [p.PLATFORM_BRIDGE_CALL_SECRET,p.PLATFORM_BRIDGE_SOURCE_SECRET].includes(runtime.values.PLATFORM_SUPPORT_TICKETS_SECRET) || runtime.values.PLATFORM_SUPPORT_TICKETS_ENDPOINT!==p.PLATFORM_BRIDGE_ENDPOINT.replace('/platform-bridge','/platform-support-tickets')))fail('Optional customer Support requires its distinct dedicated credential and paired Platform endpoint.');
 const support=SUPPORT.filter(k=>runtime.values[k]);if(support.length && support.length!==SUPPORT.length)fail('Optional support login needs all three support settings; omit the group for normal Shop login.');
}
function privateFile(path,root){
 const resolved=realpathSync(resolve(path));
 const inside=base=>{const rel=relative(base,resolved);return !isAbsolute(rel) && rel!=='..' && !rel.startsWith('..'+sep)};
 if(inside(root) || !statSync(resolved).isFile())fail('Save secret files outside the Shop repository.');
 const platformSibling=resolve(root,'../orbito');
 if(inside(platformSibling))fail('Save secret files outside the Platform repository.');
 if(statSync(resolved).size>16384)fail('Environment file is too large.');
 return resolved;
}
function options(args){
 const out={};for(let i=0;i<args.length;i++){
  const key=args[i];if(['--apply','--remove-pairing','--help'].includes(key)){out[key.slice(2)]=true;continue;}
  if(!['--project-ref','--pairing-file','--runtime-file','--public-config','--cli'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))fail('Unknown option or missing setup argument. Run --help.');
  if(Object.hasOwn(out,key.slice(2)))fail('Duplicate setup option.');out[key.slice(2)]=args[++i];
 }return out;
}
export async function runSetup(args,deps={}){
 const opt=options(args),report=deps.report||console.log;
 if(opt.help){report('BYO setup: --project-ref REF --pairing-file PRIVATE_PATH --runtime-file PRIVATE_PATH [--public-config PUBLIC_JSON] [--cli EXECUTABLE] [--apply] [--remove-pairing]\nPrefer node scripts/setup-byo.mjs for the complete provenance-checked migration workflow. This lower-level helper only validates/installs runtime settings and functions after migrations. Public JSON permits public/private Turnstile equality checks. Backend preflight does not prove CAPTCHA: complete a real hosted challenge/login. Keep private pairing through Support enrollment/recovery; --remove-pairing is an explicit final cleanup only. No DB password or customer privileged key is accepted.');return;}
 if(!opt['project-ref']||!opt['pairing-file']||!opt['runtime-file'])fail('Project ref, pairing file and private runtime file are required.');
 const root=deps.root||ROOT;
 const invoke=deps.invoke||((exe,argv)=>{
  const result=spawnSync(exe,argv,{cwd:root,encoding:'utf8',shell:false,windowsHide:true,timeout:180000,maxBuffer:4*1024*1024});
  if(result.error || result.status!==0)fail('Local CLI operation failed. Check authorised project access, CLI installation and migrations. Raw CLI output is suppressed to protect credentials.');
  return result.stdout;
 });
 if(!['feature/onboarding-v2','development','feature/verified-customer-support-shop'].includes(invoke('git',['branch','--show-current']).trim()))fail('Run from a reviewed Shop development/release branch.');
 const file=deps.privateFile||privateFile,pairPath=file(opt['pairing-file'],root),runtimePath=file(opt['runtime-file'],root);
 if(pairPath===runtimePath)fail('Keep pairing and application runtime files separate.');
 const read=deps.read||((path)=>readFileSync(path,'utf8'));
 const pairing=parseEnv(read(pairPath),['PLATFORM_BRIDGE_CALL_SECRET','PLATFORM_BRIDGE_SOURCE_SECRET','PLATFORM_BRIDGE_ENDPOINT']);
 const runtime=parseEnv(read(runtimePath),['TURNSTILE_SECRET',...SUPPORT,...TICKETS]);
 const publicConfig=opt['public-config']?JSON.parse(read(opt['public-config'])):undefined;
 validateInputs(opt['project-ref'],pairing,runtime,publicConfig);
 report('Static Turnstile checks passed. '+(publicConfig?'Public and private values differ.':'Public site key was not supplied; equality has not been checked. Use --public-config PUBLIC_JSON.')+' CAPTCHA remains unverified until a real hosted browser challenge and login succeed.');
 const cli=opt.cli||'supabase';if(/\.(cmd|bat|ps1)$/i.test(cli))fail('Use the Supabase executable, not a shell wrapper.');
 invoke(cli,['--version']);
 const deploymentHelp=invoke(cli,['functions','deploy','--help']);
 const secretHelp=invoke(cli,['secrets','set','--help']);
 if(!deploymentHelp.includes('--use-api')||!secretHelp.includes('--env-file'))fail('Installed Supabase CLI lacks the required setup flags. Update it from the official source.');const projects=JSON.parse(invoke(cli,['projects','list','--output','json']));
 if(!Array.isArray(projects)||!projects.some(p=>p.id===opt['project-ref']))fail('Current Supabase CLI account cannot access the selected Shop project. Obtain temporary authorised project access or use screen sharing.');
 report('PASS: branch, target, separate secret files and project visibility in the current CLI account.');
 if(!opt.apply){report('VALIDATION ONLY: no hosted changes made. After approved full migration release, rerun with --apply.');return;}
 const backend=buildRelease(ROOT,{support:true}),plan=installationPlan(backend,'byo');
 const manifest=JSON.parse(readFileSync(resolve(ROOT,'scripts/byo-release-manifest.json'),'utf8'));
 if(manifest.sha256!==backend.sha256)fail('Approved release manifest differs from this checkout.');
 // Only the authorised local Supabase CLI sees these private files. Never send them to Platform.
 for(const [label,path] of [['application runtime',runtimePath],['bridge pairing',pairPath]]) {
  report('Installing '+label+' settings.');invoke(cli,['secrets','set','--project-ref',opt['project-ref'],'--env-file',path]);
 }
 for(const fn of [...plan.coreFunctions,...(runtime.values.PLATFORM_SUPPORT_TICKETS_SECRET?plan.deferredFunctions:[])]) { report('Deploying '+fn.name+'.');invoke(cli,['functions','deploy',fn.name,'--project-ref',opt['project-ref'],'--use-api',...(fn.verify_jwt?[]:['--no-verify-jwt'])]); }
 report('PASS: required secrets installed and '+(runtime.values.PLATFORM_SUPPORT_TICKETS_SECRET?'seven functions (including customer Support)':'six functions')+' deployed.');
 const fetcher=deps.fetch||fetch;
 const response=await fetcher('https://'+opt['project-ref']+'.supabase.co/functions/v1/platform-bridge',{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+pairing.values.PLATFORM_BRIDGE_CALL_SECRET,'Content-Type':'application/json'},body:'{"operation":"preflight"}',
 });
 if(!response.ok){await response.body?.cancel();fail('FAIL: Shop runtime preflight unavailable. Check the complete migration release and function deployment; pairing file retained.');}
 const result=await response.json();const missing=REQUIRED.filter(k=>result.contract!=='orbito-onboarding-runtime-v1'||result.checks?.[k]!==true);
 if(result.checks?.owner_reservation && result.client_binding!=='orbito-client-'+pairing.metadata['client-id'])fail('FAIL: Shop is bound to a different client; pairing file retained.');
 if(missing.length)fail('FAIL runtime checks: '+missing.join(', ')+'. Fix setup and rerun; pairing file retained.');
 report('PASS: backend runtime preflight only. CAPTCHA secret matching and hostname are NOT verified. Owner reservation and initial config delivery are verified separately by Platform Provision Shop.');
 if(opt['remove-pairing']){(deps.remove||unlinkSync)(pairPath);report('PASS: pairing file removed after successful installation. Verify removal and delete extra downloaded copies.');}
 else report('ACTION: retain the sensitive pairing file securely outside both repositories until Support enrollment and recovery are complete. Then remove extra downloads; preserve the original journal and private runtime settings.');
 report('NEXT: configure public browser variables and deploy the Shop URL; Provision Shop, create the reserved confirmed Auth user, Check Owner Account, then owner login and six-step setup. Verify real CAPTCHA/domain and browser routing.');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runSetup(process.argv.slice(2)).catch(error=>{console.error(error instanceof SetupError||error instanceof ConfigurationError ? error.message : 'Setup stopped. Check local CLI access and migration release. No secret values are printed.');process.exitCode=1;});
}
