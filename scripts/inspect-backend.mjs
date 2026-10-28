// Customer-authorized READ ONLY CLI diagnostic. No credentials/files are collected.
import {readFileSync,writeFileSync,mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {outsideRepos,findNativeCli} from './setup-byo.mjs';
import {validShopProject,validClientId} from './byo-identity.mjs';
import {customerReleasePreflight} from './release-preflight.mjs';
import {assessBackend} from './backend-inventory.ts';
const root=resolve(import.meta.dirname,'..');
export async function inspectBackend(argv,deps={}){
 if(argv.length===1&&argv[0]==='--help'){(deps.report||console.log)('Read-only customer CLI: --project-ref REF --client-id ID [--cli NATIVE_EXE] [--report NEW_EXTERNAL_JSON]. No migration, function deployment, credential transfer or automatic upgrade is performed.');return;}
 const o={};for(let n=0;n<argv.length;n++){const k=argv[n];if(!['--project-ref','--client-id','--cli','--report'].includes(k)||o[k]||!argv[n+1])throw Error('Use --project-ref REF --client-id ID [--cli NATIVE_EXE] [--report NEW_EXTERNAL_JSON]');o[k]=argv[++n];}
 const ref=o['--project-ref'];if(!validShopProject(ref)||!validClientId(o['--client-id']))throw Error('Exact customer Shop project/client required');
 const {manifest,catalog:catalogObject}=customerReleasePreflight(root);
 const execute=deps.execute||((cli,args)=>{const r=spawnSync(cli,args,{cwd:root,encoding:'utf8',windowsHide:true,shell:false,timeout:30000,maxBuffer:2e6});if(r.error||r.status!==0)throw Error(args[0]==='projects'?'Supabase project access could not be read. Run supabase login with the customer account, then supabase projects list --output json. Never substitute another accessible project.':'Read-only CLI inspection failed. Verify native Supabase CLI capabilities and customer authorization; provider output is suppressed.');return r.stdout;});
 const cli=findNativeCli(o['--cli'],execute);
 const projects=JSON.parse(execute(cli,['projects','list','--output','json']));if(!Array.isArray(projects)||!projects.some(p=>p.id===ref))throw Error('Customer CLI cannot inspect this exact Shop. Sign in with the customer account or obtain project authorization. Never substitute the Platform or Managed project.');
 const query=deps.query||(sql=>{const dir=mkdtempSync(join(tmpdir(),'retrasell-inspect-')),file=join(dir,'read.sql');try{writeFileSync(file,sql,{mode:0o600});const result=JSON.parse(execute(cli,['db','query','--linked','--project-ref',ref,'--file',file,'--output-format','json']));if(Array.isArray(result))return result;if(Array.isArray(result.rows))return result.rows;throw Error('Unrecognized query response');}finally{unlinkSync(file);rmdirSync(dir);}});
 const identity=query('select sc.platform_client_id,bc.source_id,bc.client_binding from public.shop_config sc cross join app_private.bridge_config bc where sc.id=1 and bc.singleton')?.[0];
 if(identity?.platform_client_id!==Number(o['--client-id'])||!identity.source_id||!identity.client_binding)throw Error('Exact paired Shop identity could not be established');
 const catalog=Object.entries(catalogObject).map(([sha256,r])=>({...r,sha256,approved_for_new:r.release_id===manifest.release_id})),packages=Object.fromEntries(catalog.map(c=>[c.release_id,{migrations:c.migration_manifest,functions:c.function_manifest,...(c.release_id===manifest.release_id?{requirements:JSON.parse(readFileSync(join(root,'scripts/backend-requirements.json'),'utf8'))}:{})}]));
 const observation={origin:'customer-authorized-cli',limitations:['Local report; not independently received or trusted by Platform. No provider source-package comparison is available.']};
 try{observation.migrations=query("select version,name,encode(extensions.digest(replace(array_to_string(statements,E'\\n'),E'\\r\\n',E'\\n'),'sha256'),'hex') as sha256 from supabase_migrations.schema_migrations order by version");}catch{observation.limitations.push('Migration evidence unavailable');}
 try{const exists=query("select to_regprocedure('public.shop_backend_capabilities()') is not null as present")[0]?.present;if(exists){const c=query('select public.shop_backend_capabilities() as capabilities')[0]?.capabilities;observation.capabilities=c.capabilities;observation.runtime=c.runtime;}}catch{observation.limitations.push('Restricted structural capability evidence unavailable');}
 try{const deployed=JSON.parse(execute(cli,['functions','list','--project-ref',ref,'--output','json']));if(!Array.isArray(deployed))throw Error();const functions=packages[manifest.release_id].functions;observation.functions=functions.map(f=>{const d=deployed.find(d=>(d.slug||d.name)===f.name);return {name:f.name,present:!!d,verify_jwt:d?.verify_jwt,source_sha256:null};});}catch{observation.limitations.push('Provider function inventory unavailable');}
 const report={project_ref:ref,client_id:Number(o['--client-id']),source_id:identity.source_id,client_binding:identity.client_binding,read_only:true,...assessBackend(catalog,packages,observation)};
 if(o['--report'])writeFileSync(outsideRepos(o['--report']),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 (deps.report||console.log)(JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))inspectBackend(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1});
