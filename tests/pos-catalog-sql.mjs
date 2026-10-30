// Disposable native PostgreSQL only. Uses real canonical SQL and installer envelopes.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import vm from 'node:vm';
import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {stripTypeScriptTypes} from 'node:module';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
const shop=path.resolve(import.meta.dirname,'..'),platform=path.resolve(process.env.RETRASELL_PLATFORM_SOURCE||path.join(shop,'../orbito')),evidence=process.env.POS_EVIDENCE_DIR;if(!evidence)throw Error('Set POS_EVIDENCE_DIR to an owned external evidence directory.');fs.mkdirSync(evidence,{recursive:true});
const bin=process.env.PG_BIN||'C:/Program Files/PostgreSQL/18/bin',scratch=fs.mkdtempSync(path.join(os.tmpdir(),'retrasell-pos-pg-')),data=path.join(scratch,'data'),port=55439;
const result={kind:'author local native PostgreSQL 18 / synthetic Auth primitives',scratch,port,runs:[],limitations:['No hosted Auth, customer project, Edge deployment or provider API verification.']};
const run=(exe,args,input)=>spawnSync(exe,args,{encoding:'utf8',input,windowsHide:true,maxBuffer:30e6});
const command=(name,args)=>{const r=name==='pg_ctl'?spawnSync(path.join(bin,name+'.exe'),args,{stdio:'ignore',windowsHide:true,timeout:30000}):run(path.join(bin,name+'.exe'),args);if(r.status!==0)throw Error(String(r.stderr||r.stdout||r.error?.message||name+' failed').slice(0,1800));return r.stdout};
function sql(db,input,{fail=false}={}){const r=run(path.join(bin,'psql.exe'),['-X','-q','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','postgres','-d',db,'-At'],input);if(fail){assert.notEqual(r.status,0);return r.stderr.slice(0,500)}if(r.status!==0)throw Error(r.stderr.slice(0,1800));return r.stdout.trim()}
const text=p=>fs.readFileSync(path.join(shop,p),'utf8').replaceAll('\r\n','\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
const v7=JSON.parse(fs.readFileSync(path.join(platform,'supabase/releases/shop-release-support-v7.json')));
const name=fs.readdirSync(path.join(shop,'supabase/migrations')).find(n=>n.includes('pos_catalog_icons_and_device_brands'));
const migration={version:name.split('_')[0],name:name.slice(15,-4),sql:text('supabase/migrations/'+name)};migration.sha256=hash(migration.sql);
const preferenceName=fs.readdirSync(path.join(shop,'supabase/migrations')).find(n=>n.includes('icon_label_preferences'));
const preferenceMigration=preferenceName&&{version:preferenceName.split('_')[0],name:preferenceName.slice(15,-4),sql:text('supabase/migrations/'+preferenceName)};
if(preferenceMigration)preferenceMigration.sha256=hash(preferenceMigration.sql);
const {migrationEnvelope,planMigrations}=await import(pathToFileURL(path.join(shop,'scripts/byo-support-release.mjs')));
const managed=fs.readFileSync(path.join(platform,'supabase/functions/_shared/managed-setup.ts'),'utf8');
const snippet=managed.slice(managed.indexOf('export function managedMigrationQuery'),managed.indexOf('export async function managedPublicEnvironment'));
const managedEnvelope=vm.runInNewContext("const literal=s=>\"'\"+s.replaceAll(\"'\",\"''\")+\"'\";"+stripTypeScriptTypes(snippet.replace('export ',''))+';managedMigrationQuery');
const uid=n=>'90000000-0000-4000-8000-'+String(n).padStart(12,'0');
const actor=(db,n,q,opts={})=>sql(db,`begin;set local role ${opts.role||'authenticated'};select set_config('request.jwt.claim.sub','${uid(n)}',true);select set_config('request.jwt.claims','{"sub":"${uid(n)}","session_id":"${uid(9)}","user_metadata":{"role":"Business Owner"}}',true);${q};rollback;`,opts).split('\n').slice(2).join('\n');
const bootstrap=`create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean default false,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now(),not_after timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
grant usage on schema auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
create schema extensions;create extension pgcrypto with schema extensions;`;
function seed(db){sql(db,`update public.shop_config set repair_module_enabled=true,inventory_module_enabled=true,suspended=false,onboarding_version=2,platform_client_id=42 where id=1;
insert into auth.users(id,email,email_confirmed_at) select ('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'fixture-'||n||'@example.invalid',now() from generate_series(1,5)n;
insert into public.employees(id,name,role,status) values(3,'Manager','Manager','Active'),(4,'Cashier','Cashier','Active'),(5,'Technician','Technician','Active');
insert into public.app_users(auth_user_id,employee_id,email,display_name,role) select u.id,case when n>2 then n end,u.email,'Fixture '||n,case n when 1 then 'Business Owner' when 2 then 'Orbito Support' when 3 then 'Manager' when 4 then 'Cashier' else 'Technician' end from generate_series(1,5)n join auth.users u on u.email='fixture-'||n||'@example.invalid';
insert into public.quick_items(name,prices) values('Legacy Cable','[100]');insert into public.repair_components(name) values('Legacy Screen');
insert into public.tickets(ticket_number,customer_name,device_brand,device_model,status) values('OLD','Synthetic','Keep This Brand','Keep This Model','Delivered');`)}
const digest=db=>sql(db,"select md5((select jsonb_agg(to_jsonb(t))::text from public.tickets t))");
let started=false;
try{
 command('initdb',['-D',data,'-U','postgres','-A','trust','--encoding=UTF8','--locale=C']);
 command('pg_ctl',['-D',data,'-l',path.join(scratch,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
 sql('postgres','create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role authenticator nologin;');
 for(const mode of ['managed','byo'])for(const lifecycle of process.env.POS_SQL_FRESH_ONLY?['fresh']:['fresh','v7-upgrade']){
  const db='pos_'+mode+'_'+lifecycle.replaceAll('-','_'),envelope=mode==='managed'?managedEnvelope:migrationEnvelope,record={mode,lifecycle,result:'RUNNING',checks:[]};result.runs.push(record);
  sql('postgres','create database '+db+' template template0');sql(db,bootstrap);
  sql(db,v7.migrations.map(envelope).join('\n'));
  if(lifecycle==='v7-upgrade')seed(db);let before=digest(db);
  // Simulate a partial stage failure: complete DDL must roll back with its ledger.
  const broken={...migration,version:'20990101000000',sql:migration.sql+'\nselect missing_deliberate_test_function();'};broken.sha256=hash(broken.sql);
  sql(db,envelope(broken),{fail:true});assert.equal(sql(db,"select to_regclass('public.device_brands') is null"),'t');assert.equal(sql(db,"select count(*) from supabase_migrations.schema_migrations where version='20990101000000'"),'0');
  sql(db,envelope(migration));assert.equal(digest(db),before);sql(db,envelope(migration));assert.equal(sql(db,'select count(*) from public.device_brands'),'11');
  if(preferenceMigration){
   const brokenPrefs={...preferenceMigration,version:'20990101000001',sql:preferenceMigration.sql+'\nselect missing_deliberate_test_function();'};brokenPrefs.sha256=hash(brokenPrefs.sql);
   sql(db,envelope(brokenPrefs),{fail:true});assert.equal(sql(db,"select to_regclass('public.icon_preferences') is null"),'t');
   assert.equal(sql(db,"select count(*) from supabase_migrations.schema_migrations where version='20990101000001'"),'0');
   sql(db,envelope(preferenceMigration));sql(db,envelope(preferenceMigration));assert.equal(digest(db),before);
   assert.equal(sql(db,'select count(*) from public.icon_preferences'),'0');
  }
  if(lifecycle==='fresh'){seed(db);before=digest(db)}
  assert.equal(sql(db,"select count(*) from supabase_migrations.schema_migrations"),preferenceMigration?'41':'40');
  assert.equal(actor(db,1,"select public.get_app_config()->'read_contracts'->>'catalog_icons'"),'1');
  assert.equal(sql(db,"select public.shop_backend_capabilities()->'capabilities'->>'catalog-icons-and-brands'"),'true');
  if(preferenceMigration){
   assert.equal(actor(db,1,"select public.get_app_config()->'read_contracts'->>'icon_preferences'"),'1');
   assert.equal(sql(db,"select public.shop_backend_capabilities()->'capabilities'->>'icon-label-preferences'"),'true');
   sql(db,"insert into public.icon_preferences values('accessory.cable','Saved cable',array['catalog','inventory'])");
   assert.match(actor(db,1,"update public.icon_preferences set display_name='Owner cable' returning display_name"),/Owner cable/);
   for(const n of [3,4,5]){
    assert.equal(actor(db,n,'select count(*) from public.icon_preferences'),'1');
    assert.equal(actor(db,n,"with changed as(update public.icon_preferences set display_name='Denied' returning icon_id)select count(*) from changed"),'0');
    actor(db,n,"insert into public.icon_preferences values('repair.battery','Denied',array['repair'])",{fail:true});
   }
   actor(db,1,'select count(*) from public.icon_preferences',{role:'anon',fail:true});
   actor(db,1,'delete from public.icon_preferences',{fail:true});
   for(const q of ["update public.icon_preferences set display_name='   '","update public.icon_preferences set icon_id='https://evil.invalid/x.svg'","update public.icon_preferences set enabled_contexts=array['brands']","update public.icon_preferences set enabled_contexts=array[null]::text[]"]){actor(db,1,q,{fail:true})}
   assert.equal(actor(db,2,'select count(*) from public.icon_preferences'),'0');
   actor(db,2,"insert into public.icon_preferences values('repair.battery','Denied',array['repair'])",{fail:true});
   sql(db,'update public.shop_config set suspended=true where id=1');assert.equal(actor(db,1,'select count(*) from public.icon_preferences'),'0');actor(db,1,'select public.get_app_config()',{fail:true});sql(db,'update public.shop_config set suspended=false where id=1');
   sql(db,envelope(preferenceMigration));assert.equal(sql(db,"select display_name from public.icon_preferences where icon_id='accessory.cable'"),'Saved cable');
  }
  for(const n of [1,3,4,5])assert.equal(actor(db,n,'select count(*) from public.device_brands'),'11');
  for(const n of [1,3])assert.match(actor(db,n,"insert into public.device_brands(display_name) values('Local Custom') returning display_name"),/Local Custom/);
  for(const n of [2,4,5])actor(db,n,"insert into public.device_brands(display_name) values('Forbidden')",{fail:true});
  actor(db,1,'select count(*) from public.device_brands',{role:'anon',fail:true});
  assert.equal(actor(db,2,'select count(*) from public.device_brands'),'0');
  sql(db,`insert into auth.sessions(id,user_id) values('${uid(9)}','${uid(2)}');
update app_private.bridge_config set client_binding='pos-local-fixture' where singleton;
insert into app_private.support_cases(ticket_id,source_id,client_binding,client_id) select '${uid(11)}',source_id,client_binding,42 from app_private.bridge_config where singleton;
insert into app_private.support_consents(id,request_id,ticket_id,purpose,approved_by,expires_at,session_id,support_user_id,platform_actor) values('${uid(12)}','${uid(13)}','${uid(11)}','Local catalog authorization test','${uid(1)}',now()+interval '20 minutes','${uid(9)}','${uid(2)}','${uid(14)}');`);
  assert.equal(actor(db,2,'select count(*) from public.device_brands'),'11');
  assert.match(actor(db,2,"insert into public.device_brands(display_name) values('Consented Support') returning display_name"),/Consented Support/);
  if(preferenceMigration)assert.match(actor(db,2,"update public.icon_preferences set display_name='Consented cable' returning display_name"),/Consented cable/);
  sql(db,'update app_private.support_consents set revoked_at=now()');
  if(preferenceMigration){assert.equal(actor(db,2,'select count(*) from public.icon_preferences'),'0');actor(db,2,'select public.get_app_config()',{fail:true});}
assert.equal(actor(db,2,'select count(*) from public.device_brands'),'0');
  actor(db,1,"insert into public.device_brands(display_name) values('  SAMSUNG  ')",{fail:true});
  actor(db,1,"update public.device_brands set icon_id='https://evil.invalid/x.svg'",{fail:true});
  actor(db,1,"update public.quick_items set icon_id='<svg onload=alert(1)>'",{fail:true});
  actor(db,1,"update public.repair_components set icon_id='brand.apple'",{fail:true});
  assert.equal(actor(db,4,"with changed as(update public.device_brands set enabled=false returning id)select count(*) from changed"),'0');
  sql(db,'update public.shop_config set repair_module_enabled=false where id=1');assert.equal(actor(db,4,'select count(*) from public.device_brands'),'0');sql(db,'update public.shop_config set repair_module_enabled=true where id=1');
  sql(db,'update public.shop_config set suspended=true where id=1');assert.equal(actor(db,1,'select count(*) from public.device_brands'),'0');sql(db,'update public.shop_config set suspended=false where id=1');
  // Check actual normalized uniqueness and historical preservation on inactivation.
  sql(db,"update public.device_brands set enabled=false,display_name='Merchant Apple' where icon_id='brand.apple'");sql(db,envelope(migration));assert.equal(sql(db,"select display_name from public.device_brands where icon_id='brand.apple'"),'Merchant Apple');assert.equal(digest(db),before);
  const history=JSON.parse(sql(db,'select jsonb_agg(to_jsonb(m) order by version) from supabase_migrations.schema_migrations m'));
  assert.equal(planMigrations(history,{migrations:[...v7.migrations,migration,...(preferenceMigration?[preferenceMigration]:[])]},'existing',1).length,0);
  record.result='PASS';record.checks=[preferenceMigration?'41 ordered ledger entries (v8 + preferences)':'40 ordered ledger entries','atomic failed stage rolled back','same-stage replay safe','canonical Owner/Manager write; Cashier/Technician read only','anonymous and unconsented Support denied','module/lifecycle denial','duplicate and malicious icon denial','historical tickets and merchant customization preserved','capability and repeated assessment safe'];
  if(preferenceMigration)record.checks.push('Owner-only icon labels; form/category constraints; anonymous/staff/lifecycle/revoked Support denied; valid Support consent; preferences replay preserved');
  console.log(mode,lifecycle,'PASS');
 }
 result.result='PASS';
}catch(error){result.result='FAIL';result.error=error.stack;throw error}
finally{if(started)command('pg_ctl',['-D',data,'-m','fast','-w','stop']);fs.writeFileSync(path.join(evidence,'sql-results.json'),JSON.stringify(result,null,2));}
