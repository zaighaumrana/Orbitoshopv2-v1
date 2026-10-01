-- LOCAL disposable database only: actual Edge role, never postgres masking ACLs.
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',message;end if;end $$;
select pg_temp.assert(not has_any_column_privilege('anon','public.shop_config','SELECT') and not has_any_column_privilege('authenticated','public.shop_config','SELECT'),'private config not exposed');
select pg_temp.assert(not has_function_privilege('authenticated','public.bridge_runtime_preflight()','EXECUTE'),'only trusted bridge runtime can inspect readiness');
set local role service_role;
select pg_temp.assert((select count(*)=1 from public.shop_config where id=1),'Edge service can actually SELECT private config');
update public.shop_config set shop_name='Service saved brand',shop_logo='data:image/png;base64,aGVsbG8=',shop_address='Address',shop_phone='123',shop_email='business@example.test',tax_rate=0,terms_text='Thanks' where id=1;
select pg_temp.assert((select shop_name='Service saved brand' and shop_logo<>' ' from public.shop_config where id=1),'Edge can save branding/logo/contact/receipts');
insert into public.employees(name,email,role) values('Service fixture','service-fixture@example.test','Cashier');
update public.employees set name='Updated service fixture' where email='service-fixture@example.test';
delete from public.employees where email='service-fixture@example.test';
insert into public.password_reset_requests(email) values('request@example.test');
update public.password_reset_requests set status='Resolved',resolved_by='Owner',resolved_at=now() where email='request@example.test';
do $$ declare r jsonb;blocked boolean:=false;begin
 r:=public.bridge_runtime_preflight();
 perform pg_temp.assert(r->'checks'->>'database_privileges'='true','all Edge table/column dependencies available');
 perform pg_temp.assert(r->'checks'->>'rpc_privileges'='true','all Edge RPC dependencies available');
 perform pg_temp.assert(r->'checks'->>'sequence_privileges'='true','Edge insert sequence dependencies available');
 perform pg_temp.assert(r->'checks'->>'owner_reservation'='false','unreserved database never ready');
 begin update public.shop_config set ems_enabled=true where id=1;exception when insufficient_privilege then blocked:=true;end;
 perform pg_temp.assert(blocked,'ordinary account settings cannot directly project platform entitlements');
end $$;
reset role;
set local role authenticated;
do $$ declare blocked boolean:=false;begin
 begin perform id from public.shop_config;exception when insufficient_privilege then blocked:=true;end;
 perform pg_temp.assert(blocked,'authenticated browser still cannot SELECT private table');
 blocked:=false;begin update public.shop_config set shop_name='Forbidden';exception when insufficient_privilege then blocked:=true;end;
 perform pg_temp.assert(blocked,'authenticated browser cannot directly UPDATE branding');
end $$;
reset role;
rollback;

begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERT: %',message;end if;end $$;
set local role service_role;
select public.bridge_onboarding('reserve','{"request_id":"10000000-0000-4000-8000-000000000001","platform_client_id":50,"client_binding":"orbito-client-50","business_name":"Test Shop","owner_name":"Test Owner","owner_email":"owner@example.test","billing_currency":"PKR","shop_url":"https://shop.example.test","modules":{"repair_module_enabled":true,"inventory_module_enabled":false,"technician_module_enabled":false,"live_tracking_enabled":false,"ems_enabled":false,"ems_track_breaks":false},"paper_resupply_enabled":false,"onboarding_version":2}');
select pg_temp.assert(public.bridge_runtime_preflight()->'checks'->>'owner_reservation'='true','immutable owner reservation matches config/binding');
select pg_temp.assert(public.bridge_runtime_preflight()->>'owner_account'='missing','manual Auth creation genuinely pending');
reset role;
insert into auth.users(id,email) values('92000000-0000-4000-8000-000000000001','owner@example.test');
set local role service_role;
select pg_temp.assert(public.bridge_runtime_preflight()->>'owner_account'='unconfirmed','unconfirmed Auth account cannot be shown active');
reset role;
update auth.users set email_confirmed_at=now(),encrypted_password='local-fixture' where id='92000000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.assert(public.bridge_runtime_preflight()->>'owner_account'='ready','confirmed Auth exists before activation');
reset role;
do $$ declare employee integer;begin
 insert into public.employees(name,email,role) values('Conflicting employee','owner@example.test','Cashier') returning id into employee;
 insert into public.app_users(auth_user_id,employee_id,email,display_name,role,status)
  values('92000000-0000-4000-8000-000000000001',employee,'owner@example.test','Conflicting employee','Cashier','Active');
 perform pg_temp.assert(public.bridge_runtime_preflight()->>'owner_account'='conflict','reserved email mapped as staff is not owner-ready');
 delete from public.app_users where auth_user_id='92000000-0000-4000-8000-000000000001';
 delete from public.employees where id=employee;
end $$;
set local role service_role;

reset role;
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.activate_reserved_owner();
reset role;
set local role service_role;
select pg_temp.assert(public.bridge_runtime_preflight()->>'owner_account'='active','active means exact Auth/app user owner match');
select pg_temp.assert((select count(*)=1 from public.app_users where role='Business Owner' and employee_id is null) and (select count(*)=0 from public.employees),'one owner and zero employees');
reset role;
rollback;
