// Owner-operated optional Support installation. Never executes from a browser.
// The customer's CLI retains its own Management authorization; Platform never receives it.
import {readFileSync,writeFileSync,realpathSync,existsSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function validateConfig(c){
 if(!c||Object.keys(c).some(k=>!['platform_ref','project_ref','client_id','source_id','client_binding','shop_public_api_key','request_id','pairing_mode','scopes'].includes(k))
  || ![c.platform_ref,c.project_ref].every(v=>/^[a-z]{20}$/.test(v))||c.platform_ref===c.project_ref
  || c.project_ref==='kxmovywgshyltwusghhj'||!Number.isSafeInteger(c.client_id)||c.client_id<=1
  || ![c.source_id,c.request_id].every(v=>/^[0-9a-f-]{36}$/i.test(v||''))
  || !['managed','byo'].includes(c.pairing_mode)||typeof c.client_binding!=='string'||!c.client_binding||c.client_binding.length>200
  || !Array.isArray(c.scopes)||!c.scopes.length||c.scopes.some(s=>!['ticket:create','ticket:read'].includes(s)))throw Error('Invalid exact Support target configuration.');
 return c;
}
export function supportEnv(text,c){
 const values={};for(const line of text.trim().split(/\r?\n/)){const m=/^(PLATFORM_SUPPORT_TICKETS_SECRET|PLATFORM_SUPPORT_TICKETS_ENDPOINT)=(\S+)$/.exec(line);if(!m||values[m[1]])throw Error('Invalid private Support settings.');values[m[1]]=m[2];}
 if(!/^[a-f0-9]{64}$/.test(values.PLATFORM_SUPPORT_TICKETS_SECRET||'')||values.PLATFORM_SUPPORT_TICKETS_ENDPOINT!==`https://${c.platform_ref}.supabase.co/functions/v1/platform-support-tickets`)throw Error('Support settings do not match the target.');
 return values;
}
function privatePath(p){
 const candidate=resolve(p),root=resolve(import.meta.dirname,'..');
 for(const repo of [root,resolve(root,'../orbito')]){const rel=relative(repo,candidate);if(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep))throw Error('Keep Support credentials outside both repositories.');}
 // Resolve existing parent/file paths too; a symlink must not bypass this check.
 const physical=existsSync(candidate)?realpathSync(candidate):resolve(realpathSync(resolve(candidate,'..')),candidate.split(/[\\/]/).at(-1));
 for(const repo of [root,resolve(root,'../orbito')]){const base=existsSync(repo)?realpathSync(repo):repo;const rel=relative(base,physical);if(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep))throw Error('Private path resolves inside a repository.');}
 return candidate;
}
export async function runSupportSetup(args,deps={}){
 if(args.includes('--help')||!args.length){console.log('Support setup: --config PUBLIC_JSON --action generate|export|prepare|install|verify|status|revoke [--runtime-file PRIVATE_ENV] [--enrollment-file PRIVATE_JSON] [--cli ABSOLUTE_EXE] [--apply]\nConfig: exact platform_ref, project_ref, client_id, source_id, client_binding, public anon shop_public_api_key, stable request_id, pairing_mode, scopes. Master actions read SUPPORT_MASTER_ACCESS_TOKEN and PLATFORM_PUBLIC_API_KEY only from the current process environment. BYO export creates a hash-only enrollment file for a separate Platform operator; the secret and customer Management authority stay local. --apply authorizes remote changes. No SQL or onboarding is replayed.');return;}
 const opt={};for(let i=0;i<args.length;i++){const k=args[i];if(k==='--apply'){opt.apply=true;continue;}if(!['--config','--action','--runtime-file','--enrollment-file','--cli'].includes(k)||!args[i+1]||opt[k])throw Error('Invalid Support setup options.');opt[k]=args[++i];}
 const c=validateConfig(JSON.parse(readFileSync(opt['--config'],'utf8'))),action=opt['--action'];
 if(!['generate','export','prepare','install','verify','status','revoke'].includes(action))throw Error('Choose an explicit Support action.');
 const runtime=opt['--runtime-file']?privatePath(opt['--runtime-file']):null;
 if(action==='generate'){
  if(c.pairing_mode!=='byo'||!runtime)throw Error('BYO private runtime path required.');
  writeFileSync(runtime,`PLATFORM_SUPPORT_TICKETS_SECRET=${randomBytes(32).toString('hex')}\nPLATFORM_SUPPORT_TICKETS_ENDPOINT=https://${c.platform_ref}.supabase.co/functions/v1/platform-support-tickets\n`,{flag:'wx',mode:0o600});
  console.log('Private Support settings generated. Retain the file for uncertain installation recovery; do not share or commit it.');return;
 }
 const enrollment=opt['--enrollment-file']?privatePath(opt['--enrollment-file']):null;
 if(action==='export'){
  if(c.pairing_mode!=='byo'||!runtime||!enrollment)throw Error('BYO runtime and separate enrollment paths required.');
  const secret=supportEnv(readFileSync(runtime,'utf8'),c).PLATFORM_SUPPORT_TICKETS_SECRET;
  writeFileSync(enrollment,JSON.stringify({request_id:c.request_id,project_ref:c.project_ref,client_id:c.client_id,source_id:c.source_id,client_binding:c.client_binding,secret_sha256:createHash('sha256').update(secret).digest('hex')})+'\n',{flag:'wx',mode:0o600});
  console.log('Hash-only enrollment file created for the Platform operator. Secret settings and customer Management authorization stay local.');return;
 }
 if(action!=='status'&&!opt.apply)throw Error('Review the exact target and pass --apply to authorize this remote action.');
 if(action==='install'&&c.pairing_mode==='byo'){
  if(!runtime)throw Error('Private runtime file required.');supportEnv(readFileSync(runtime,'utf8'),c);
  const cli=opt['--cli'];if(!cli||!isAbsolute(cli)||!cli.endsWith('.exe'))throw Error('Use an absolute installed Supabase executable.');
  const invoke=deps.invoke||(argv=>{const r=spawnSync(cli,argv,{encoding:'utf8',windowsHide:true,timeout:120000});if(r.status!==0)throw Error('CLI operation failed or is uncertain. Retry this same private file and request identity; provider output is suppressed.');return r.stdout;});
  if(!invoke(['secrets','set','--help']).includes('--env-file'))throw Error('CLI lacks env-file support.');
  invoke(['secrets','set','--project-ref',c.project_ref,'--env-file',runtime]);console.log('Support settings installed. Master capability verification is still required.');return;
 }
 const token=process.env.SUPPORT_MASTER_ACCESS_TOKEN,key=process.env.PLATFORM_PUBLIC_API_KEY;
 if(!token||!key)throw Error('Current canonical Master access token and Platform public API key required in process environment.');
 const body={action,client_id:c.client_id,request_id:c.request_id};
 if(action==='prepare'){
  body.data={project_ref:c.project_ref,source_id:c.source_id,client_binding:c.client_binding,shop_public_api_key:c.shop_public_api_key,scopes:c.scopes};
  if(c.pairing_mode==='byo'){
   if(enrollment){const approved=JSON.parse(readFileSync(enrollment,'utf8'));
    if(Object.keys(approved).some(k=>!['request_id','project_ref','client_id','source_id','client_binding','secret_sha256'].includes(k))||['request_id','project_ref','client_id','source_id','client_binding'].some(k=>approved[k]!==c[k])||!/^[a-f0-9]{64}$/.test(approved.secret_sha256||''))throw Error('Hash enrollment does not match the exact reviewed target.');
    body.data.secret_sha256=approved.secret_sha256;
   }else{if(!runtime)throw Error('BYO runtime or hash-only enrollment file required.');body.data.secret_sha256=createHash('sha256').update(supportEnv(readFileSync(runtime,'utf8'),c).PLATFORM_SUPPORT_TICKETS_SECRET).digest('hex');}
  }
 }
 const r=await fetch(`https://${c.platform_ref}.supabase.co/functions/v1/platform-support-enrollment`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok){await r.body?.cancel();throw Error(`Support ${action} failed or is uncertain (HTTP ${r.status}). Retry the same enrollment request; never generate a replacement key to reconcile.`);}
 const result=await r.json();console.log(JSON.stringify(Object.fromEntries(['request_id','key_id','enabled','revoked','project_ref','installed','installation_state'].filter(k=>Object.hasOwn(result,k)).map(k=>[k,result[k]]))));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runSupportSetup(process.argv.slice(2)).catch(()=>{console.error('Support setup stopped. Check reviewed target, authorization, CLI and retained request identity. Raw errors and credentials are suppressed.');process.exitCode=1;});
