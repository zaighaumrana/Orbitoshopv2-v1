// Explicitly invoked local Docker integration test. Never connects to a provider.
// Executes the real Managed/BYO SQL envelopes without generating a release body.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {spawn,spawnSync,execFileSync} from 'node:child_process'
import {once} from 'node:events'
import {stripTypeScriptTypes} from 'node:module'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {migrationEnvelope} from '../scripts/byo-support-release.mjs'
import {buildReceiptRecords,filterReceiptRecords} from '../src/features/admin/checkout/receipts.js'
import {findRepairFamilies} from '../src/features/repairs/family.js'
const root=resolve(import.meta.dirname,'..'),platform=resolve(root,'../orbito')
const output=process.env.M2_SQL_EVIDENCE
if(!output||!resolve(output).startsWith(resolve(root,'../retrasell brandin/Shop-Modernization-2026')+'/')&&!resolve(output).startsWith(resolve(root,'../retrasell brandin/Shop-Modernization-2026')+'\\'))throw Error('Explicit evidence directory inside the existing archive required')
mkdirSync(output,{recursive:true})
const container='retrasell-m2-sql-20261025',tag=new Date().toISOString().replace(/\D/g,'').slice(0,14)
const sha=s=>createHash('sha256').update(s).digest('hex')
const text=readFileSync(resolve(root,'supabase/migrations/20261025233743_m2_bounded_operational_reads.sql'),'utf8').replaceAll('\r\n','\n')
const migration={version:'20261025233743',name:'m2_bounded_operational_reads',sql:text,sha256:sha(text)}
writeFileSync(resolve(output,'migration-source.sql'),text)
writeFileSync(resolve(output,'backend-requirements.json'),readFileSync(resolve(root,'scripts/backend-requirements.json')))
const release=id=>JSON.parse(readFileSync(resolve(platform,'supabase/releases/shop-release-'+id+'.json'),'utf8'))
const v4=release('support-v4'),v6=release('support-v6')
const managed=readFileSync(resolve(platform,'supabase/functions/_shared/managed-setup.ts'),'utf8')
const snippet=managed.slice(managed.indexOf('export function managedMigrationQuery'),managed.indexOf('export async function managedPublicEnvironment'))
const managedEnvelope=vm.runInNewContext("const literal=s=>\"'\"+s.replaceAll(\"'\",\"''\")+\"'\";"+stripTypeScriptTypes(snippet.replace('export ',''))+';managedMigrationQuery')
const result={started:new Date().toISOString(),container,network:'none',migration:{version:migration.version,sha256:migration.sha256},runs:[],limits:['Synthetic Auth claims and PostgreSQL integration; no hosted Auth, provider, Edge deployment or final release verification.','Migration hash is source evidence, not an approved release fingerprint.']}
function sql(db,query,{fail=false}={}) {
  const p=spawnSync('docker',['exec','-i',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-At'],{input:query,encoding:'utf8',windowsHide:true,maxBuffer:24e6})
  if(fail){assert.notEqual(p.status,0,'Expected SQL denial');return p.stderr.slice(0,600)}
  if(p.status!==0)throw Error((p.stderr||p.error?.message||'Local SQL failure').slice(0,1500))
  return p.stdout.trim()
}
const uid=n=>'90000000-0000-4000-8000-'+String(n).padStart(12,'0'),sid=uid(9)
const owner=uid(1),support=uid(2)
function actor(db,n,query,{role='authenticated',fail=false,session=sid}={}) {
  return sql(db,`begin;set local role ${role};select set_config('request.jwt.claim.sub','${uid(n)}',true);select set_config('request.jwt.claims','{"sub":"${uid(n)}","session_id":"${session}","user_metadata":{"role":"Business Owner"}}',true);${query};rollback;`,{fail}).split('\n').slice(2).join('\n')
}
const call=(db,n,fn,args='',opts)=>JSON.parse(actor(db,n,`select public.${fn}(${args})`,opts))
function digest(db){return sql(db,"select md5(coalesce((select jsonb_agg(to_jsonb(t) order by id)::text from public.tickets t),''))||':'||md5(coalesce((select jsonb_agg(to_jsonb(s) order by id)::text from public.sales s),''))")}
const bootstrap=`
create table if not exists auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now(),not_after timestamptz);
create or replace function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
grant execute on function auth.jwt() to anon,authenticated,service_role;
alter table auth.users add column if not exists deleted_at timestamptz;
alter table auth.users add column if not exists banned_until timestamptz;
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists is_anonymous boolean default false;
create schema if not exists extensions;create extension if not exists pgcrypto with schema extensions;
`
function seed(db){sql(db,`
update public.shop_config set repair_module_enabled=true,technician_module_enabled=true,inventory_module_enabled=true,suspended=false,onboarding_version=2,platform_client_id=42 where id=1;
insert into auth.users(id,email,email_confirmed_at) select ('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'fixture-'||n||'@example.invalid',now() from generate_series(1,5)n;
insert into public.employees(id,name,role,status) values(3,'Fixture Manager','Manager','Active'),(4,'Fixture Cashier','Cashier','Active'),(5,'Fixture Technician','Technician','Active');
insert into public.app_users(auth_user_id,employee_id,email,display_name,role) select u.id,case when n>2 then n end,u.email,'Fixture '||n,case n when 1 then 'Business Owner' when 2 then 'Orbito Support' when 3 then 'Manager' when 4 then 'Cashier' else 'Technician' end from generate_series(1,5)n join auth.users u on u.email='fixture-'||n||'@example.invalid';
insert into auth.sessions(id,user_id,created_at) values('${sid}','${support}',now());
update app_private.bridge_config set client_binding='m2-local-fixture' where singleton;
insert into app_private.support_cases(ticket_id,source_id,client_binding,client_id) select '${uid(11)}',source_id,client_binding,42 from app_private.bridge_config where singleton;
insert into app_private.support_consents(id,request_id,ticket_id,purpose,approved_by,expires_at,session_id,support_user_id,platform_actor)
values('${uid(12)}','${uid(13)}','${uid(11)}','Local read integration verification','${owner}',now()+interval '20 minutes','${sid}','${support}','${uid(14)}');
insert into public.tickets(id,ticket_number,invoice_number,customer_name,device_brand,device_model,status,created_at,placed_at,estimated_quote,amount_paid,request_id) overriding system value
values(1,'ROOT-1','ROOTINV-1','Old Root','Brand','Model','Pending','2025-01-01T10:00:00Z','2025-01-01 10:00:00',40,5,'${uid(20)}');
insert into public.tickets(id,parent_ticket_id,ticket_number,invoice_number,customer_name,device_brand,device_model,status,created_at,placed_at,estimated_quote) overriding system value
select n,1,'CHILD-'||n,'CHILDINV-'||n,case when n=1002 then 'needle child' else 'Child' end,'Brand','Model',case when n%2=0 then 'Ready' else 'Cancelled' end,'2026-10-25T10:00:00Z'::timestamptz,'2026-10-25 10:00:00'::timestamp,10 from generate_series(2,1002)n;
insert into public.tickets(id,ticket_number,invoice_number,customer_name,status,created_at) overriding system value
select n,'ROOT-'||n,'ROOTINV-'||n,'Recent '||n,case when n%2=0 then 'Pending' else 'Delivered' end,'2026-10-25T10:00:00Z'::timestamptz from generate_series(2000,3000)n;
insert into public.sales(id,invoice_number,customer_name,total_bill,created_at) overriding system value
select n,'SALE-'||n,'Retail '||n,20,'2026-10-25T10:00:00Z'::timestamptz from generate_series(1,1001)n;
insert into public.sales(id,invoice_number,ticket_id,customer_name,total_bill,created_at) overriding system value values
(2000,'ROOTINV-1',null,'Duplicate by old off-page invoice',50,now()),(2001,'DUPLICATE-TICKET',1,'Duplicate by ticket ID',50,now());
analyze public.tickets;analyze public.sales;
`)}
function verify(db,run){
  const tickets=JSON.parse(sql(db,'select jsonb_agg(to_jsonb(t) order by id desc) from public.tickets t'))
  const sales=JSON.parse(sql(db,'select jsonb_agg(to_jsonb(s) order by id desc) from public.sales s'))
  run.checks=[]
  for(const search of ['','needle child','Brand Model','%','_','CHILDINV-1002']){
    const expected=findRepairFamilies(tickets,search).map(f=>f.root.id).sort((a,b)=>b-a)
    const actual=[]
    const pages=JSON.parse(actor(db,1,`select jsonb_agg(public.get_repair_family_page('${search}','admin','all',n,50) order by n) from generate_series(0,${Math.max(0,expected.length-1)},50)n`))
    for(const page of pages){actual.push(...page.rows.map(r=>r.id));assert.equal(page.count,expected.length)}
    assert.deepEqual(actual,expected);run.checks.push({familySearch:search,roots:actual.length})
  }
  const records=buildReceiptRecords(sales,tickets)
  for(const [search,type,from,to] of [['','all','',''],['needle child','repair','',''],['CHILDINV-1002','all','2026-10-25','2026-10-25'],['CHILDINV-1002','all','2025-01-01','2025-01-01'],['Brand Model','repair','',''],['','retail','','']]){
    const expected=filterReceiptRecords(records,{receiptSearch:search,receiptType:type,receiptDateFrom:from,receiptDateTo:to})
    let actual=[],page
    const args=offset=>`'${search}','${type}',${from?"'"+from+"T00:00:00Z'":'null'},${to?"'"+to+"T00:00:00Z'::timestamptz+interval '1 day'":'null'},${offset},50`
    page=call(db,1,'get_receipt_archive_page',args(0));assert.equal(page.count,expected.length)
    if(page.mode==='family'){
        const roots=new Set(page.matches.map(m=>String(m.rootTicketId)))
        actual=filterReceiptRecords(buildReceiptRecords([],tickets.filter(t=>roots.has(String(t.parent_ticket_id||t.id)))),{receiptSearch:search,receiptType:type,receiptDateFrom:from,receiptDateTo:to})
    }else{
      const pages=JSON.parse(actor(db,1,`select jsonb_agg(public.get_receipt_archive_page(${args('n')}) order by n) from generate_series(0,${Math.max(0,expected.length-1)},50)n`))
      for(const p of pages){assert.equal(p.count,expected.length);assert.ok(p.rows.length<=50);actual.push(...p.rows)}
    }
    assert.deepEqual(actual.map(r=>r.key),expected.map(r=>r.key));run.checks.push({receiptSearch:search,type,rows:actual.length,mode:page.mode})
  }
  assert.equal(call(db,5,'get_repair_family_page',"'needle child','workshop'").count,1)
  assert.equal(call(db,4,'get_repair_family_page',"'needle child','collection'").count,1)
  assert.equal(call(db,2,'get_repair_family_page',"'needle child','admin'").count,1)
  assert.equal(Number(actor(db,2,'select count(*) from public.tickets')),tickets.length,'Valid current Support sees the same RLS rows')
  actor(db,2,"select public.get_repair_family_page('','admin')",{session:uid(99),fail:true})
  assert.equal(Number(actor(db,2,'select count(*) from public.tickets',{session:uid(99)})),0,'Wrong native Support session is denied by RLS without an API hook')
  for(const [n,fn,args,role] of [[1,'get_repair_family_page',"'','admin'",'anon'],[1,'get_repair_family_page',"'','admin'",'service_role'],[5,'get_receipt_archive_page','',undefined],[3,'get_repair_family_page',"'','workshop'",undefined],[4,'get_repair_family_page',"'','admin'",undefined]])actor(db,n,`select public.${fn}(${args})`,{role,fail:true})
  for(const [change,undo,n] of [
    ["update public.shop_config set suspended=true where id=1","update public.shop_config set suspended=false where id=1",1],
    ["update public.app_users set status='Inactive' where auth_user_id='"+owner+"'","update public.app_users set status='Active' where auth_user_id='"+owner+"'",1],
    ["update public.shop_config set repair_module_enabled=false where id=1","update public.shop_config set repair_module_enabled=true where id=1",1],
    ["update public.shop_config set technician_module_enabled=false where id=1","update public.shop_config set technician_module_enabled=true where id=1",5],
    ["update app_private.support_consents set revoked_at=now()","update app_private.support_consents set revoked_at=null",2],
    ["update app_private.support_consents set expires_at=now()-interval '1 second',approved_at=now()-interval '25 minutes'","update app_private.support_consents set expires_at=now()+interval '20 minutes',approved_at=now()",2],
    ["update app_private.bridge_config set client_binding='wrong'","update app_private.bridge_config set client_binding='m2-local-fixture'",2],
    ["update auth.sessions set not_after=now()-interval '1 second'","update auth.sessions set not_after=null",2],
    ["update auth.users set deleted_at=now() where id='"+support+"'","update auth.users set deleted_at=null where id='"+support+"'",2],
    ["update app_private.support_cases set client_id=43","update app_private.support_cases set client_id=42",2],
  ]){
    sql(db,change);actor(db,n,`select public.get_repair_family_page('','${n===5?'workshop':'admin'}')`,{fail:true})
    if(n===2||change.includes('suspended')||change.includes("status='Inactive'")){
      assert.equal(Number(actor(db,n,'select count(*) from public.tickets')),0,'Direct ticket RLS still denies revoked authority')
      assert.equal(Number(actor(db,n,'select count(*) from public.sales')),0,'Direct sale RLS still denies revoked authority')
    }
    sql(db,undo)
  }
  assert.deepEqual(call(db,1,'get_app_config').read_contracts,{repair_families:1,receipt_archive:1})
  assert.equal(sql(db,"select public.shop_backend_capabilities()->'capabilities'->>'bounded-operational-reads'"),'true')
  run.capability='PASS: new requirement is structurally observed; no release identity is self-attested'
  const flags=sql(db,"select proname::text||':'||prosecdef::text||':'||provolatile::text from pg_proc where oid in ('public.get_repair_family_page(text,text,text,integer,integer)'::regprocedure,'public.get_receipt_archive_page(text,text,timestamptz,timestamptz,integer,integer)'::regprocedure) order by proname")
  assert.match(flags,/get_receipt_archive_page:false:s/);assert.match(flags,/get_repair_family_page:false:s/)
  run.acl='PASS: invoker/RLS, anon/service denied, role/context, inactive/suspended/modules and Support consent/session/binding negatives'
  run.businessDigest=digest(db)
}
try{
  const identity=JSON.parse(execFileSync('docker',['inspect',container,'--format','{{json .HostConfig.NetworkMode}}'],{encoding:'utf8'}));assert.equal(identity,'none')
  const authSchema=execFileSync('docker',['exec',container,'pg_dump','--schema-only','--no-owner','--no-privileges','--schema=auth','-U','postgres','postgres'],{encoding:'utf8'})
  for(const mode of ['managed','byo'])for(const lifecycle of ['fresh','v4-upgrade']){
    const db='m2_'+mode.replace('-','_')+'_'+lifecycle.replace('-','_')+'_'+tag
    const run={mode,lifecycle,db,migrations:[],result:'IN PROGRESS'};result.runs.push(run)
    sql('postgres','create database '+db+' template template0')
    sql(db,authSchema+"grant usage on schema auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;"+bootstrap)
    const envelope=mode==='managed'?managedEnvelope:migrationEnvelope
    const base=lifecycle==='fresh'?v6:v4
    // Each envelope remains its own autocommitted statement/ledger transaction.
    // One local psql input avoids spawning a Docker client for every statement.
    sql(db,base.migrations.map(envelope).join('\n'));run.migrations.push(...base.migrations.map(m=>m.version))
    if(lifecycle!=='fresh')seed(db)
    const before=lifecycle==='fresh'?null:digest(db)
    for(const m of v6.migrations.filter(m=>!base.migrations.some(b=>b.version===m.version))){sql(db,envelope(m));run.migrations.push(m.version)}
    if(mode==='byo'&&lifecycle==='v4-upgrade'){
      const holder=spawn('docker',['exec','-i',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-At'],{windowsHide:true,stdio:['pipe','pipe','pipe']})
      const ended=once(holder,'exit')
      const locked=new Promise((yes,no)=>{holder.on('error',no);holder.stdout.on('data',chunk=>{if(chunk.toString().includes('M2_LOCK_READY'))yes()});holder.stderr.on('data',chunk=>{if(chunk.toString().includes('ERROR:'))no(Error(chunk.toString()))})})
      holder.stdin.end("begin;lock table public.tickets in access share mode;select 'M2_LOCK_READY';select pg_sleep(7);rollback;")
      await locked
      run.lockTimeout=sql(db,envelope(migration),{fail:true});assert.match(run.lockTimeout,/lock timeout/)
      assert.equal(sql(db,"select count(*) from supabase_migrations.schema_migrations where version='20261025233743'"),'0')
      assert.equal(sql(db,"select to_regprocedure('public.get_repair_family_page(text,text,text,integer,integer)') is null"),'t')
      assert.equal(digest(db),before,'Lock timeout did not change business records')
      assert.equal((await ended)[0],0)
    }
    sql(db,envelope(migration));run.migrations.push(migration.version)
    if(before)assert.equal(digest(db),before,'Upgrade preserves all business records/request identities')
    if(lifecycle==='fresh')seed(db)
    const after=digest(db);sql(db,envelope(migration));assert.equal(digest(db),after,'Verified replay is inert')
    run.conflict=sql(db,envelope({...migration,sha256:'f'.repeat(64)}),{fail:true})
    const failed={version:'20990101000000',name:'intentional_local_atomicity_test',sql:"insert into public.tickets(id,ticket_number) overriding system value values(90000000,'MUST-ROLL-BACK');do $$begin raise exception 'intentional fixture failure';end$$;",sha256:'e'.repeat(64)}
    run.atomicity=sql(db,envelope(failed),{fail:true});assert.equal(digest(db),after)
    assert.match(run.atomicity,/intentional fixture failure/)
    assert.equal(sql(db,"select count(*) from supabase_migrations.schema_migrations where version='20990101000000'"),'0')
    verify(db,run);run.ledger=sql(db,'select version from supabase_migrations.schema_migrations order by version').split('\n');run.result='PASS'
    writeFileSync(resolve(output,'progress.json'),JSON.stringify(result,null,2))
    console.log(mode,lifecycle,'PASS',run.ledger.length,'migrations')
  }
  result.result='PASS'
}catch(error){result.result='FAIL';result.error=error.stack;process.exitCode=1;console.error(error.message)}
finally{result.finished=new Date().toISOString();writeFileSync(resolve(output,'sql-contracts.json'),JSON.stringify(result,null,2))}
