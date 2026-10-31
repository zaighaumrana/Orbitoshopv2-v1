-- Additive permanent Inventory retirement; historical records and foreign keys stay intact.
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.inventory
 add column retired_at timestamptz,
 add column retired_by uuid references auth.users(id) on delete restrict,
 add column retirement_reason text,
 add column retirement_request_id uuid unique,
 add constraint inventory_retirement_shape check (
  (retired_at is null and retired_by is null and retirement_reason is null and retirement_request_id is null)
  or (retired_at is not null and retired_by is not null and retirement_request_id is not null
   and retirement_reason is not null and retirement_reason ~ '[^[:space:]]' and char_length(btrim(retirement_reason)) between 1 and 500 and qty=0)
 );
-- Retire through the audited RPC; direct browser deletion has no PIN/journal.
revoke delete on public.inventory from authenticated;
create index inventory_active_name_idx on public.inventory(name,id) where retired_at is null;
create table app_private.inventory_change_requests (
 request_id uuid primary key,
 actor_id uuid not null references auth.users(id) on delete restrict,
 inventory_id integer not null references public.inventory(id) on delete restrict,
 operation text not null,
 payload jsonb not null,
 previous_quantity integer not null check(previous_quantity>=0),
 new_quantity integer not null check(new_quantity>=0),
 step_up_id uuid not null references public.step_up_authorizations(id) on delete restrict,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table app_private.inventory_change_requests enable row level security;
revoke all on app_private.inventory_change_requests from public,anon,authenticated;
create function app_private.protect_inventory_change_requests() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'Stock change records are immutable' using errcode='42501';end$$;
revoke all on function app_private.protect_inventory_change_requests() from public,anon,authenticated;
create trigger inventory_change_requests_immutable before update or delete on app_private.inventory_change_requests
for each row execute function app_private.protect_inventory_change_requests();
create function app_private.protect_inventory_retirement() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then
  if old.retired_at is not null then raise exception 'Retired item history must be retained' using errcode='42501';end if;
  return old;
 end if;
 if old.retired_at is not null and new is distinct from old then
  raise exception 'This item is permanently retired. Returns must be recorded as non-sellable.' using errcode='42501';
 end if;
 if current_user in ('anon','authenticated') and
  row(new.retired_at,new.retired_by,new.retirement_reason,new.retirement_request_id)
  is distinct from row(old.retired_at,old.retired_by,old.retirement_reason,old.retirement_request_id)
 then raise exception 'Retirement requires the PIN-authorized stock transaction' using errcode='42501';end if;
 return new;
end$$;
revoke all on function app_private.protect_inventory_retirement() from public,anon,authenticated;
create trigger inventory_protect_retirement before update or delete on public.inventory
for each row execute function app_private.protect_inventory_retirement();
alter table public.step_up_authorizations drop constraint step_up_authorizations_purpose_check;
alter table public.step_up_authorizations add constraint step_up_authorizations_purpose_check
 check(purpose in ('admin','settle','return','discount','udhar','remove-component','repair-refund','inventory'));
create or replace function public.verify_override_pin_guarded(
  p_actor uuid, p_pin text, p_purpose text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  attempt app_private.pin_attempts%rowtype;
  actor public.app_users%rowtype;
  expiry timestamptz;
  failure_count integer;
begin
  select * into actor from public.app_users where auth_user_id=p_actor and status='Active';
  if actor.auth_user_id is null or p_purpose not in
    ('admin','settle','return','discount','udhar','remove-component','repair-refund','inventory')
    or p_purpose is null then
    raise exception 'Authorization failed' using errcode='42501';
  end if;
  if not exists(select 1 from public.shop_config where id=1
      and (not coalesce(suspended,false) or actor.role='Orbito Support')) then
    raise exception 'Authorization failed' using errcode='42501';
  end if;
  insert into app_private.pin_attempts(auth_user_id) values(p_actor) on conflict do nothing;
  select * into attempt from app_private.pin_attempts where auth_user_id=p_actor for update;
  if attempt.locked_until > clock_timestamp() then return jsonb_build_object('ok',false); end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' or not public.verify_override_pin(p_pin) then
    failure_count := least(attempt.failures+1,1000000);
    update app_private.pin_attempts set failures=failure_count, last_failed_at=clock_timestamp(),
      locked_until=case when failure_count>=10 then clock_timestamp()+interval '30 minutes'
        when failure_count>=8 then clock_timestamp()+interval '5 minutes'
        when failure_count>=5 then clock_timestamp()+interval '1 minute' else null end
      where auth_user_id=p_actor;
    return jsonb_build_object('ok',false);
  end if;
  update app_private.pin_attempts set failures=0,locked_until=null,last_failed_at=null where auth_user_id=p_actor;
  expiry := clock_timestamp()+interval '75 seconds';
  insert into public.step_up_authorizations(auth_user_id,purpose,expires_at) values(p_actor,p_purpose,expiry);
  return jsonb_build_object('ok',true,'purpose',p_purpose,'expiresAt',expiry);
end;
$$;
create function app_private.apply_inventory_change(
 p_request_id uuid,p_inventory_id integer,p_action text,p_quantity integer,
 p_expected_quantity integer,p_reason text,p_movement_type text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.app_users%rowtype; item public.inventory%rowtype;
 prior app_private.inventory_change_requests%rowtype; approval uuid; intent jsonb;
 before_quantity integer; after_quantity bigint; delta_value bigint; movement public.inventory_movements%rowtype; result_value jsonb;
begin
 perform public.support_request_guard();
 select * into actor from public.app_users where auth_user_id=auth.uid() and status='Active';
 if actor.auth_user_id is null or actor.role not in ('Business Owner','Manager','Orbito Support')
  or not app_private.current_client_access_allowed()
  or not exists(select 1 from public.shop_config where id=1 and inventory_module_enabled)
 then raise exception 'Stock management is not authorized' using errcode='42501';end if;
 if p_request_id is null or p_inventory_id is null or p_action is null
  or p_action not in ('add','remove','set','retire','delta')
  or p_reason is null or p_reason !~ '[^[:space:]]' or char_length(btrim(p_reason)) not between 1 and 500
  or p_quantity is null or (p_action<>'delta' and p_quantity<0)
  or (p_action in ('add','remove','delta') and p_quantity=0)
  or (p_action in ('set','retire') and p_expected_quantity is null)
  or (p_expected_quantity is not null and p_expected_quantity<0)
  or (p_action='retire' and p_quantity<>0)
  or p_movement_type is null or p_movement_type not in ('restock','manual_adjustment')
  or (p_movement_type='restock' and p_quantity<0)
 then raise exception 'Enter a valid quantity, action and reason' using errcode='22023';end if;
 intent:=jsonb_build_array(p_inventory_id,p_action,p_quantity,p_expected_quantity,btrim(p_reason),p_movement_type);
 perform pg_advisory_xact_lock(hashtextextended('inventory-change:'||p_request_id::text,0));
 select * into prior from app_private.inventory_change_requests where request_id=p_request_id;
 if prior.request_id is not null then
  if prior.actor_id<>actor.auth_user_id or prior.payload<>intent then
   raise exception 'Stock request identity conflicts with its original intent' using errcode='22023';end if;
  return prior.result||jsonb_build_object('idempotentReplay',true);
 end if;
 approval:=app_private.claim_step_up('inventory',p_request_id,'inventory-'||p_action,intent);
 if approval is null then raise exception 'A fresh Inventory PIN approval is required' using errcode='42501';end if;
 select * into item from public.inventory where id=p_inventory_id for update;
 if item.id is null then raise exception 'Inventory item unavailable' using errcode='22023';end if;
 if item.retired_at is not null then raise exception 'This item is permanently retired' using errcode='42501';end if;
 if p_expected_quantity is not null and item.qty<>p_expected_quantity then
  raise exception 'Stock changed since you opened this form. Refresh and review the new quantity.' using errcode='40001';end if;
 before_quantity:=item.qty;
 delta_value:=case p_action when 'add' then p_quantity::bigint when 'remove' then -p_quantity::bigint
  when 'set' then p_quantity::bigint-item.qty when 'retire' then -item.qty::bigint else p_quantity::bigint end;
 after_quantity:=item.qty::bigint+delta_value;
 if after_quantity<0 or after_quantity>2147483647 then raise exception 'Quantity would be outside the allowed stock range' using errcode='22023';end if;
 update public.inventory set qty=after_quantity::integer,
  retired_at=case when p_action='retire' then now() else retired_at end,
  retired_by=case when p_action='retire' then actor.auth_user_id else retired_by end,
  retirement_reason=case when p_action='retire' then btrim(p_reason) else retirement_reason end,
  retirement_request_id=case when p_action='retire' then p_request_id else retirement_request_id end
 where id=item.id returning * into item;
 if delta_value<>0 then
  insert into public.inventory_movements(request_id,inventory_id,movement_type,quantity_delta,reason,created_by_auth_user_id)
  values(p_request_id,item.id,p_movement_type,delta_value::integer,
   case when p_action='retire' then 'Permanently retired: ' else '' end||btrim(p_reason),actor.auth_user_id)
  returning * into movement;
 end if;
 result_value:=jsonb_build_object('requestId',p_request_id,'item',to_jsonb(item),'movement',to_jsonb(movement),
  'previousQuantity',before_quantity,'newQuantity',item.qty,'retired',item.retired_at is not null,'idempotentReplay',false);
 insert into app_private.inventory_change_requests(request_id,actor_id,inventory_id,operation,payload,previous_quantity,new_quantity,step_up_id,result)
 values(p_request_id,actor.auth_user_id,item.id,p_action,intent,before_quantity,item.qty,approval,result_value);
 return result_value;
end$$;
revoke all on function app_private.apply_inventory_change(uuid,integer,text,integer,integer,text,text) from public,anon,authenticated;
create function public.change_inventory_stock(p_request_id uuid,p_inventory_id integer,p_action text,
 p_quantity integer,p_expected_quantity integer,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if p_action is null or p_action not in ('add','remove','set','retire') then raise exception 'Invalid stock action' using errcode='22023';end if;
 return app_private.apply_inventory_change(p_request_id,p_inventory_id,p_action,p_quantity,p_expected_quantity,p_reason,
  case when p_action='add' then 'restock' else 'manual_adjustment' end);
end$$;
revoke all on function public.change_inventory_stock(uuid,integer,text,integer,integer,text) from public,anon;
grant execute on function public.change_inventory_stock(uuid,integer,text,integer,integer,text) to authenticated,service_role;
-- Keep the historical RPC signature, but no old caller can bypass the new PIN/journal.
create or replace function public.adjust_inventory_stock(p_request_id uuid,p_inventory_id integer,p_quantity_delta integer,p_movement_type text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$begin
 return app_private.apply_inventory_change(p_request_id,p_inventory_id,'delta',p_quantity_delta,null,p_reason,p_movement_type);
end$$;
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
    'read_contracts',jsonb_build_object('repair_families',1,'receipt_archive',1,'catalog_icons',1,'icon_preferences',1,'inventory_retirement',1),
    'icon_preferences',coalesce((select jsonb_agg(to_jsonb(p) order by p.icon_id) from public.icon_preferences p),'[]'::jsonb)
  ) into result from public.shop_config sc where sc.id=1;
  return result;
end $$;

create or replace function public.shop_backend_capabilities() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sc public.shop_config;bc app_private.bridge_config;caps jsonb;
begin
  select * into strict sc from public.shop_config where id=1;select * into strict bc from app_private.bridge_config where singleton;
  caps:=jsonb_build_object(
    'inventory-retirement',
      (select count(*)=4 from information_schema.columns where table_schema='public' and table_name='inventory' and column_name in ('retired_at','retired_by','retirement_reason','retirement_request_id'))
      and coalesce((select relrowsecurity from pg_class where oid=to_regclass('app_private.inventory_change_requests')),false)
      and not has_table_privilege('authenticated','app_private.inventory_change_requests','SELECT')
      and exists(select 1 from pg_trigger where tgrelid='public.inventory'::regclass and tgname='inventory_protect_retirement' and tgenabled<>'D')
      and exists(select 1 from pg_trigger where tgrelid=to_regclass('app_private.inventory_change_requests') and tgname='inventory_change_requests_immutable' and tgenabled<>'D')
      and to_regprocedure('public.change_inventory_stock(uuid,integer,text,integer,integer,text)') is not null
      and has_function_privilege('authenticated','public.change_inventory_stock(uuid,integer,text,integer,integer,text)','EXECUTE')
      and not has_table_privilege('authenticated','public.inventory','DELETE')
      and not has_function_privilege('authenticated','public.verify_override_pin_guarded(uuid,text,text)','EXECUTE')
      and has_function_privilege('service_role','public.verify_override_pin_guarded(uuid,text,text)','EXECUTE')
      and not has_function_privilege('anon','public.change_inventory_stock(uuid,integer,text,integer,integer,text)','EXECUTE')
      and not has_function_privilege('authenticated','app_private.apply_inventory_change(uuid,integer,text,integer,integer,text,text)','EXECUTE')
      and exists(select 1 from pg_constraint where conrelid='public.inventory'::regclass and conname='inventory_retirement_shape'),
    'icon-label-preferences',
      coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.icon_preferences')),false)
      and (select count(*)=4 from pg_policy where polrelid=to_regclass('public.icon_preferences') and polname in ('icon_preferences_read','icon_preferences_insert','icon_preferences_update','support_consent_guard'))
      and exists(select 1 from pg_policy where polrelid=to_regclass('public.icon_preferences') and polname='support_consent_guard' and not polpermissive)
      and has_table_privilege('authenticated','public.icon_preferences','SELECT')
      and has_table_privilege('authenticated','public.icon_preferences','INSERT')
      and has_table_privilege('authenticated','public.icon_preferences','UPDATE')
      and not has_table_privilege('anon','public.icon_preferences','SELECT')
      and not has_table_privilege('authenticated','public.icon_preferences','DELETE')
      and exists(select 1 from pg_constraint where conrelid=to_regclass('public.icon_preferences') and conname='icon_preferences_contexts'),
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
create or replace function public.get_retail_return_context(p_sale_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor public.app_users%rowtype;
  sale_row public.sales%rowtype;
begin
  perform public.support_request_guard();
  select au.* into actor from public.app_users au
  where au.auth_user_id=(select auth.uid()) and au.status='Active';
  if actor.auth_user_id is null
    or actor.role not in ('Business Owner','Manager','Cashier','Orbito Support')
    or not app_private.current_client_access_allowed() then
    raise exception 'Retail return lookup is not authorized' using errcode='42501';
  end if;
  select s.* into sale_row from public.sales s where s.id=p_sale_id;
  if sale_row.id is null then
    raise exception 'Source sale not found' using errcode='22023';
  end if;
  return jsonb_build_object(
    'sale',jsonb_build_object('id',sale_row.id,'invoiceNumber',sale_row.invoice_number,
      'customerName',sale_row.customer_name,'createdAt',sale_row.created_at),
    'lines',coalesce((select jsonb_agg(jsonb_build_object(
      'saleLineId',sl.id,'itemKind',sl.item_kind,'inventoryRetired',coalesce((select i.retired_at is not null from public.inventory i where i.id=sl.inventory_id),false),'inventoryId',sl.inventory_id,
      'name',sl.name_snapshot,'variantName',sl.variant_snapshot,
      'soldQuantity',sl.quantity,
      'alreadyReturned',coalesce(prior.quantity,0),
      'remainingQuantity',sl.quantity-coalesce(prior.quantity,0),
      'unitPrice',sl.unit_price,'lineTotal',sl.line_total,
      'grossLineValue',app_private.sale_line_gross_value(sl.id),
      'alreadyReduced',coalesce(prior.reduction,0),
      'remainingValue',app_private.sale_line_gross_value(sl.id)-coalesce(prior.reduction,0)
    ) order by sl.line_number) from public.sale_lines sl
      left join lateral (select sum(rl.quantity)::integer quantity,sum(rl.refund_amount) reduction
        from public.return_lines rl where rl.sale_line_id=sl.id) prior on true
      where sl.sale_id=sale_row.id),'[]'::jsonb),
    'financial',jsonb_build_object(
      'originalObligation',sale_row.total_bill,
      'commercialReduction',coalesce((select sum(rl.refund_amount)
        from public.return_lines rl join public.returns r on r.id=rl.return_id
        where r.original_sale_id=sale_row.id),0),
      'paymentsReceived',coalesce((select sum(p.amount) from public.payments p where p.sale_id=sale_row.id),0),
      'refundsPaid',coalesce((select sum(r.amount) from public.refunds r where r.sale_id=sale_row.id),0)
    )
  );
end;
$$;
