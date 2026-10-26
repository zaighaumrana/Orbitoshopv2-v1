-- M2 read contracts. Additive; no business rows, write authority, or old release
-- packages are changed. Both APIs execute as the caller under existing RLS.
-- Offsets describe a stationary result set, not a cross-request MVCC snapshot.
-- EXPLAIN on 100k history showed the existing stable consent predicate running
-- per row. A statement initplan preserves its current actor/consent snapshot.
-- Keep the original restrictive policy, roles and WITH CHECK semantics. Bound
-- DDL lock waiting; the existing atomic installer rolls the step back on failure.
set local lock_timeout='5s';
alter policy support_consent_guard on public.tickets
  using ((select app_private.support_access_allowed()))
  with check ((select app_private.support_access_allowed()));
alter policy support_consent_guard on public.sales
  using ((select app_private.support_access_allowed()))
  with check ((select app_private.support_access_allowed()));

create function public.get_repair_family_page(
  p_search text default '', p_context text default 'admin',
  p_status text default 'all', p_offset integer default 0, p_limit integer default 25
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare actor text; config jsonb; result jsonb; query text:=lower(btrim(coalesce(p_search,'')));
begin
  perform public.support_request_guard();
  actor:=app_private.current_app_role();
  config:=public.get_app_config();
  if actor is null or not coalesce((config->>'repair_module_enabled')::boolean,false)
    or p_context is null or p_context not in ('admin','workshop','collection')
    or (p_context='admin' and actor not in ('Business Owner','Manager','Orbito Support'))
    or (p_context='collection' and actor not in ('Business Owner','Cashier','Orbito Support'))
    or (p_context='workshop' and (actor not in ('Business Owner','Technician','Orbito Support')
      or not coalesce((config->>'technician_module_enabled')::boolean,false))) then
    raise exception 'Repair view unavailable' using errcode='42501';
  end if;
  if p_offset is null or p_offset<0 or p_offset>10000000 or p_limit is null or p_limit<1 or p_limit>50
    or length(query)>200 or p_status is null or p_status not in ('all','Pending','In Progress','Ready','Delivered','Declined','Cancelled') then
    raise exception 'Invalid repair page' using errcode='22023';
  end if;
  with matched as materialized (
    select distinct coalesce(t.parent_ticket_id,t.id) root_id
    from public.tickets t
    where query='' or strpos(lower(concat_ws(' ',nullif(t.customer_name,''),nullif(t.customer_phone,''),
      nullif(t.device_brand,''),nullif(t.device_model,''),nullif(t.imei,''),nullif(t.ticket_number,''),
      nullif(t.invoice_number,''),nullif(t.status,''))),query)>0
  ), scope as materialized (
    select r.id,r.created_at,r.status from public.tickets r join matched m on m.root_id=r.id
    where r.parent_ticket_id is null
      and (p_context<>'workshop' or r.status not in ('Delivered','Declined','Cancelled'))
  ), filtered as materialized (
    select * from scope where p_status='all' or status=p_status
  ), page as (
    select * from filtered order by created_at desc nulls last,id desc limit p_limit offset p_offset
  ) select jsonb_build_object('contract',1,'offset',p_offset,'size',p_limit,
    'count',(select count(*) from filtered),
    'statusCounts',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from
      (select coalesce(status,'Unknown') status,count(*) n from scope group by coalesce(status,'Unknown')) c),
    'rows',(select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc nulls last,p.id desc),'[]'::jsonb) from page p)) into result;
  return result;
end $$;

-- Keep existing evidence and bridge/billing/Support delivery semantics intact.
-- This is structural evidence, never a self-attested release/source fingerprint.
create or replace function public.shop_backend_capabilities() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sc public.shop_config;bc app_private.bridge_config;caps jsonb;
begin
  select * into strict sc from public.shop_config where id=1;select * into strict bc from app_private.bridge_config where singleton;
  caps:=jsonb_build_object(
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
revoke all on function public.get_repair_family_page(text,text,text,integer,integer) from public,anon,service_role;
grant execute on function public.get_repair_family_page(text,text,text,integer,integer) to authenticated;

create function public.get_receipt_archive_page(
  p_search text default '', p_type text default 'all',
  p_from timestamptz default null, p_to timestamptz default null,
  p_offset integer default 0, p_limit integer default 25
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare actor text; config jsonb; result jsonb; query text:=lower(btrim(coalesce(p_search,''))); repairs boolean;
begin
  perform public.support_request_guard();
  actor:=app_private.current_app_role();config:=public.get_app_config();
  if actor is null or actor not in ('Business Owner','Manager','Orbito Support') then
    raise exception 'Receipt archive unavailable' using errcode='42501';
  end if;
  repairs:=coalesce((config->>'repair_module_enabled')::boolean,false);
  if p_offset is null or p_offset<0 or p_offset>10000000 or p_limit is null or p_limit<1 or p_limit>50
    or length(query)>200 or p_type is null or p_type not in ('all','retail','repair')
    or (p_from is not null and p_to is not null and p_to<=p_from) then
    raise exception 'Invalid receipt page' using errcode='22023';
  end if;
  with headers as materialized (
    select 'sale:'||s.id key,'sale' kind,case when s.ticket_id is null then 'retail' else 'repair' end type,
      case when s.ticket_id is null then 'Retail' else 'Repair' end label,
      s.id,null::bigint "rootTicketId",coalesce(nullif(s.invoice_number,''),'INV-'||s.id) "invoiceNumber",
      ''::text "ticketNumber",''::text "parentInvoiceNumber",''::text "parentTicketNumber",
      coalesce(nullif(s.customer_name,''),'Walk-in') "customerName",''::text "customerPhone",''::text device,
      coalesce(nullif(s.payment_method,''),'—') "paymentMethod",coalesce(s.employee_name,'') "employeeName",
      coalesce(s.total_bill,0) total,s.created_at "createdAt"
    from public.sales s
    where not repairs or not exists(select 1 from public.tickets t where t.id=s.ticket_id or (t.invoice_number is not null and t.invoice_number=s.invoice_number))
    union all
    select 'ticket:'||t.id,'ticket','repair',case when t.parent_ticket_id is null then 'Repair' else 'Repair · Child' end,
      t.id,coalesce(t.parent_ticket_id,t.id),t.invoice_number,coalesce(t.ticket_number,''),coalesce(p.invoice_number,''),coalesce(p.ticket_number,''),
      coalesce(nullif(t.customer_name,''),'Walk-in'),coalesce(t.customer_phone,''),btrim(coalesce(t.device_brand,'')||' '||coalesce(t.device_model,'')),
      coalesce(nullif(t.advance_method,''),case when coalesce(t.amount_paid,0)>0 then 'Recorded payment' else 'Unpaid' end),coalesce(t.created_by,''),
      coalesce(nullif(t.final_total,0),t.estimated_quote,0),coalesce(t.placed_at at time zone 'UTC',t.created_at)
    from public.tickets t left join public.tickets p on p.id=t.parent_ticket_id
    where repairs and nullif(t.invoice_number,'') is not null
  ), typed as materialized (select * from headers where p_type='all' or type=p_type),
  exact as materialized (select * from typed where query<>'' and kind='ticket' and lower(btrim("invoiceNumber"))=query),
  eligible_exact as materialized (select * from exact where (p_from is null or "createdAt">=p_from) and (p_to is null or "createdAt"<p_to)),
  filtered as materialized (
    select * from typed h where
      case when exists(select 1 from exact) then h.kind='ticket' and exists(select 1 from eligible_exact e where e."rootTicketId"=h."rootTicketId")
      else (p_from is null or h."createdAt">=p_from) and (p_to is null or h."createdAt"<p_to)
        and (query='' or strpos(lower(concat_ws(' ',nullif(h."invoiceNumber",''),nullif(h."ticketNumber",''),nullif(h."parentInvoiceNumber",''),nullif(h."parentTicketNumber",''),
          nullif(h."customerName",''),nullif(h."customerPhone",''),nullif(h.device,''),nullif(h."paymentMethod",''),nullif(h."employeeName",''),nullif(h.label,''))),query)>0)
      end
  ), page as (select * from filtered order by "createdAt" desc nulls last,kind asc,id desc limit p_limit offset p_offset)
  select jsonb_build_object('contract',1,'offset',p_offset,'size',p_limit,'count',(select count(*) from filtered),
    -- Exact invoice search selects a family. Caller reads that family completely
    -- and uses the existing pure helper for its parent/child natural sort; never
    -- claim a paged family is complete or replace localeCompare with SQL collation.
    'mode',case when exists(select 1 from exact) then 'family' else 'page' end,
    'matches',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'rootTicketId',"rootTicketId") order by id),'[]'::jsonb) from eligible_exact),
    'rows',case when exists(select 1 from exact) then '[]'::jsonb else (select coalesce(jsonb_agg(to_jsonb(p) order by p."createdAt" desc nulls last,p.kind asc,p.id desc),'[]'::jsonb) from page p) end) into result;
  -- Case-insensitive legacy duplicates must never make a response unbounded.
  if jsonb_array_length(result->'matches')>50 then raise exception 'Ambiguous invoice selection exceeds safe family limit' using errcode='54000';end if;
  return result;
end $$;
revoke all on function public.get_receipt_archive_page(text,text,timestamptz,timestamptz,integer,integer) from public,anon,service_role;
grant execute on function public.get_receipt_archive_page(text,text,timestamptz,timestamptz,integer,integer) to authenticated;

-- Authenticated bootstrap advertises only API availability. It is never an
-- authorization decision. Older releases omit read_contracts and remain usable.
-- The installer executes this whole migration and ledger entry atomically.
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
    'read_contracts',jsonb_build_object('repair_families',1,'receipt_archive',1)
  ) into result from public.shop_config sc where sc.id=1;
  return result;
end $$;
