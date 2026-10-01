begin;
-- BYPASSRLS does not grant table privileges. Explicit Edge dependencies only.
grant usage on schema public to service_role;
grant select on public.shop_config,public.employees,public.tickets to service_role;
grant update(shop_name,shop_address,shop_phone,shop_email,shop_logo,shop_description,
 primary_color,secondary_color,currency,tax_rate,discount_pin_required,
 partial_udhar_allowed,terms_text,invoice_prefix,ticket_prefix,owner_email)
 on public.shop_config to service_role;
grant insert,update,delete on public.employees to service_role;
grant select,insert,update on public.password_reset_requests to service_role;
grant usage,select on sequence public.employees_id_seq,public.password_reset_requests_id_seq to service_role;
-- Browser config access stays through the existing authorized RPC, not the table.
revoke all on public.shop_config from anon,authenticated;

create function public.bridge_runtime_preflight() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare checks jsonb; table_ok boolean; rpc_ok boolean; settings_ok boolean;
 sc public.shop_config%rowtype; bc app_private.bridge_config%rowtype; b app_private.owner_bootstrap%rowtype;
 account text; candidates integer; confirmed boolean;
begin
 select * into strict sc from public.shop_config where id=1;
 select * into strict bc from app_private.bridge_config where singleton;
 select * into b from app_private.owner_bootstrap where singleton;
 select bool_and(coalesce(has_table_privilege('service_role',to_regclass(t),p),false)) into table_ok
 from (values ('public.shop_config','SELECT'),('public.app_users','SELECT'),('public.app_users','INSERT'),
 ('public.app_users','UPDATE'),('public.app_users','DELETE'),('public.employees','SELECT'),
 ('public.employees','INSERT'),('public.employees','UPDATE'),('public.employees','DELETE'),
 ('public.legacy_auth_credentials','SELECT'),('public.legacy_auth_credentials','UPDATE'),('public.legacy_auth_credentials','DELETE'),
 ('public.password_reset_requests','SELECT'),('public.password_reset_requests','INSERT'),('public.password_reset_requests','UPDATE'),
 ('public.support_access_log','SELECT'),('public.support_access_log','INSERT'),('public.tickets','SELECT')) required(t,p);
 select bool_and(coalesce(has_column_privilege('service_role','public.shop_config',k,'UPDATE'),false)) into settings_ok
 from unnest(array['shop_name','shop_address','shop_phone','shop_email','shop_logo','shop_description',
 'primary_color','secondary_color','currency','tax_rate','discount_pin_required','partial_udhar_allowed',
 'terms_text','invoice_prefix','ticket_prefix','owner_email']) k;
 select bool_and(coalesce(has_function_privilege(r,to_regprocedure(f),'EXECUTE'),false)) into rpc_ok
 from (values ('service_role','public.bridge_onboarding(text,jsonb)'),('service_role','public.complete_shop_onboarding(uuid)'),
 ('service_role','public.set_override_pin(text)'),('service_role','public.verify_override_pin_guarded(uuid,text,text)'),
 ('service_role','public.verify_legacy_credential(text,text)'),('service_role','public.bridge_claim_outbox(integer)'),
 ('service_role','public.bridge_finish_delivery(uuid,uuid,boolean)'),('service_role','public.bridge_apply_billing(uuid,bigint,jsonb)'),
 ('service_role','public.bridge_apply_resupply(uuid,uuid,bigint,text,timestamp with time zone)'),
 ('authenticated','public.activate_reserved_owner()'),('authenticated','public.get_app_config()')) required(r,f);
 checks:=jsonb_build_object('migrations',sc.onboarding_version in(0,2) and to_regprocedure('app_private.activate_bootstrap_owner(uuid,boolean)') is not null,
  'database_privileges',coalesce(table_ok and settings_ok,false),
  'rpc_privileges',coalesce(rpc_ok,false),
  'sequence_privileges',has_sequence_privilege('service_role','public.employees_id_seq','USAGE') and has_sequence_privilege('service_role','public.password_reset_requests_id_seq','USAGE') and has_sequence_privilege('service_role','public.support_access_log_id_seq','USAGE'),
  'private_config',not has_any_column_privilege('anon','public.shop_config','SELECT') and not has_any_column_privilege('authenticated','public.shop_config','SELECT') and not has_any_column_privilege('authenticated','public.shop_config','UPDATE'),
  'storage',true,
  'owner_reservation',coalesce(b.singleton and sc.onboarding_version=2 and sc.platform_client_id=(b.payload->>'platform_client_id')::integer and sc.owner_email=b.payload->>'owner_email' and bc.client_binding=b.payload->>'client_binding',false),
  'bridge_mode',bc.delivery_enabled and bc.usage_mode='bridge',
  'config_projection',exists(select 1 from app_private.billing_projection where singleton));
 select count(*),bool_and(email_confirmed_at is not null) into candidates,confirmed
 from auth.users where lower(trim(email))=b.payload->>'owner_email';
 account:=case when candidates>1 then 'conflict'
  when exists(select 1 from public.app_users u where (u.role='Business Owner' or lower(trim(u.email))=b.payload->>'owner_email')
   and (u.role<>'Business Owner' or u.status<>'Active' or u.employee_id is not null or lower(trim(u.email)) is distinct from b.payload->>'owner_email'
    or not exists(select 1 from auth.users a where a.id=u.auth_user_id and lower(trim(a.email))=b.payload->>'owner_email'))) then 'conflict'
  when b.owner_auth_id is not null and confirmed and exists(
  select 1 from public.app_users u join auth.users a on a.id=u.auth_user_id
  where u.auth_user_id=b.owner_auth_id and u.role='Business Owner' and u.status='Active' and u.employee_id is null
   and lower(trim(a.email))=b.payload->>'owner_email' and lower(trim(u.email))=b.payload->>'owner_email'
  ) then 'active'
  when b.owner_auth_id is not null and (confirmed or not exists(select 1 from auth.users where id=b.owner_auth_id and lower(trim(email))=b.payload->>'owner_email')) then 'conflict'
  when candidates=0 then 'missing' when confirmed then 'ready' else 'unconfirmed' end;
 return jsonb_build_object('checks',checks,'owner_account',account);
end $$;
revoke all on function public.bridge_runtime_preflight() from public,anon,authenticated;
grant execute on function public.bridge_runtime_preflight() to service_role;
commit;
