// Customer-operated, single-account CLI workflow. No customer PAT, database
// password or service key is accepted by or forwarded to Platform.
import {readFileSync,writeFileSync,mkdtempSync,unlinkSync,rmdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildRelease} from './build-platform-release.mjs';
import {runSetup,parseEnv} from './byo-setup.mjs';
import {runSupportSetup,validateConfig,supportEnv} from './support-setup.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const literal=s=>"'"+s.replaceAll("'","''")+"'";
export function migrationEnvelope(m){return `begin;set local statement_timeout='25s';select pg_advisory_xact_lock(71390461);create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text);do $release$ begin if exists(select 1 from supabase_migrations.schema_migrations where version=${literal(m.version)}) then if not exists(select 1 from supabase_migrations.schema_migrations where version=${literal(m.version)} and name=${literal(m.name)} and encode(extensions.digest(replace(array_to_string(statements,E'\\n'),E'\\r\\n',E'\\n'),'sha256'),'hex')=${literal(m.sha256)}) then raise exception 'Migration source conflict';end if;else execute ${literal(m.sql.replace(/^\s*(begin|commit);\s*$/gmi,''))};insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(m.version)},${literal(m.name)},array[${literal(m.sql)}]);end if;end $release$;commit;`}
export function planMigrations(history,release,mode,tableCount){
 if(!['fresh','existing'].includes(mode)||!Array.isArray(history))throw Error('Explicit fresh/existing mode and valid history required.');
 if(mode==='fresh'&&history.length===0){if(tableCount!==0)throw Error('Existing schema without history requires reviewed adoption.');return release.migrations;}
 if((mode==='existing'&&history.length<32)||history.length>release.migrations.length)throw Error('Incomplete or unexpected migration history.');
 const rows=[...history].sort((a,b)=>a.version.localeCompare(b.version));
 for(let i=0;i<rows.length;i++){const m=release.migrations[i],h=rows[i];if(h.version!==m.version||h.name!==m.name||!Array.isArray(h.statements)||sha(h.statements.join('\n').replaceAll('\r\n','\n'))!==m.sha256)throw Error('Migration source conflict; review adoption before continuing.');}
 return release.migrations.slice(rows.length);
}
export async function runByoRelease(args,deps={}){
 const opt={};for(let i=0;i<args.length;i++){const k=args[i];if(k==='--apply'){opt.apply=true;continue;}if(!['--phase','--mode','--project-ref','--release-sha','--pairing-file','--runtime-file','--public-config','--config','--support-file','--enrollment-file','--cli'].includes(k)||!args[i+1]||opt[k])throw Error('Invalid BYO release option.');opt[k]=args[++i];}
 const ref=opt['--project-ref'],cli=opt['--cli']||'supabase',root=resolve(import.meta.dirname,'..');
 if(!/^[a-z]{20}$/.test(ref||'')||ref==='kxmovywgshyltwusghhj'||/\.(cmd|bat|ps1)$/i.test(cli))throw Error('Explicit customer project and native Supabase CLI required; Client 1 is protected.');
 const invoke=deps.invoke||((argv)=>{const r=spawnSync(cli,argv,{cwd:root,encoding:'utf8',windowsHide:true,shell:false,timeout:180000,maxBuffer:8*1024*1024});if(r.error||r.status!==0)throw Error('CLI failed or outcome is uncertain. Preserve the same files and operation. Provider output is suppressed.');return r.stdout;});
 const report=deps.report||console.log;
 const projects=JSON.parse(invoke(['projects','list','--output','json']));
 if(!projects.some(p=>p.id===ref))throw Error('Customer CLI account cannot access this exact project.');
 const release=deps.release||buildRelease(root,{support:true});
 if(opt['--release-sha']!==release.sha256)throw Error('Customer checkout differs from the owner-approved release fingerprint.');
 const query=sql=>{
  const dir=mkdtempSync(join(tmpdir(),'retrasell-byo-sql-')),file=join(dir,'query.sql');
  try{writeFileSync(file,sql,{mode:0o600});const result=JSON.parse(invoke(['db','query','--linked','--project-ref',ref,'--file',file,'--output-format','json']));if(Array.isArray(result))return result;if(Array.isArray(result?.rows))return result.rows;throw Error('Unrecognized CLI query output.');}
  finally{unlinkSync(file);rmdirSync(dir);}
 };
 if(opt['--phase']==='status'){
  const observed=query("select sc.onboarding_completed_at is not null as onboarded,sc.platform_client_id,bc.client_binding,bc.source_id,(public.bridge_runtime_preflight()->>'owner_account') as owner_account from public.shop_config sc cross join app_private.bridge_config bc where sc.id=1 and bc.singleton")?.[0];
  return observed;
 }else if(opt['--phase']==='install'){
  if(!opt['--pairing-file']||!opt['--runtime-file'])throw Error('Separate private pairing and runtime paths required.');
  // Validate local private files and account BEFORE the first migration write.
  const setupArgs=['--project-ref',ref,'--pairing-file',opt['--pairing-file'],'--runtime-file',opt['--runtime-file'],'--cli',cli];
  if(opt['--public-config'])setupArgs.push('--public-config',opt['--public-config']);
  const setupDeps={invoke:(exe,argv)=>exe==='git'?spawnSync(exe,argv,{cwd:root,encoding:'utf8',windowsHide:true}).stdout:invoke(argv),report,...(deps.fetch?{fetch:deps.fetch}:{})};
  await (deps.setup||runSetup)(setupArgs,setupDeps);
  const ledger=query("select to_regclass('supabase_migrations.schema_migrations') is not null as present");
  const history=ledger?.[0]?.present?query('select version,name,statements from supabase_migrations.schema_migrations order by version'):[];
  const count=query("select count(*)::integer as count from pg_tables where schemaname='public'")?.[0]?.count;
  const missing=planMigrations(history,release,opt['--mode'],count);
  const pairing=parseEnv(readFileSync(opt['--pairing-file'],'utf8'),['PLATFORM_BRIDGE_CALL_SECRET','PLATFORM_BRIDGE_SOURCE_SECRET','PLATFORM_BRIDGE_ENDPOINT']);
  if(opt['--mode']==='existing'){
   const bound=query('select sc.onboarding_version,sc.platform_client_id,bc.client_binding from public.shop_config sc cross join app_private.bridge_config bc where sc.id=1 and bc.singleton')?.[0];
   if(bound?.onboarding_version!==2||String(bound.platform_client_id)!==pairing.metadata['client-id']||bound.client_binding!=='orbito-client-'+pairing.metadata['client-id'])throw Error('Existing Shop binding differs. No adoption or secret replacement is allowed.');
  }else if(history.some(m=>m.name==='onboarding_v2')){
   const current=query('select onboarding_version,platform_client_id from public.shop_config where id=1')?.[0];
   if(current?.onboarding_version!==0||current.platform_client_id!==null)throw Error('Initialized Shop requires the additive existing mode.');
  }
  report('Reviewed release: '+release.sha256+'; missing migrations: '+missing.length+'.');
  if(!opt.apply){report('VALIDATION ONLY. No hosted mutations performed.');return;}
  for(const [i,migration] of missing.entries()){report(`Migration ${i+1}/${missing.length}: ${migration.name}`);query(migrationEnvelope(migration));}
  // Reuse the existing guarded secrets, base runtime and pairing workflow.
  if(opt['--mode']==='fresh'){
   if(release.migrations.some(m=>m.name==='fresh_initialization_guard')&&query('select public.fresh_shop_initialization_context() as context')?.[0]?.context?.pending!==true)throw Error('Fresh Shop provenance is uncertain. No runtime credentials replaced; review the baseline.');
   const state=query('select onboarding_version,onboarding_completed_at,platform_client_id from public.shop_config where id=1')?.[0];
   if(state?.onboarding_version!==0||state.onboarding_completed_at!==null||state.platform_client_id!==null)throw Error('Fresh initialization is not proven. No runtime secrets replaced; owner review is required.');
   await (deps.setup||runSetup)([...setupArgs,'--apply'],setupDeps);
  }
  invoke(['functions','deploy','support-tickets','--project-ref',ref,'--use-api']);
  report('Installed the approved release. In Platform reserve the existing owner, confirm their Shop Auth account, then let the owner complete onboarding. No owner or Shop was reset.');
 }else if(opt['--phase']==='enroll'){
  if(!opt['--config']||!opt['--support-file']||!opt['--enrollment-file'])throw Error('Reviewed public target, private Support settings and separate hash handoff paths required.');
  const c=validateConfig(JSON.parse(readFileSync(opt['--config'],'utf8')));
  if(c.pairing_mode!=='byo'||c.project_ref!==ref)throw Error('Exact BYO target required.');
  const context=query('select public.support_ticket_installation_context() as context')?.[0]?.context;
  if(!context?.ready||context.installation_version!==2||context.platform_client_id!==c.client_id||context.source_id!==c.source_id||context.client_binding!==c.client_binding)throw Error('Confirmed active owner, complete onboarding and exact pairing required.');
  if(!opt.apply){report('VALIDATION ONLY. Customer prerequisites verified; no secrets generated or installed.');return;}
  const common=['--config',opt['--config'],'--runtime-file',opt['--support-file']];
  if(!existsSync(opt['--support-file']))await runSupportSetup([...common,'--action','generate']);
  // Retained file is always reused on an uncertain CLI outcome.
  const secret=supportEnv(readFileSync(opt['--support-file'],'utf8'),c).PLATFORM_SUPPORT_TICKETS_SECRET;
  if(existsSync(opt['--enrollment-file'])){const h=JSON.parse(readFileSync(opt['--enrollment-file'],'utf8'));if(['request_id','project_ref','client_id','source_id','client_binding'].some(k=>h[k]!==c[k])||h.secret_sha256!==sha(secret))throw Error('Existing handoff conflicts; reconcile before any Support secret write.');}
  await runSupportSetup([...common,'--action','install','--cli',resolve(cli),'--apply'],{invoke});
  if(!existsSync(opt['--enrollment-file']))await runSupportSetup([...common,'--action','export','--enrollment-file',opt['--enrollment-file']]);
  else{const h=JSON.parse(readFileSync(opt['--enrollment-file'],'utf8'));if(h.request_id!==c.request_id||h.secret_sha256!==sha(secret))throw Error('Existing handoff conflicts; retain original files and reconcile.');}
  report('Customer installation complete. Transfer ONLY the hash enrollment file and public target to the Platform Master for prepare → verify → enable. Keep the secret and CLI authority local. Open Shop as Support remains a separate managed-only permission.');
 }else throw Error('Choose --phase install or enroll.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runByoRelease(process.argv.slice(2)).catch(()=>{console.error('BYO release stopped. Review target, approved fingerprint, migration history and retained private files. No raw provider output is exposed.');process.exitCode=1;});
