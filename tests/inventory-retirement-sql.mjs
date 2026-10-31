// Disposable native PostgreSQL only. Uses real canonical SQL and installer envelopes.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import vm from 'node:vm';
import assert from 'node:assert/strict';import {spawnSync,spawn} from 'node:child_process';import {stripTypeScriptTypes} from 'node:module';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
const shop=path.resolve(import.meta.dirname,'..'),platform=path.resolve(process.env.RETRASELL_PLATFORM_SOURCE||path.join(shop,'../orbito')),evidence=process.env.POS_EVIDENCE_DIR;if(!evidence)throw Error('Set POS_EVIDENCE_DIR to an owned external evidence directory.');fs.mkdirSync(evidence,{recursive:true});
const bin=process.env.PG_BIN||'C:/Program Files/PostgreSQL/18/bin',scratch=fs.mkdtempSync(path.join(os.tmpdir(),'retrasell-pos-pg-')),data=path.join(scratch,'data'),port=55439;
const result={kind:'author local native PostgreSQL 18 / synthetic Auth primitives',scratch,port,runs:[],limitations:['No hosted Auth, customer project, Edge deployment or provider API verification.']};
const run=(exe,args,input)=>spawnSync(exe,args,{encoding:'utf8',input,windowsHide:true,maxBuffer:30e6});
const command=(name,args)=>{const r=name==='pg_ctl'?spawnSync(path.join(bin,name+'.exe'),args,{stdio:'ignore',windowsHide:true,timeout:30000}):run(path.join(bin,name+'.exe'),args);if(r.status!==0)throw Error(String(r.stderr||r.stdout||r.error?.message||name+' failed').slice(0,1800));return r.stdout};
function sql(db,input,{fail=false}={}){const r=run(path.join(bin,'psql.exe'),['-X','-q','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','postgres','-d',db,'-At'],input);if(fail){assert.notEqual(r.status,0);return r.stderr.slice(0,500)}if(r.status!==0)throw Error(r.stderr.slice(0,1800));return r.stdout.trim()}
const text=p=>fs.readFileSync(path.join(shop,p),'utf8').replaceAll('\r\n','\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
const v9=JSON.parse(fs.readFileSync(path.join(platform,'supabase/releases/shop-release-support-v9.json')));
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

const newName='20261031003158_inventory_permanent_retirement.sql';const retirement={version:newName.split('_')[0],name:newName.slice(15,-4),sql:text('supabase/migrations/'+newName)};retirement.sha256=hash(retirement.sql);
const login=n=>`set request.jwt.claim.sub='${uid(n)}';set request.jwt.claims='{"sub":"${uid(n)}","session_id":"${uid(9)}"}';`;
const asOwner=(db,q,opts={})=>sql(db,`begin;set local role authenticated;${login(1)}${q};commit;`,opts).split('\n').slice(2).join('\n');
const parallelSQL=(db,input)=>new Promise(resolve=>{const child=spawn(path.join(bin,'psql.exe'),['-X','-q','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','postgres','-d',db,'-At'],{windowsHide:true});let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);child.on('close',code=>resolve({code,stdout,stderr}));child.stdin.end(input)});
const pin=(db,n=1)=>sql(db,`${login(n)}select public.verify_override_pin_guarded('${uid(n)}','1234','inventory')->>'ok'`);
const change=(db,req,action,quantity,expected=10,n=1,opts={})=>sql(db,`begin;set local role authenticated;${login(n)}select public.change_inventory_stock('${uid(req)}',1,'${action}',${quantity},${expected===null?'null':expected},'Local stock test');commit;`,opts);
let started=false;
try{
 command('initdb',['-D',data,'-U','postgres','-A','trust','--encoding=UTF8','--locale=C']);command('pg_ctl',['-D',data,'-l',path.join(scratch,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true;
 sql('postgres','create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role authenticator nologin;');
 for(const mode of ['managed','byo'])for(const lifecycle of ['fresh','v9-upgrade']){
  const db='stock_'+mode+'_'+lifecycle.replaceAll('-','_'),envelope=mode==='managed'?managedEnvelope:migrationEnvelope,record={mode,lifecycle,checks:[],result:'RUNNING'};result.runs.push(record);
  sql('postgres','create database '+db+' template template0');sql(db,bootstrap);sql(db,v9.migrations.map(envelope).join('\n'));
  if(lifecycle==='v9-upgrade')seed(db);
  const broken={...retirement,version:'20990101000002',sql:retirement.sql+'\nselect missing_deliberate_test_function();'};broken.sha256=hash(broken.sql);sql(db,envelope(broken),{fail:true});assert.equal(sql(db,"select to_regclass('app_private.inventory_change_requests') is null"),'t');
  sql(db,envelope(retirement));sql(db,envelope(retirement));if(lifecycle==='fresh')seed(db);
  assert.equal(sql(db,'select count(*) from supabase_migrations.schema_migrations'),'42');
  assert.equal(sql(db,"select public.shop_backend_capabilities()->'capabilities'->>'inventory-retirement'"),'true');assert.equal(actor(db,1,"select public.get_app_config()->'read_contracts'->>'inventory_retirement'"),'1');
  sql(db,`${login(1)}select public.set_override_pin('1234');`);
  asOwner(db,`select public.create_inventory_item('${uid(20)}','Tracked Stock','SKU','General',100,50,11,1)`);
  asOwner(db,`select public.create_retail_sale('${uid(22)}','[{"itemKind":"inventory","inventoryId":1,"quantity":1,"originalPrice":100,"unitPrice":100}]'::jsonb,'[{"method":"Cash","amount":100}]'::jsonb,false,'Synthetic customer','')`);
  const originalHistory=digest(db);
  const financialBefore=sql(db,"select md5(jsonb_build_array((select jsonb_agg(to_jsonb(t) order by id) from public.sales t),(select jsonb_agg(to_jsonb(t) order by id) from public.sale_lines t),(select jsonb_agg(to_jsonb(t) order by id) from public.payments t))::text)");
  sql(db,`${login(1)}select public.verify_override_pin_guarded('${uid(1)}','1234','admin');insert into public.step_up_authorizations(auth_user_id,purpose,created_at,expires_at) values('${uid(1)}','inventory',now()-interval '120 seconds',now()-interval '30 seconds');`);

  change(db,30,'remove',1,10,1,{fail:true});assert.equal(sql(db,'select qty from public.inventory where id=1'),'10');
  for(const n of [4,5]){assert.equal(pin(db,n).split('\n').at(-1),'true');change(db,30+n,'remove',1,10,n,{fail:true})}
  assert.equal(pin(db).split('\n').at(-1),'true');change(db,40,'remove',3);assert.equal(sql(db,'select qty from public.inventory where id=1'),'7');
  change(db,40,'remove',3);assert.equal(sql(db,'select qty from public.inventory where id=1'),'7');assert.equal(sql(db,"select count(*) from public.inventory_movements where request_id='"+uid(40)+"'"),'1');
  change(db,40,'remove',4,10,1,{fail:true});change(db,41,'add',1,7,1,{fail:true}); // consumed PIN cannot authorize another intent
  assert.equal(pin(db).split('\n').at(-1),'true');change(db,42,'remove',8,7,1,{fail:true});assert.equal(sql(db,"select count(*) from app_private.inventory_change_requests where request_id='"+uid(42)+"'"),'0');
  change(db,43,'set',4,10,1,{fail:true});change(db,44,'set',4,7);assert.equal(sql(db,'select qty from public.inventory where id=1'),'4');
  assert.equal(pin(db,3).split('\n').at(-1),'true');change(db,45,'add',2,4,3);assert.equal(sql(db,'select qty from public.inventory where id=1'),'6');
  // Consented Support may operate; revoked/anonymous/inactive/module-disabled callers cannot.
  change(db,51,'add',1,6,2,{fail:true});
  sql(db,`insert into auth.sessions(id,user_id) values('${uid(9)}','${uid(2)}');update app_private.bridge_config set client_binding='stock-local-fixture' where singleton;insert into app_private.support_cases(ticket_id,source_id,client_binding,client_id) select '${uid(11)}',source_id,client_binding,42 from app_private.bridge_config where singleton;insert into app_private.support_consents(id,request_id,ticket_id,purpose,approved_by,expires_at,session_id,support_user_id,platform_actor) values('${uid(12)}','${uid(13)}','${uid(11)}','Stock authorization test','${uid(1)}',now()+interval '20 minutes','${uid(9)}','${uid(2)}','${uid(14)}');`);
  assert.equal(pin(db,2).split('\n').at(-1),'true');assert.match(actor(db,2,"select public.change_inventory_stock('"+uid(52)+"',1,'add',1,6,'Consented')"),/newQuantity/);sql(db,'update app_private.support_consents set revoked_at=now()');change(db,51,'add',1,6,2,{fail:true});
  actor(db,1,"select public.change_inventory_stock('"+uid(51)+"',1,'add',1,6,'Anonymous')",{role:'anon',fail:true});
  sql(db,"update public.app_users set status='Inactive' where auth_user_id='"+uid(3)+"'");change(db,51,'add',1,6,3,{fail:true});sql(db,"update public.app_users set status='Active' where auth_user_id='"+uid(3)+"'");
  sql(db,'update public.shop_config set inventory_module_enabled=false where id=1');change(db,51,'add',1,6,1,{fail:true});sql(db,'update public.shop_config set inventory_module_enabled=true where id=1');
  actor(db,1,'update public.inventory set qty=0',{fail:true});actor(db,1,"update public.inventory set retired_at=now(),retired_by=auth.uid(),retirement_reason='bypass',retirement_request_id='"+uid(88)+"'",{fail:true});
  actor(db,1,'select * from app_private.inventory_change_requests',{fail:true});actor(db,1,"select app_private.apply_inventory_change('"+uid(89)+"',1,'retire',0,6,'bypass','manual_adjustment')",{fail:true});
  // Legacy adjustment cannot bypass the Inventory PIN either.
  actor(db,1,"select public.adjust_inventory_stock('"+uid(46)+"',1,-1,'manual_adjustment','Legacy')",{fail:true});
  assert.equal(pin(db).split('\n').at(-1),'true');
  sql(db,`create function public.test_stock_failure() returns trigger language plpgsql as $$begin if new.request_id='${uid(53)}' then raise exception 'Deliberate audit failure';end if;return new;end$$;create trigger test_stock_failure before insert on public.inventory_movements for each row execute function public.test_stock_failure();`);
  change(db,53,'add',1,6,1,{fail:true});assert.equal(sql(db,'select qty from public.inventory where id=1'),'6');assert.equal(sql(db,"select count(*) from app_private.inventory_change_requests where request_id='"+uid(53)+"'"),'0');sql(db,'drop trigger test_stock_failure on public.inventory_movements;drop function public.test_stock_failure()');
  const query=(req,actorId)=>`begin;set local role authenticated;${login(actorId)}select public.change_inventory_stock('${uid(req)}',1,'add',1,6,'Concurrent');select pg_sleep(0.15);commit;`;
  const repeated=await Promise.all([parallelSQL(db,query(60,1)),parallelSQL(db,query(60,1))]);assert.ok(repeated.every(r=>r.code===0));assert.equal(sql(db,'select qty from public.inventory where id=1'),'7');assert.equal(sql(db,"select count(*) from app_private.inventory_change_requests where request_id='"+uid(60)+"'"),'1');
  assert.equal(pin(db).split('\n').at(-1),'true');assert.equal(pin(db,3).split('\n').at(-1),'true');
  const competing=(req,n)=>`begin;set local role authenticated;${login(n)}select public.change_inventory_stock('${uid(req)}',1,'remove',1,7,'Competing');select pg_sleep(0.15);commit;`;
  const raced=await Promise.all([parallelSQL(db,competing(61,1)),parallelSQL(db,competing(62,3))]);assert.equal(raced.filter(r=>r.code===0).length,1);assert.equal(sql(db,'select qty from public.inventory where id=1'),'6');
  assert.equal(pin(db).split('\n').at(-1),'true');change(db,47,'retire',0,6);assert.equal(sql(db,'select qty from public.inventory where id=1'),'0');assert.equal(sql(db,'select retired_at is not null from public.inventory where id=1'),'t');
  change(db,47,'retire',0,6);assert.equal(sql(db,"select count(*) from app_private.inventory_change_requests where request_id='"+uid(47)+"'"),'1');
  assert.equal(pin(db).split('\n').at(-1),'true');change(db,48,'add',1,0,1,{fail:true});sql(db,'update public.inventory set qty=1 where id=1',{fail:true});sql(db,'update public.inventory set retired_at=null,retired_by=null,retirement_reason=null,retirement_request_id=null where id=1',{fail:true});sql(db,'delete from public.inventory where id=1',{fail:true});
  sql(db,"update app_private.inventory_change_requests set operation='changed'",{fail:true});assert.equal(digest(db),originalHistory);sql(db,envelope(retirement));assert.equal(sql(db,'select qty from public.inventory where id=1'),'0');
  // Zero-stock retirement still creates its own immutable PIN-linked operation.
  asOwner(db,`select public.create_inventory_item('${uid(21)}','Empty Stock','EMPTY','General',100,50,0,0)`);actor(db,1,'delete from public.inventory where id=2',{fail:true});assert.equal(pin(db).split('\n').at(-1),'true');asOwner(db,`select public.change_inventory_stock('${uid(49)}',2,'retire',0,0,'Retire empty')`);assert.equal(sql(db,'select count(*) from app_private.inventory_change_requests'),'7');
  sql(db,'update public.shop_config set suspended=true where id=1');change(db,47,'retire',0,6,1,{fail:true});sql(db,'update public.shop_config set suspended=false where id=1');
  assert.equal(sql(db,"select md5(jsonb_build_array((select jsonb_agg(to_jsonb(t) order by id) from public.sales t),(select jsonb_agg(to_jsonb(t) order by id) from public.sale_lines t),(select jsonb_agg(to_jsonb(t) order by id) from public.payments t))::text)"),financialBefore);
  assert.equal(actor(db,1,"select public.get_retail_return_context(1)->'lines'->0->>'inventoryRetired'"),'true');
  sql(db,`${login(1)}select public.verify_override_pin_guarded('${uid(1)}','1234','return');`);
  asOwner(db,`select public.create_retail_return('${uid(70)}',1,'[{"saleLineId":1,"quantity":1,"restock":true}]'::jsonb,'Cash','Historical return')`,{fail:true});assert.equal(sql(db,'select count(*) from public.returns'),'0');
  asOwner(db,`select public.create_retail_return('${uid(71)}',1,'[{"saleLineId":1,"quantity":1,"restock":false}]'::jsonb,'Cash','Historical non-sellable return')`);assert.equal(sql(db,'select count(*) from public.returns'),'1');assert.equal(sql(db,'select qty from public.inventory where id=1'),'0');assert.equal(sql(db,'select amount from public.refunds'),'100.00');assert.equal(sql(db,'select inventory_id from public.sale_lines where id=1'),'1');
  record.result='PASS';record.checks=['42 exact ledger entries','failed migration atomic rollback and replay','capability/default contract','PIN required/one-time claim','staff denial','Owner/Manager authorized operations','same-intent replay and payload conflict','no negative/stale quantity','legacy RPC has no bypass','permanent zero-stock retirement with immutable journal','direct writes/reactivation/deletion denied','suspended replay denial','original sale/payment history preserved; non-sellable historical return succeeds','actual concurrent same-request replay once and competing stale write denial','atomic movement failure rolls back quantity/PIN/journal','Support consent/revocation, anon, inactive and module denials'];console.log(mode,lifecycle,'PASS');
 }
 result.result='PASS';
}catch(error){result.result='FAIL';result.error=error.stack;throw error}
finally{if(started)command('pg_ctl',['-D',data,'-m','fast','-w','stop']);fs.writeFileSync(path.join(evidence,'retirement-sql-results.json'),JSON.stringify(result,null,2));}
