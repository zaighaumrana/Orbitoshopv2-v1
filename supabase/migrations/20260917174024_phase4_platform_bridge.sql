-- Shop-owned bridge contract v1. No Platform tables or network calls.
-- Default legacy mode holds usage delivery until an explicit reconciled cutover.
create table app_private.bridge_config (
  singleton boolean primary key default true check (singleton),
  source_id uuid not null unique default gen_random_uuid(),
  client_binding text,
  delivery_enabled boolean not null default false,
  usage_mode text not null default 'legacy' check (usage_mode in ('legacy','bridge')),
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  check (not delivery_enabled or nullif(btrim(client_binding),'') is not null)
);
insert into app_private.bridge_config(singleton) values(true);

create table app_private.bridge_events (
  event_id uuid primary key,
  source_id uuid not null,
  source_sequence bigint not null check (source_sequence > 0),
  kind text not null check (kind in ('usage','thermal','resupply')),
  operation text not null,
  operation_id uuid not null,
  body jsonb not null check (jsonb_typeof(body)='object'),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  schema_version integer not null default 1 check (schema_version=1),
  unique(source_id,source_sequence),
  unique(kind,operation,operation_id)
);
create table app_private.bridge_outbox (
  event_id uuid primary key references app_private.bridge_events(event_id),
  state text not null check (state in ('held_legacy','pending','leased','acknowledged')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_id uuid,
  lease_until timestamptz,
  acknowledged_at timestamptz,
  last_error text
);
create index bridge_outbox_due on app_private.bridge_outbox(next_attempt_at)
  where state in ('pending','leased');

create table app_private.billing_projection (
  singleton boolean primary key default true check (singleton),
  source_id uuid not null,
  sync_version bigint not null check (sync_version > 0),
  payload jsonb not null,
  last_synced_at timestamptz not null default clock_timestamp()
);
create table app_private.paper_resupply_requests (
  request_id uuid primary key,
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default clock_timestamp(),
  status text not null default 'requested' check (status in ('requested','approved','dispatched','fulfilled','rejected','cancelled')),
  sync_version bigint not null default 0,
  platform_updated_at timestamptz
);
create unique index paper_resupply_one_active on app_private.paper_resupply_requests((true))
  where status in ('requested','approved','dispatched');

alter table app_private.bridge_config enable row level security;
alter table app_private.bridge_events enable row level security;
alter table app_private.bridge_outbox enable row level security;
alter table app_private.billing_projection enable row level security;
alter table app_private.paper_resupply_requests enable row level security;
revoke all on app_private.bridge_config,app_private.bridge_events,app_private.bridge_outbox,
  app_private.billing_projection,app_private.paper_resupply_requests from public,anon,authenticated;

create function app_private.reject_bridge_event_mutation() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Bridge events are immutable' using errcode='55000'; end $$;
revoke all on function app_private.reject_bridge_event_mutation() from public,anon,authenticated;
create trigger bridge_events_immutable before update or delete on app_private.bridge_events
  for each row execute function app_private.reject_bridge_event_mutation();

-- Only transaction implementations may call this: no browser-created BILLs.
create function app_private.append_bridge_event(
  p_kind text,p_operation text,p_operation_id uuid,p_body jsonb,p_occurred_at timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
declare cfg app_private.bridge_config%rowtype; old app_private.bridge_events%rowtype; eid uuid;
begin
  if p_operation_id is null or p_operation is null or p_body is null or p_occurred_at is null then
    raise exception 'Incomplete bridge event' using errcode='22023';
  end if;
  -- Serializes allocation AND commit; rollback does not consume a sequence.
  select * into strict cfg from app_private.bridge_config where singleton for update;
  select * into old from app_private.bridge_events where kind=p_kind and operation=p_operation and operation_id=p_operation_id;
  if found then
    if old.body<>p_body then raise exception 'Event identity conflict' using errcode='22023'; end if;
    return old.event_id;
  end if;
  eid:=gen_random_uuid();
  update app_private.bridge_config set last_sequence=last_sequence+1 where singleton;
  insert into app_private.bridge_events(event_id,source_id,source_sequence,kind,operation,operation_id,body,occurred_at)
    values(eid,cfg.source_id,cfg.last_sequence+1,p_kind,p_operation,p_operation_id,p_body,p_occurred_at);
  insert into app_private.bridge_outbox(event_id,state)
    values(eid,case when p_kind='usage' and cfg.usage_mode='legacy' then 'held_legacy' else 'pending' end);
  return eid;
end $$;
revoke all on function app_private.append_bridge_event(text,text,uuid,jsonb,timestamptz) from public,anon,authenticated;

-- Lease/ack is at-least-once. Platform MUST deduplicate immutable event_id and
-- reject conflicting payloads before acknowledging. No prefix-ACK assumption.
create function public.bridge_claim_outbox(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg app_private.bridge_config%rowtype; lid uuid:=gen_random_uuid(); result jsonb;
begin
  select * into strict cfg from app_private.bridge_config where singleton;
  if not cfg.delivery_enabled then return jsonb_build_object('enabled',false,'events','[]'::jsonb); end if;
  with due as (
    select o.event_id from app_private.bridge_outbox o
    where (o.state='pending' and o.next_attempt_at<=clock_timestamp())
       or (o.state='leased' and o.lease_until<=clock_timestamp())
    order by o.next_attempt_at,o.event_id limit greatest(1,least(coalesce(p_limit,50),100))
    for update skip locked
  ), claimed as (
    update app_private.bridge_outbox o set state='leased',lease_id=lid,
      lease_until=clock_timestamp()+interval '2 minutes',attempts=attempts+1
    from due where o.event_id=due.event_id returning o.event_id
  ) select coalesce(jsonb_agg(jsonb_build_object(
    'event_id',e.event_id,'source_id',e.source_id,'source_sequence',e.source_sequence,
    'kind',e.kind,'operation',e.operation,'operation_id',e.operation_id,
    'body',e.body,'occurred_at',e.occurred_at,'schema_version',e.schema_version
  ) order by e.source_sequence),'[]'::jsonb) into result
  from claimed c join app_private.bridge_events e using(event_id);
  return jsonb_build_object('enabled',true,'source_id',cfg.source_id,'client_binding',cfg.client_binding,'lease_id',lid,'events',result);
end $$;
revoke all on function public.bridge_claim_outbox(integer) from public,anon,authenticated;
grant execute on function public.bridge_claim_outbox(integer) to service_role;

create function public.bridge_finish_delivery(p_event_id uuid,p_lease_id uuid,p_accepted boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if p_accepted is null then raise exception 'Missing delivery outcome' using errcode='22023'; end if;
  update app_private.bridge_outbox set
    state=case when p_accepted then 'acknowledged' else 'pending' end,
    acknowledged_at=case when p_accepted then clock_timestamp() else null end,
    next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,30*greatest(1,attempts))),
    last_error=case when p_accepted then null else 'Platform delivery not acknowledged' end,
    lease_id=null,lease_until=null
  where event_id=p_event_id and lease_id=p_lease_id and state='leased';
  get diagnostics changed=row_count;
  return changed=1;
end $$;
revoke all on function public.bridge_finish_delivery(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.bridge_finish_delivery(uuid,uuid,boolean) to service_role;

-- Public read is narrowly projected; raw metering is never exposed, even to Owner.
create function public.get_platform_billing()
returns jsonb language plpgsql security definer set search_path='' as $$
declare projection app_private.billing_projection%rowtype;
begin
  if auth.uid() is null or app_private.current_app_role() is distinct from 'Business Owner'
      or not app_private.current_client_access_allowed() then
    raise exception 'Business Owner access required' using errcode='42501';
  end if;
  select * into projection from app_private.billing_projection where singleton;
  if not found then return jsonb_build_object('available',false); end if;
  return jsonb_build_object('available',true,'sync_version',projection.sync_version,
    'last_synced_at',projection.last_synced_at,'projection',projection.payload);
end $$;
revoke all on function public.get_platform_billing() from public,anon;
grant execute on function public.get_platform_billing() to authenticated;

-- Complete customer-safe replacement, never a partial status/money merge.
create function public.bridge_apply_billing(p_source_id uuid,p_version bigint,p_payload jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare cfg app_private.bridge_config%rowtype; prior app_private.billing_projection%rowtype; invoice jsonb; k text;
begin
  select * into strict cfg from app_private.bridge_config where singleton for update;
  if p_source_id is distinct from cfg.source_id then raise exception 'Source mismatch' using errcode='22023'; end if;
  if p_version is null or p_version<1 or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or not (p_payload ?& array['schema_version','currency','platform_updated_at','paper_resupply_enabled',
      'usage','invoices','outstanding_total','estimated_current_charges','recent_billing',
      'billed_through','settled_through','estimate_through','pricing_version'])
    or (p_payload-array['schema_version','currency','platform_updated_at','paper_resupply_enabled',
      'usage','invoices','outstanding_total','estimated_current_charges','recent_billing',
      'billed_through','settled_through','estimate_through','pricing_version'])<>'{}'::jsonb then
    raise exception 'Incomplete or unsupported projection' using errcode='22023';
  end if;
  if p_payload->'schema_version'<>'1'::jsonb or jsonb_typeof(p_payload->'currency')<>'string'
    or p_payload->>'currency' !~ '^[A-Z]{3}$'
    or jsonb_typeof(p_payload->'platform_updated_at')<>'string'
    or jsonb_typeof(p_payload->'paper_resupply_enabled')<>'boolean'
    or jsonb_typeof(p_payload->'usage')<>'object'
    or not ((p_payload->'usage') ?& array['BILL','INVENTORY'])
    or ((p_payload->'usage')-array['BILL','INVENTORY'])<>'{}'::jsonb
    or jsonb_typeof(p_payload->'invoices')<>'array'
    or jsonb_typeof(p_payload->'recent_billing') not in ('string','null')
    or jsonb_typeof(p_payload->'pricing_version') not in ('string','null') then
    raise exception 'Invalid projection shape' using errcode='22023';
  end if;
  perform (p_payload->>'platform_updated_at')::timestamptz;
  foreach k in array array['outstanding_total','estimated_current_charges','billed_through','settled_through','estimate_through'] loop
    if jsonb_typeof(p_payload->k) not in ('number','null') or coalesce((p_payload->>k)::numeric,0)<0 then
      raise exception 'Invalid projection amount or boundary' using errcode='22023';
    end if;
  end loop;
  foreach k in array array['BILL','INVENTORY'] loop
    if jsonb_typeof(p_payload->'usage'->k) not in ('number','null')
      or coalesce((p_payload->'usage'->>k)::numeric,0)<0
      or coalesce((p_payload->'usage'->>k)::numeric,0)<>trunc(coalesce((p_payload->'usage'->>k)::numeric,0)) then
      raise exception 'Invalid usage count' using errcode='22023';
    end if;
  end loop;
  for invoice in select value from jsonb_array_elements(p_payload->'invoices') loop
    if jsonb_typeof(invoice)<>'object' or not (invoice ?& array['id','reference','period','status','total','paid','outstanding'])
      or (invoice-array['id','reference','period','status','total','paid','outstanding'])<>'{}'::jsonb then
      raise exception 'Invalid invoice shape' using errcode='22023';
    end if;
    foreach k in array array['id','reference','period','status'] loop
      if jsonb_typeof(invoice->k)<>'string' then raise exception 'Invalid invoice text' using errcode='22023'; end if;
    end loop;
    foreach k in array array['total','paid','outstanding'] loop
      if jsonb_typeof(invoice->k) not in ('number','null') or coalesce((invoice->>k)::numeric,0)<0 then
        raise exception 'Invalid invoice amount' using errcode='22023';
      end if;
    end loop;
  end loop;
  select * into prior from app_private.billing_projection where singleton;
  if found and prior.sync_version>p_version then return 'stale'; end if;
  if found and prior.sync_version=p_version then
    if prior.payload<>p_payload then raise exception 'Projection version conflict' using errcode='22023'; end if;
    return 'unchanged';
  end if;
  insert into app_private.billing_projection(singleton,source_id,sync_version,payload)
    values(true,cfg.source_id,p_version,p_payload)
    on conflict(singleton) do update set source_id=excluded.source_id,sync_version=excluded.sync_version,
      payload=excluded.payload,last_synced_at=clock_timestamp();
  return 'applied';
end $$;
revoke all on function public.bridge_apply_billing(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.bridge_apply_billing(uuid,bigint,jsonb) to service_role;

create function public.request_paper_resupply(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing app_private.paper_resupply_requests%rowtype; enabled boolean; requested timestamptz;
begin
  if auth.uid() is null or app_private.current_app_role() is distinct from 'Business Owner'
    or not app_private.current_client_access_allowed() then
    raise exception 'Business Owner access required' using errcode='42501';
  end if;
  if p_request_id is null then raise exception 'Request identity required' using errcode='22023'; end if;
  perform 1 from app_private.bridge_config where singleton for update;
  select * into existing from app_private.paper_resupply_requests where request_id=p_request_id;
  if found then
    if existing.requested_by<>auth.uid() then raise exception 'Request identity conflict' using errcode='22023'; end if;
    return jsonb_build_object('accepted',true,'request_id',existing.request_id,'replayed',true);
  end if;
  select (payload->>'paper_resupply_enabled')::boolean into enabled from app_private.billing_projection where singleton;
  if not coalesce(enabled,false) then raise exception 'Paper resupply is unavailable' using errcode='42501'; end if;
  select * into existing from app_private.paper_resupply_requests where status in ('requested','approved','dispatched');
  if found then return jsonb_build_object('accepted',true,'request_id',existing.request_id,'already_active',true); end if;
  insert into app_private.paper_resupply_requests(request_id,requested_by) values(p_request_id,auth.uid())
    returning requested_at into requested;
  perform app_private.append_bridge_event('resupply','request_paper_resupply',p_request_id,
    jsonb_build_object('request_id',p_request_id,'requested_at',requested,'schema_version',1),requested);
  return jsonb_build_object('accepted',true,'request_id',p_request_id);
end $$;
revoke all on function public.request_paper_resupply(uuid) from public,anon;
grant execute on function public.request_paper_resupply(uuid) to authenticated;

create function public.bridge_apply_resupply(p_source_id uuid,p_request_id uuid,p_version bigint,p_status text,p_updated_at timestamptz)
returns text language plpgsql security definer set search_path='' as $$
declare old app_private.paper_resupply_requests%rowtype;
begin
  perform 1 from app_private.bridge_config where singleton and source_id=p_source_id for update;
  if not found then raise exception 'Source mismatch' using errcode='22023'; end if;
  if p_version is null or p_version<1 or p_status is null or p_updated_at is null
    or p_status not in ('requested','approved','dispatched','fulfilled','rejected','cancelled') then
    raise exception 'Invalid lifecycle revision' using errcode='22023';
  end if;
  select * into strict old from app_private.paper_resupply_requests where request_id=p_request_id for update;
  if old.sync_version>p_version then return 'stale'; end if;
  if old.sync_version=p_version then
    if old.status<>p_status or old.platform_updated_at is distinct from p_updated_at then
      raise exception 'Lifecycle revision conflict' using errcode='22023';
    end if;
    return 'unchanged';
  end if;
  if old.status in ('fulfilled','rejected','cancelled') and old.status<>p_status then
    raise exception 'Terminal request cannot reopen' using errcode='22023';
  end if;
  update app_private.paper_resupply_requests set status=p_status,sync_version=p_version,platform_updated_at=p_updated_at
    where request_id=p_request_id;
  return 'applied';
end $$;
revoke all on function public.bridge_apply_resupply(uuid,uuid,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.bridge_apply_resupply(uuid,uuid,bigint,text,timestamptz) to service_role;

-- Software measurement is untrusted print intent, not proof of physical use.
-- Document existence/access is checked without returning financial information.
create function public.record_thermal_intent(p_request_id uuid,p_actor_id uuid,p_intent jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text; document_id bigint; document_type text; reference text;
  copies integer; estimated integer; occurred timestamptz; fingerprint text;
  existing app_private.bridge_events%rowtype; original uuid; eid uuid;
begin
  actor_role:=app_private.current_app_role();
  if auth.uid() is null or p_actor_id is distinct from auth.uid()
    or not app_private.current_client_access_allowed() then
    raise exception 'Print metering is not authorized' using errcode='42501';
  end if;
  if p_request_id is null or p_intent is null or jsonb_typeof(p_intent)<>'object'
    or not (p_intent ?& array['document_type','document_reference','is_reprint','occurred_at','copies',
      'estimated_mm','paper_width_mm','measurement_status','template_version','measurement_version','calibration_version'])
    or (p_intent-array['document_type','document_reference','is_reprint','occurred_at','copies',
      'estimated_mm','paper_width_mm','measurement_status','template_version','measurement_version','calibration_version'])<>'{}'::jsonb
    or p_intent->'paper_width_mm' is distinct from '80'::jsonb
    or jsonb_typeof(p_intent->'is_reprint')<>'boolean'
    or jsonb_typeof(p_intent->'document_reference')<>'string'
    or p_intent->>'template_version' is distinct from 'thermal-80-v1'
    or p_intent->>'measurement_version' is distinct from 'css-height-v1'
    or p_intent->>'calibration_version' is distinct from 'feed-6mm-v1' then
    raise exception 'Invalid thermal intent shape' using errcode='22023';
  end if;
  if coalesce(p_intent->>'copies','') !~ '^[0-9]+$'
    or jsonb_typeof(p_intent->'copies')<>'number' then
    raise exception 'Invalid copies' using errcode='22023';
  end if;
  copies:=(p_intent->>'copies')::integer;
  if copies<1 or copies>20 then raise exception 'Invalid copies' using errcode='22023'; end if;
  if p_intent->>'measurement_status'='estimated' then
    if jsonb_typeof(p_intent->'estimated_mm')<>'number' or coalesce(p_intent->>'estimated_mm','') !~ '^[0-9]+$' then
      raise exception 'Invalid measurement' using errcode='22023';
    end if;
    estimated:=(p_intent->>'estimated_mm')::integer;
    if estimated<1 or estimated>1000000 then raise exception 'Invalid measurement' using errcode='22023'; end if;
  elsif p_intent->>'measurement_status'='unavailable' then
    if p_intent->'estimated_mm'<>'null'::jsonb then raise exception 'Unavailable is not zero' using errcode='22023'; end if;
  else raise exception 'Invalid measurement status' using errcode='22023'; end if;
  occurred:=(p_intent->>'occurred_at')::timestamptz;
  if occurred is null or not isfinite(occurred) or occurred<'2000-01-01'::timestamptz or occurred>clock_timestamp()+interval '1 day' then
    raise exception 'Invalid print time' using errcode='22023';
  end if;
  document_type:=p_intent->>'document_type'; reference:=p_intent->>'document_reference';
  if document_type in ('retail_receipt','return_slip') then
    if actor_role not in ('Business Owner','Manager','Cashier','Orbito Support') then
      raise exception 'Document access denied' using errcode='42501';
    end if;
    select id into document_id from public.sales where invoice_number=reference
      or ('INV-'||id::text)=reference or ('#'||id::text)=reference order by id limit 1;
  elsif document_type in ('repair_parent','repair_child','repair_summary') then
    if actor_role not in ('Business Owner','Manager','Cashier','Orbito Support','Technician')
      or (actor_role='Technician' and document_type<>'repair_child') then
      raise exception 'Document access denied' using errcode='42501';
    end if;
    if not exists(select 1 from public.shop_config where id=1 and repair_module_enabled
      and (actor_role<>'Technician' or technician_module_enabled)) then
      raise exception 'Repair access unavailable' using errcode='42501';
    end if;
    select id into document_id from public.tickets where (invoice_number=reference or ticket_number=reference)
      and ((document_type='repair_child' and parent_ticket_id is not null)
        or (document_type<>'repair_child' and parent_ticket_id is null)) order by id limit 1;
  else raise exception 'Unsupported thermal document' using errcode='22023'; end if;
  if document_id is null then raise exception 'Print document not found' using errcode='22023'; end if;
  fingerprint:=encode(extensions.digest(p_intent::text||':'||auth.uid()::text,'sha256'),'hex');
  perform 1 from app_private.bridge_config where singleton for update;
  select * into existing from app_private.bridge_events where kind='thermal' and operation='print_intent' and operation_id=p_request_id;
  if found then
    if existing.body->>'intent_hash'<>fingerprint then raise exception 'Print identity conflict' using errcode='22023'; end if;
    return jsonb_build_object('accepted',true,'event_id',existing.event_id);
  end if;
  select event_id into original from app_private.bridge_events where kind='thermal'
    and body->>'document_type'=document_type and body->>'document_id'=document_id::text order by source_sequence limit 1;
  eid:=app_private.append_bridge_event('thermal','print_intent',p_request_id,jsonb_build_object(
    'document_type',document_type,'document_id',document_id,'copies',copies,'estimated_mm',estimated,
    'paper_width_mm',80,'template_version','thermal-80-v1','measurement_version','css-height-v1',
    'calibration_version','feed-6mm-v1','measurement_status',p_intent->>'measurement_status',
    'is_reprint',(p_intent->>'is_reprint')::boolean or original is not null,
    'original_event_id',original,'intent_hash',fingerprint),occurred);
  return jsonb_build_object('accepted',true,'event_id',eid);
end $$;
revoke all on function public.record_thermal_intent(uuid,uuid,jsonb) from public,anon;
grant execute on function public.record_thermal_intent(uuid,uuid,jsonb) to authenticated;
create index bridge_thermal_document on app_private.bridge_events((body->>'document_type'),(body->>'document_id'),source_sequence)
  where kind='thermal';

-- Preserve the exact financial implementation and its auth checks. Private
-- cores cannot be invoked by browser roles to bypass canonical usage capture.
alter function public.create_retail_sale(uuid,jsonb,jsonb,boolean,text,text) set schema app_private;
alter function public.create_repair_ticket(uuid,jsonb,jsonb) set schema app_private;
alter function public.record_repair_payment(uuid,bigint,jsonb) set schema app_private;
alter function public.create_inventory_item(uuid,text,text,text,numeric,numeric,integer,integer) set schema app_private;
revoke all on function app_private.create_retail_sale(uuid,jsonb,jsonb,boolean,text,text),
  app_private.create_repair_ticket(uuid,jsonb,jsonb),app_private.record_repair_payment(uuid,bigint,jsonb),
  app_private.create_inventory_item(uuid,text,text,text,numeric,numeric,integer,integer) from public,anon,authenticated;

create function app_private.attach_usage_route(p_result jsonb,p_operation text,p_request_id uuid,p_metric text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid; delivery text;
begin
  if not coalesce((p_result->>'idempotentReplay')::boolean,false) then
    eid:=app_private.append_bridge_event('usage',p_operation,p_request_id,
      jsonb_build_object('metric',p_metric,'quantity',1,'unit','event'),clock_timestamp());
  else
    -- Never backfill a historical transaction on an idempotent retry.
    select event_id into eid from app_private.bridge_events
      where kind='usage' and operation=p_operation and operation_id=p_request_id;
  end if;
  select case when state='held_legacy' then 'legacy' else 'bridge' end into delivery
    from app_private.bridge_outbox where event_id=eid;
  return p_result||jsonb_build_object('usageEventId',eid,'usageDelivery',coalesce(delivery,'none'));
end $$;
revoke all on function app_private.attach_usage_route(jsonb,text,uuid,text) from public,anon,authenticated;

create function public.create_retail_sale(p_request_id uuid,p_lines jsonb,p_tenders jsonb default '[]'::jsonb,
  p_allow_credit boolean default false,p_customer_name text default '',p_customer_phone text default '')
returns jsonb language sql security definer set search_path='' as $$
  select app_private.attach_usage_route(
    app_private.create_retail_sale(p_request_id,p_lines,p_tenders,p_allow_credit,p_customer_name,p_customer_phone),
    'create_retail_sale',p_request_id,'BILL');
$$;
create function public.create_repair_ticket(p_request_id uuid,p_ticket jsonb,p_tenders jsonb default '[]'::jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select app_private.attach_usage_route(app_private.create_repair_ticket(p_request_id,p_ticket,p_tenders),
    'create_repair_ticket',p_request_id,'BILL');
$$;
create function public.record_repair_payment(p_request_id uuid,p_root_ticket_id bigint,p_tenders jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select app_private.attach_usage_route(app_private.record_repair_payment(p_request_id,p_root_ticket_id,p_tenders),
    'record_repair_payment',p_request_id,'BILL');
$$;
create function public.create_inventory_item(p_request_id uuid,p_name text,p_sku text,p_category text,p_price numeric,
  p_cost numeric,p_initial_quantity integer,p_min_quantity integer)
returns jsonb language sql security definer set search_path='' as $$
  select app_private.attach_usage_route(
    app_private.create_inventory_item(p_request_id,p_name,p_sku,p_category,p_price,p_cost,p_initial_quantity,p_min_quantity),
    'create_inventory_item',p_request_id,'INVENTORY');
$$;
revoke all on function public.create_retail_sale(uuid,jsonb,jsonb,boolean,text,text),
  public.create_repair_ticket(uuid,jsonb,jsonb),public.record_repair_payment(uuid,bigint,jsonb),
  public.create_inventory_item(uuid,text,text,text,numeric,numeric,integer,integer) from public,anon;
grant execute on function public.create_retail_sale(uuid,jsonb,jsonb,boolean,text,text),
  public.create_repair_ticket(uuid,jsonb,jsonb),public.record_repair_payment(uuid,bigint,jsonb),
  public.create_inventory_item(uuid,text,text,text,numeric,numeric,integer,integer) to authenticated;

-- Udhar settlement preserves its existing non-BILL semantics.
create or replace function public.settle_udhar(
  p_request_id uuid,
  p_kind text,
  p_source_id bigint,
  p_amount numeric,
  p_method text,
  p_cash_tendered numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.app_users%rowtype;
  step_up_id uuid;
  kind_value text := lower(trim(coalesce(p_kind, '')));
  method_value text := trim(coalesce(p_method, ''));
  amount_value numeric(14,2) := round(coalesce(p_amount, 0), 2);
  cash_value numeric(14,2);
  change_value numeric(14,2) := 0;
  existing_payment_id bigint;
  new_payment_id bigint;
  sale_row public.sales%rowtype;
  account jsonb;
  outstanding_value numeric(14,2);
  payment_result jsonb;
begin
  if p_request_id is null or p_source_id is null or p_source_id <= 0
     or kind_value not in ('retail', 'repair')
     or method_value = '' or lower(method_value) in ('udhar', 'udhar (credit)')
     or amount_value <= 0 then
    raise exception 'Invalid Udhar settlement' using errcode = '22023';
  end if;

  if lower(method_value) = 'cash' then
    cash_value := round(coalesce(p_cash_tendered, amount_value), 2);
    if cash_value < amount_value then
      raise exception 'Cash received cannot be less than the payment' using errcode = '22023';
    end if;
    change_value := round(cash_value - amount_value, 2);
  elsif p_cash_tendered is not null then
    raise exception 'Cash tender is valid only for Cash payments' using errcode = '22023';
  end if;

  select au.* into actor from public.app_users au
  where au.auth_user_id = (select auth.uid()) and au.status = 'Active';
  if actor.auth_user_id is null
     or actor.role not in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
     or not app_private.current_client_access_allowed() then
    raise exception 'Udhar settlement is not authorized' using errcode = '42501';
  end if;
  step_up_id := app_private.claim_step_up('settle',p_request_id,'settle_udhar',jsonb_build_array(p_request_id,p_kind,p_source_id,p_amount,p_method,p_cash_tendered));
  if step_up_id is null then
    raise exception 'A valid settlement authorization is required' using errcode = '42501';
  end if;

  select p.id into existing_payment_id from public.payments p
  where p.request_id = md5(p_request_id::text || ':payment:1')::uuid;
  if existing_payment_id is not null then
    return app_private.udhar_account_result(kind_value, p_source_id, true);
  end if;

  if kind_value = 'retail' then
    select s.* into sale_row from public.sales s where s.id = p_source_id for update;
    if sale_row.id is null then
      raise exception 'Retail invoice not found' using errcode = '22023';
    end if;
    if not exists (select 1 from public.credit_approvals ca
      where ca.sale_id = p_source_id and ca.status = 'Active') then
      raise exception 'Retail invoice has no active Udhar approval' using errcode = '42501';
    end if;
    account := app_private.udhar_account_result('retail', p_source_id, false);
    outstanding_value := round(coalesce((account ->> 'outstanding')::numeric, 0), 2);
    if outstanding_value <= 0 or amount_value > outstanding_value then
      raise exception 'Payment exceeds the outstanding Udhar balance' using errcode = '22023';
    end if;

    insert into public.payments (
      request_id, sale_id, amount, method, cash_tendered, change_given,
      source, note, created_by_auth_user_id
    ) values (
      md5(p_request_id::text || ':payment:1')::uuid, p_source_id,
      amount_value, method_value, cash_value, change_value,
      'udhar_settlement', '', actor.auth_user_id
    ) returning id into new_payment_id;
    insert into public.payment_allocations (payment_id, sale_id, amount)
    values (new_payment_id, p_source_id, amount_value);

    account := app_private.udhar_account_result('retail', p_source_id, false);
    outstanding_value := round((account ->> 'outstanding')::numeric, 2);
    if outstanding_value = 0 then
      update public.credit_approvals set status = 'Settled', settled_at = now()
      where sale_id = p_source_id and status = 'Active';
    end if;
    update public.udhar u
    set total_amount = (account ->> 'effectiveObligation')::numeric,
        amount_paid = (account ->> 'netPayments')::numeric,
        balance_due = outstanding_value,
        payment_history = coalesce((select jsonb_agg(jsonb_build_object(
          'date', p.created_at, 'paid', p.amount, 'method', p.method
        ) order by p.created_at, p.id) from public.payments p where p.sale_id = p_source_id), '[]'::jsonb),
        status = case when outstanding_value = 0 then 'Settled' else 'Partial' end,
        settled_at = case when outstanding_value = 0 then now() else null end
    where u.sale_id = p_source_id;
  else
    perform 1 from public.tickets t
    where t.id = p_source_id and t.parent_ticket_id is null for update;
    if not found then
      raise exception 'Repair family not found' using errcode = '22023';
    end if;
    if not exists (select 1 from public.credit_approvals ca
      where ca.repair_root_ticket_id = p_source_id and ca.status = 'Active') then
      raise exception 'Repair family has no active Udhar approval' using errcode = '42501';
    end if;
    account := app_private.udhar_account_result('repair', p_source_id, false);
    outstanding_value := round(coalesce((account ->> 'outstanding')::numeric, 0), 2);
    if outstanding_value <= 0 or amount_value > outstanding_value then
      raise exception 'Payment exceeds the outstanding Udhar balance' using errcode = '22023';
    end if;
    payment_result := app_private.record_repair_payment(
      p_request_id,
      p_source_id,
      jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'method', method_value,
        'amount', amount_value,
        'cashTendered', cash_value
      )))
    );
    account := app_private.udhar_account_result('repair', p_source_id, false);
    outstanding_value := round((account ->> 'outstanding')::numeric, 2);
    if outstanding_value = 0 then
      update public.credit_approvals set status = 'Settled', settled_at = now()
      where repair_root_ticket_id = p_source_id and status = 'Active';
    end if;
  end if;

  return app_private.udhar_account_result(kind_value, p_source_id, false);
end;
$$;
