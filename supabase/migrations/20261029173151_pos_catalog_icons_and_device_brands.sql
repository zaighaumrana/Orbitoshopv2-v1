-- Additive POS presentation data. One isolated customer project is the ownership boundary.
-- No ticket, financial record, historical migration, role function or release pin is rewritten.
set local lock_timeout='5s';
set local statement_timeout='60s';
create index tickets_open_queue_idx on public.tickets(created_at desc,id desc)
 where parent_ticket_id is null and status in ('Pending','In Progress','Ready');
alter table public.quick_items add column icon_id text check (icon_id is null or icon_id ~ '^(accessory|repair|service|generic)\.[a-z][a-z0-9_]{0,63}$');
alter table public.repair_components add column icon_id text check (icon_id is null or icon_id ~ '^(repair|generic)\.[a-z][a-z0-9_]{0,63}$');
alter table public.inventory add column icon_id text check (icon_id is null or icon_id ~ '^(accessory|repair|service|generic)\.[a-z][a-z0-9_]{0,63}$');
create table public.device_brands (
 id uuid primary key default gen_random_uuid(),
 display_name text not null check (length(display_name) between 1 and 100),
 normalized_name text generated always as (lower(regexp_replace(normalize(btrim(display_name),NFKC),'\s+',' ','g'))) stored not null,
 icon_id text check (icon_id is null or icon_id ~ '^(brand|generic)\.[a-z][a-z0-9_]{0,63}$'),
 enabled boolean not null default true,
 sort_order integer not null default 0 check (sort_order between 0 and 10000),
 created_at timestamptz not null default now(),
 constraint device_brands_normalized_unique unique(normalized_name),
 constraint device_brands_nonblank check(normalized_name<>'')
);
alter table public.device_brands enable row level security;
revoke all on public.device_brands from public,anon,authenticated;
grant select,insert,update on public.device_brands to authenticated;
-- Inactivation retains historical resolution. Browser DELETE is deliberately absent.
create policy device_brands_read on public.device_brands for select to authenticated using (
 (select app_private.current_client_access_allowed())
 and (select app_private.current_app_role()) in ('Business Owner','Manager','Cashier','Technician','Orbito Support')
 and coalesce(((select public.get_app_config())->>'repair_module_enabled')::boolean,false)
);
create policy device_brands_insert on public.device_brands for insert to authenticated with check (
 (select app_private.current_client_access_allowed())
 and (select app_private.current_app_role()) in ('Business Owner','Manager','Orbito Support')
 and coalesce(((select public.get_app_config())->>'repair_module_enabled')::boolean,false)
);
create policy device_brands_update on public.device_brands for update to authenticated using (
 (select app_private.current_client_access_allowed())
 and (select app_private.current_app_role()) in ('Business Owner','Manager','Orbito Support')
 and coalesce(((select public.get_app_config())->>'repair_module_enabled')::boolean,false)
) with check (
 (select app_private.current_client_access_allowed())
 and (select app_private.current_app_role()) in ('Business Owner','Manager','Orbito Support')
 and coalesce(((select public.get_app_config())->>'repair_module_enabled')::boolean,false)
);
create policy support_consent_guard on public.device_brands as restrictive for all to authenticated
 using ((select app_private.support_access_allowed())) with check ((select app_private.support_access_allowed()));
insert into public.device_brands(display_name,icon_id,sort_order) values
 ('Apple / iPhone','brand.apple',10),('Samsung','brand.samsung',20),('Xiaomi','brand.xiaomi',30),
 ('Redmi','brand.redmi',40),('POCO','brand.poco',50),('Infinix','brand.infinix',60),
 ('TECNO','brand.tecno',70),('itel','brand.itel',80),('vivo','brand.vivo',90),
 ('OPPO','brand.oppo',100),('realme','brand.realme',110)
 on conflict(normalized_name) do nothing;
-- Preserve the existing guarded bootstrap and its existing definer boundary;
-- only advertise optional presentation capability. Every table query still uses RLS.
create or replace function public.get_app_config() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.support_request_guard();
  if not app_private.current_client_access_allowed() then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select jsonb_build_object(
    'shop_email',sc.shop_email,'onboarding_version',sc.onboarding_version,'onboarding_completed_at',sc.onboarding_completed_at,
    'paper_resupply_enabled',coalesce((select (payload->>'paper_resupply_enabled')::boolean from app_private.billing_projection where singleton),sc.paper_resupply_enabled),
    'shop_name',sc.shop_name,'shop_address',sc.shop_address,'shop_phone',sc.shop_phone,'shop_logo',sc.shop_logo,'shop_description',sc.shop_description,
    'primary_color',sc.primary_color,'secondary_color',sc.secondary_color,'currency',sc.currency,'tax_rate',sc.tax_rate,
    'strict_login_mode',sc.strict_login_mode,'discount_pin_required',sc.discount_pin_required,'partial_udhar_allowed',sc.partial_udhar_allowed,'terms_text',sc.terms_text,
    'repair_module_enabled',sc.repair_module_enabled,'inventory_module_enabled',sc.inventory_module_enabled,'technician_module_enabled',sc.technician_module_enabled,
    'live_tracking_enabled',sc.live_tracking_enabled,'ems_enabled',sc.ems_enabled,'ems_track_breaks',sc.ems_track_breaks,
    'invoice_prefix',sc.invoice_prefix,'ticket_prefix',sc.ticket_prefix,'suspended',coalesce(sc.suspended,false),
    'read_contracts',jsonb_build_object('repair_families',1,'receipt_archive',1,'catalog_icons',1)
  ) into result from public.shop_config sc where sc.id=1;
  return result;
end $$;

create or replace function public.shop_backend_capabilities() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sc public.shop_config;bc app_private.bridge_config;caps jsonb;
begin
  select * into strict sc from public.shop_config where id=1;select * into strict bc from app_private.bridge_config where singleton;
  caps:=jsonb_build_object(
    'catalog-icons-and-brands',
      (select count(*)=3 from information_schema.columns where table_schema='public' and table_name in ('quick_items','repair_components','inventory') and column_name='icon_id' and data_type='text')
      and coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.device_brands')),false)
      and (select count(*)=4 from pg_policy where polrelid=to_regclass('public.device_brands') and polname in ('device_brands_read','device_brands_insert','device_brands_update','support_consent_guard'))
      and exists(select 1 from pg_policy where polrelid=to_regclass('public.device_brands') and polname='support_consent_guard' and not polpermissive)
      and has_table_privilege('authenticated','public.device_brands','SELECT')
      and has_table_privilege('authenticated','public.device_brands','INSERT')
      and has_table_privilege('authenticated','public.device_brands','UPDATE')
      and to_regclass('public.tickets_open_queue_idx') is not null
      and not has_table_privilege('anon','public.device_brands','SELECT')
      and not has_table_privilege('authenticated','public.device_brands','DELETE')
      and exists(select 1 from pg_constraint where conrelid=to_regclass('public.device_brands') and conname='device_brands_normalized_unique'),
    'usage-outbox',to_regclass('app_private.bridge_events') is not null and to_regclass('app_private.bridge_outbox') is not null and exists(select 1 from pg_trigger where tgrelid='app_private.bridge_events'::regclass and tgname='bridge_events_immutable' and tgenabled<>'D') and not has_function_privilege('authenticated','public.bridge_claim_outbox(integer)','EXECUTE'),
    'billing-projection',to_regprocedure('public.bridge_apply_billing(uuid,bigint,jsonb)') is not null and not has_function_privilege('authenticated','public.bridge_apply_billing(uuid,bigint,jsonb)','EXECUTE'),
    'config-journal',to_regclass('app_private.config_requests') is not null and to_regprocedure('public.bridge_onboarding(text,jsonb)') is not null,
    'support-identity',to_regprocedure('public.support_ticket_actor_context()') is not null and not has_function_privilege('anon','public.support_ticket_actor_context()','EXECUTE'),
    'support-consent',public.support_consent_capability(),
    'support-durable-submissions',to_regclass('app_private.support_submissions') is not null and not has_table_privilege('authenticated','app_private.support_submissions','SELECT') and not has_function_privilege('authenticated','public.support_delivery_finish(uuid,uuid,text,uuid,text)','EXECUTE'),
    'owner-bootstrap',to_regclass('app_private.owner_bootstrap') is not null,
    'private-rls',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relkind in ('r','p') and not c.relrowsecurity),
    'bounded-operational-reads',
      exists(select 1 from pg_proc where oid='public.get_repair_family_page(text,text,text,integer,integer)'::regprocedure and not prosecdef and provolatile='s' and proconfig=array['search_path=""'])
      and exists(select 1 from pg_proc where oid='public.get_receipt_archive_page(text,text,timestamp with time zone,timestamp with time zone,integer,integer)'::regprocedure and not prosecdef and provolatile='s' and proconfig=array['search_path=""'])
      and has_function_privilege('authenticated','public.get_repair_family_page(text,text,text,integer,integer)','EXECUTE')
      and has_function_privilege('authenticated','public.get_receipt_archive_page(text,text,timestamp with time zone,timestamp with time zone,integer,integer)','EXECUTE')
      and not has_function_privilege('anon','public.get_repair_family_page(text,text,text,integer,integer)','EXECUTE')
      and not has_function_privilege('anon','public.get_receipt_archive_page(text,text,timestamp with time zone,timestamp with time zone,integer,integer)','EXECUTE')
      and (select relrowsecurity from pg_class where oid='public.tickets'::regclass)
      and (select relrowsecurity from pg_class where oid='public.sales'::regclass)
      and (select count(*)=2 from pg_policy where polrelid in ('public.tickets'::regclass,'public.sales'::regclass)
        and polname='support_consent_guard' and not polpermissive and pg_get_expr(polqual,polrelid) like '%SELECT%')
  );
  return jsonb_build_object('contract','retrasell-backend-capabilities-v1','client_id',sc.platform_client_id,'source_id',bc.source_id,'client_binding',bc.client_binding,'observed_at',now(),'capabilities',caps,'runtime',public.bridge_runtime_preflight()->'checks','delivery',jsonb_build_object('usage_pending',(select count(*) from app_private.bridge_outbox where state in ('pending','leased')),'support_pending',(select count(*) from app_private.support_submissions where state<>'acknowledged')));
end $$;
