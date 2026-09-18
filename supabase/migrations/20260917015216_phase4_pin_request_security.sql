-- Phase 4 S2/S3. Staged only; deploy the matching verify-pin function together.
create table app_private.pin_attempts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  failures integer not null default 0 check (failures >= 0),
  locked_until timestamptz,
  last_failed_at timestamptz
);
alter table app_private.pin_attempts enable row level security;
revoke all on app_private.pin_attempts from public, anon, authenticated;

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
    ('admin','settle','return','discount','udhar','remove-component','repair-refund')
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
revoke all on function public.verify_override_pin_guarded(uuid,text,text) from public,anon,authenticated;
grant execute on function public.verify_override_pin_guarded(uuid,text,text) to service_role;

alter table public.step_up_authorizations
  add column consumed_at timestamptz,
  add column consumed_request_id uuid,
  add column consumed_operation text,
  add column consumed_payload jsonb,
  add constraint step_up_claim_shape check (
    (consumed_at is null and consumed_request_id is null and consumed_operation is null and consumed_payload is null)
    or (consumed_at is not null and consumed_request_id is not null and consumed_operation is not null and consumed_payload is not null)
  );
create unique index step_up_request_claim_key on public.step_up_authorizations
  (auth_user_id,purpose,consumed_operation,consumed_request_id) where consumed_at is not null;
create index step_up_available_idx on public.step_up_authorizations
  (auth_user_id,purpose,expires_at desc) where consumed_at is null;

create or replace function app_private.claim_step_up(
  p_purpose text,p_request_id uuid,p_operation text,p_payload jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare approval public.step_up_authorizations%rowtype;
begin
  if auth.uid() is null or p_request_id is null or p_operation is null or p_payload is null
     or not app_private.current_client_access_allowed() then return null; end if;
  -- Same-request callers serialize before checking the durable claim. Different
  -- requests cannot claim the same approval (row lock plus SKIP LOCKED).
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_purpose||':'||p_operation||':'||p_request_id::text,0));
  select * into approval from public.step_up_authorizations
    where auth_user_id=auth.uid() and purpose=p_purpose and consumed_request_id=p_request_id
      and consumed_operation=p_operation for update;
  if approval.id is not null then
    if approval.consumed_payload <> p_payload then
      raise exception 'Request identity conflicts with its authorization' using errcode='22023';
    end if;
    return approval.id; -- Same logical request may retry after the PIN TTL.
  end if;
  select * into approval from public.step_up_authorizations
    where auth_user_id=auth.uid() and purpose=p_purpose and consumed_at is null
      and expires_at>clock_timestamp()
    order by created_at desc,id limit 1 for update skip locked;
  if approval.id is null then return null; end if;
  update public.step_up_authorizations set consumed_at=clock_timestamp(),consumed_request_id=p_request_id,
    consumed_operation=p_operation,consumed_payload=p_payload where id=approval.id;
  return approval.id;
end;
$$;
revoke all on function app_private.claim_step_up(text,uuid,text,jsonb) from public,anon,authenticated;

-- Legacy unscoped checks must not grant reusable authorization. All protected
-- mutations below use request-scoped claims; old direct-write policies fail shut.
create or replace function app_private.has_step_up(requested_purpose text)
returns boolean language sql stable security definer set search_path = '' as $$ select false $$;

-- Phase 3 consumers: only authorization predicates replaced.

-- Source: 20260904210000_phase3_atomic_retail_checkout.sql
create or replace function public.create_retail_sale(
  p_request_id uuid,
  p_lines jsonb,
  p_tenders jsonb default '[]'::jsonb,
  p_allow_credit boolean default false,
  p_customer_name text default '',
  p_customer_phone text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.app_users%rowtype;
  shop public.shop_config%rowtype;
  existing_sale_id bigint;
  new_sale_id bigint;
  new_payment_id bigint;
  invoice_number_value text;
  line_value jsonb;
  tender_value jsonb;
  line_number_value integer := 0;
  quantity_value integer;
  item_kind_value text;
  inventory_id_value integer;
  quick_item_id_value integer;
  name_value text;
  variant_value text;
  original_price_value numeric(14,2);
  unit_price_value numeric(14,2);
  unit_cost_value numeric(14,2);
  line_total_value numeric(14,2);
  discount_value numeric(14,2);
  subtotal_value numeric(14,2) := 0;
  total_discount_value numeric(14,2) := 0;
  tax_value numeric(14,2) := 0;
  total_value numeric(14,2) := 0;
  paid_value numeric(14,2) := 0;
  credit_value numeric(14,2) := 0;
  method_value text;
  amount_value numeric(14,2);
  cash_tendered_value numeric(14,2);
  change_value numeric(14,2);
  total_cash_tendered numeric(14,2) := 0;
  total_change numeric(14,2) := 0;
  tender_count integer := 0;
  compatibility_method text;
  step_up_id uuid;
  inventory_row record;
  requested_inventory_qty integer;
  available_inventory_qty integer;
  compatibility_items jsonb;
  compatibility_history jsonb := '[]'::jsonb;
  quick_prices_value jsonb;
begin
  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  select au.* into actor
  from public.app_users au
  where au.auth_user_id = (select auth.uid())
    and au.status = 'Active';

  if actor.auth_user_id is null
     or actor.role not in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support') then
    raise exception 'Retail checkout is not authorized' using errcode = '42501';
  end if;

  select sc.* into shop
  from public.shop_config sc
  where sc.id = 1
  for update;

  if shop.id is null
     or (coalesce(shop.suspended, false) and actor.role <> 'Orbito Support') then
    raise exception 'Client access is suspended' using errcode = '42501';
  end if;

  select s.id into existing_sale_id
  from public.sales s
  where s.request_id = p_request_id;

  if existing_sale_id is not null then
    return app_private.retail_sale_result(existing_sale_id)
      || jsonb_build_object('idempotentReplay', true);
  end if;

  if jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0
     or jsonb_array_length(p_lines) > 100 then
    raise exception 'Sale must contain between 1 and 100 lines' using errcode = '22023';
  end if;
  if jsonb_typeof(p_tenders) <> 'array'
     or jsonb_array_length(p_tenders) > 10 then
    raise exception 'Invalid payment tenders' using errcode = '22023';
  end if;

  for line_value in select value from jsonb_array_elements(p_lines)
  loop
    line_number_value := line_number_value + 1;
    item_kind_value := lower(trim(coalesce(line_value ->> 'itemKind', '')));
    quantity_value := (line_value ->> 'quantity')::integer;
    original_price_value := round((line_value ->> 'originalPrice')::numeric, 2);
    unit_price_value := round((line_value ->> 'unitPrice')::numeric, 2);

    if item_kind_value not in ('quick', 'inventory', 'other')
       or quantity_value <= 0
       or quantity_value > 10000
       or original_price_value < 0
       or unit_price_value < 0
       or unit_price_value > original_price_value then
      raise exception 'Invalid sale line %', line_number_value using errcode = '22023';
    end if;

    inventory_id_value := null;
    quick_item_id_value := null;
    name_value := trim(coalesce(line_value ->> 'name', ''));
    variant_value := left(trim(coalesce(line_value ->> 'variantName', '')), 500);
    unit_cost_value := null;

    if item_kind_value = 'inventory' then
      if not coalesce(shop.inventory_module_enabled, false) then
        raise exception 'Inventory module is not enabled' using errcode = '42501';
      end if;
      inventory_id_value := (line_value ->> 'inventoryId')::integer;
      select i.name, round(coalesce(i.cost, 0)::numeric, 2),
             round(coalesce(i.price, 0)::numeric, 2)
        into name_value, unit_cost_value, original_price_value
      from public.inventory i
      where i.id = inventory_id_value;
      if name_value is null then
        raise exception 'Inventory item not found' using errcode = '22023';
      end if;
    elsif item_kind_value = 'quick' then
      quick_item_id_value := (line_value ->> 'quickItemId')::integer;
      select qi.name, qi.prices into name_value, quick_prices_value
      from public.quick_items qi
      where qi.id = quick_item_id_value;
      if name_value is null then
        raise exception 'Quick Item not found' using errcode = '22023';
      end if;
      if not exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(quick_prices_value) = 'array'
            then quick_prices_value else '[]'::jsonb end
        ) price_option
        where round((case
          when jsonb_typeof(price_option) = 'object' then price_option ->> 'price'
          else price_option #>> '{}'
        end)::numeric, 2) = original_price_value
          and (
            jsonb_typeof(price_option) <> 'object'
            or trim(coalesce(price_option ->> 'name', '')) = variant_value
          )
      ) then
        raise exception 'Quick Item price option is invalid' using errcode = '22023';
      end if;
    elsif name_value = '' then
      raise exception 'Custom item name is required' using errcode = '22023';
    end if;

    if unit_price_value > original_price_value then
      raise exception 'Sale price cannot exceed the current item price' using errcode = '22023';
    end if;

    line_total_value := round(unit_price_value * quantity_value, 2);
    discount_value := round((original_price_value - unit_price_value) * quantity_value, 2);
    subtotal_value := subtotal_value + line_total_value;
    total_discount_value := total_discount_value + discount_value;
  end loop;

  subtotal_value := round(subtotal_value, 2);
  total_discount_value := round(total_discount_value, 2);
  tax_value := round(subtotal_value * coalesce(shop.tax_rate, 0)::numeric / 100, 2);
  total_value := round(subtotal_value + tax_value, 2);

  if total_value <= 0 then
    raise exception 'Sale total must be greater than zero' using errcode = '22023';
  end if;

  if total_discount_value > 0 and coalesce(shop.discount_pin_required, false) then
    if app_private.claim_step_up('discount',p_request_id,'create_retail_sale',jsonb_build_array(p_request_id,p_lines,p_tenders,p_allow_credit,p_customer_name,p_customer_phone)) is null then
      raise exception 'A valid discount authorization is required' using errcode = '42501';
    end if;
  end if;

  for inventory_row in
    select distinct (value ->> 'inventoryId')::integer as inventory_id
    from jsonb_array_elements(p_lines)
    where lower(trim(coalesce(value ->> 'itemKind', ''))) = 'inventory'
  loop
    select i.qty into available_inventory_qty
    from public.inventory i
    where i.id = inventory_row.inventory_id
    for update;

    select sum((value ->> 'quantity')::integer)
      into requested_inventory_qty
    from jsonb_array_elements(p_lines)
    where lower(trim(coalesce(value ->> 'itemKind', ''))) = 'inventory'
      and (value ->> 'inventoryId')::integer = inventory_row.inventory_id;

    if available_inventory_qty is null or available_inventory_qty < requested_inventory_qty then
      raise exception 'Insufficient Inventory stock for item %', inventory_row.inventory_id
        using errcode = 'P0001';
    end if;
  end loop;

  for tender_value in select value from jsonb_array_elements(p_tenders)
  loop
    tender_count := tender_count + 1;
    method_value := trim(coalesce(tender_value ->> 'method', ''));
    amount_value := round((tender_value ->> 'amount')::numeric, 2);
    if method_value = ''
       or lower(method_value) in ('udhar', 'udhar (credit)')
       or amount_value <= 0 then
      raise exception 'Invalid payment tender %', tender_count using errcode = '22023';
    end if;

    if lower(method_value) = 'cash' then
      cash_tendered_value := round(coalesce(
        nullif(tender_value ->> 'cashTendered', '')::numeric,
        amount_value
      ), 2);
      if cash_tendered_value < amount_value then
        raise exception 'Cash received cannot be less than the cash payment' using errcode = '22023';
      end if;
      change_value := round(cash_tendered_value - amount_value, 2);
      total_cash_tendered := total_cash_tendered + cash_tendered_value;
      total_change := total_change + change_value;
    else
      if nullif(tender_value ->> 'cashTendered', '') is not null then
        raise exception 'Cash tender is valid only for Cash payments' using errcode = '22023';
      end if;
      cash_tendered_value := null;
      change_value := 0;
    end if;

    paid_value := paid_value + amount_value;
  end loop;

  paid_value := round(paid_value, 2);
  if paid_value > total_value then
    raise exception 'Payment exceeds sale total' using errcode = '22023';
  end if;
  credit_value := round(total_value - paid_value, 2);

  if credit_value > 0 and not p_allow_credit then
    raise exception 'Underpayment requires Udhar authorization' using errcode = '42501';
  end if;
  if credit_value > 0 then
    if trim(coalesce(p_customer_name, '')) = ''
       or trim(coalesce(p_customer_phone, '')) = '' then
      raise exception 'Customer name and phone are required for Udhar' using errcode = '22023';
    end if;
    step_up_id := app_private.claim_step_up('udhar',p_request_id,'create_retail_sale',jsonb_build_array(p_request_id,p_lines,p_tenders,p_allow_credit,p_customer_name,p_customer_phone));
    if step_up_id is null then
      raise exception 'A valid Udhar authorization is required' using errcode = '42501';
    end if;
  end if;

  update public.shop_config
  set invoice_seq = coalesce(invoice_seq, 0) + 1
  where id = 1
  returning concat(
    coalesce(nullif(trim(invoice_prefix), ''), 'INV'),
    to_char(now() at time zone 'Asia/Karachi', 'YYYYMMDD'),
    lpad(invoice_seq::text, 4, '0')
  ) into invoice_number_value;

  compatibility_method := case
    when credit_value > 0 then 'Udhar'
    when tender_count > 1 then 'Split'
    else trim(coalesce(p_tenders -> 0 ->> 'method', ''))
  end;

  insert into public.sales (
    request_id, ticket_id, invoice_number, customer_name, items_sold,
    labour_cost, discount, discount_reason, tax, total_bill, payment_method,
    employee_id, employee_name, cash_tendered, change_given
  ) values (
    p_request_id, null, invoice_number_value, trim(coalesce(p_customer_name, '')),
    '[]'::jsonb, 0, total_discount_value, '', tax_value, total_value,
    compatibility_method, actor.employee_id, actor.display_name,
    total_cash_tendered, total_change
  ) returning id into new_sale_id;

  line_number_value := 0;
  for line_value in select value from jsonb_array_elements(p_lines)
  loop
    line_number_value := line_number_value + 1;
    item_kind_value := lower(trim(line_value ->> 'itemKind'));
    quantity_value := (line_value ->> 'quantity')::integer;
    original_price_value := round((line_value ->> 'originalPrice')::numeric, 2);
    unit_price_value := round((line_value ->> 'unitPrice')::numeric, 2);
    inventory_id_value := case when item_kind_value = 'inventory'
      then (line_value ->> 'inventoryId')::integer else null end;
    quick_item_id_value := case when item_kind_value = 'quick'
      then (line_value ->> 'quickItemId')::integer else null end;
    variant_value := left(trim(coalesce(line_value ->> 'variantName', '')), 500);

    if item_kind_value = 'inventory' then
      select i.name, round(coalesce(i.cost, 0)::numeric, 2),
             round(coalesce(i.price, 0)::numeric, 2)
        into name_value, unit_cost_value, original_price_value
      from public.inventory i where i.id = inventory_id_value;
    elsif item_kind_value = 'quick' then
      select qi.name into name_value
      from public.quick_items qi where qi.id = quick_item_id_value;
      unit_cost_value := null;
    else
      name_value := trim(line_value ->> 'name');
      unit_cost_value := null;
    end if;

    line_total_value := round(unit_price_value * quantity_value, 2);
    discount_value := round((original_price_value - unit_price_value) * quantity_value, 2);

    insert into public.sale_lines (
      sale_id, line_number, item_kind, inventory_id, quick_item_id,
      name_snapshot, variant_snapshot, quantity, unit_price,
      unit_cost_snapshot, discount_amount, discount_reason, line_total
    ) values (
      new_sale_id, line_number_value, item_kind_value, inventory_id_value,
      quick_item_id_value, name_value, variant_value, quantity_value,
      unit_price_value, unit_cost_value, discount_value,
      left(trim(coalesce(line_value ->> 'discountReason', '')), 1000),
      line_total_value
    );
  end loop;

  select jsonb_agg(jsonb_build_object(
    'name', sl.name_snapshot,
    'variant_name', sl.variant_snapshot,
    'qty', sl.quantity,
    'original_price', sl.unit_price + (sl.discount_amount / sl.quantity),
    'sold_price', sl.unit_price,
    'discount', sl.discount_amount / sl.quantity,
    'reason', sl.discount_reason
  ) order by sl.line_number)
  into compatibility_items
  from public.sale_lines sl
  where sl.sale_id = new_sale_id;

  update public.sales
  set items_sold = compatibility_items
  where id = new_sale_id;

  tender_count := 0;
  for tender_value in select value from jsonb_array_elements(p_tenders)
  loop
    tender_count := tender_count + 1;
    method_value := trim(tender_value ->> 'method');
    amount_value := round((tender_value ->> 'amount')::numeric, 2);
    if lower(method_value) = 'cash' then
      cash_tendered_value := round(coalesce(
        nullif(tender_value ->> 'cashTendered', '')::numeric,
        amount_value
      ), 2);
      change_value := round(cash_tendered_value - amount_value, 2);
    else
      cash_tendered_value := null;
      change_value := 0;
    end if;

    insert into public.payments (
      request_id, sale_id, amount, method, cash_tendered, change_given,
      source, note, created_by_auth_user_id
    ) values (
      md5(p_request_id::text || ':payment:' || tender_count)::uuid,
      new_sale_id, amount_value, method_value, cash_tendered_value, change_value,
      'retail_checkout', '', actor.auth_user_id
    ) returning id into new_payment_id;

    insert into public.payment_allocations (payment_id, sale_id, amount)
    values (new_payment_id, new_sale_id, amount_value);

    compatibility_history := compatibility_history || jsonb_build_array(jsonb_build_object(
      'amount', amount_value,
      'method', method_value,
      'date', now(),
      'note', 'Paid at time of sale'
    ));
  end loop;

  if credit_value > 0 then
    insert into public.credit_approvals (
      request_id, sale_id, approved_amount, status,
      approved_by_auth_user_id, step_up_authorization_id
    ) values (
      md5(p_request_id::text || ':credit')::uuid,
      new_sale_id, credit_value, 'Active', actor.auth_user_id, step_up_id
    );

    insert into public.udhar (
      sale_id, customer_name, customer_phone, total_amount, amount_paid,
      balance_due, payment_history, status
    ) values (
      new_sale_id, trim(p_customer_name), trim(p_customer_phone), total_value,
      paid_value, credit_value, compatibility_history, 'Outstanding'
    );
  end if;

  for inventory_row in
    select sl.inventory_id, sum(sl.quantity)::integer as quantity
    from public.sale_lines sl
    where sl.sale_id = new_sale_id and sl.item_kind = 'inventory'
    group by sl.inventory_id
  loop
    update public.inventory
    set qty = qty - inventory_row.quantity
    where id = inventory_row.inventory_id;

    insert into public.inventory_movements (
      request_id, inventory_id, movement_type, quantity_delta, sale_id,
      reason, created_by_auth_user_id
    ) values (
      p_request_id, inventory_row.inventory_id, 'sale',
      -inventory_row.quantity, new_sale_id, 'Retail checkout', actor.auth_user_id
    );
  end loop;

  return app_private.retail_sale_result(new_sale_id)
    || jsonb_build_object('idempotentReplay', false);
end;
$$;

-- Source: 20260904230000_phase3_additional_work_and_adjustments.sql
create or replace function public.create_repair_adjustment(
  p_request_id uuid,
  p_root_ticket_id bigint,
  p_ticket_id bigint,
  p_amount numeric,
  p_adjustment_type text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.app_users%rowtype;
  root_ticket public.tickets%rowtype;
  step_up_id uuid;
  current_obligation numeric(14,2);
  new_obligation numeric(14,2);
  net_received numeric(14,2);
  adjustment public.invoice_adjustments%rowtype;
  invoice_row record;
begin
  if p_request_id is null or p_root_ticket_id is null or p_amount <= 0
     or p_adjustment_type not in ('discount','price_correction','goodwill','cancelled_work','other')
     or trim(coalesce(p_reason,''))='' then
    raise exception 'Invalid repair adjustment' using errcode='22023';
  end if;
  select au.* into actor from public.app_users au
  where au.auth_user_id=(select auth.uid()) and au.status='Active';
  if actor.auth_user_id is null
     or actor.role not in ('Business Owner','Manager','Cashier','Orbito Support')
     or not app_private.current_client_access_allowed() then
    raise exception 'Repair adjustment is not authorized' using errcode='42501';
  end if;
  step_up_id := app_private.claim_step_up('discount',p_request_id,'create_repair_adjustment',jsonb_build_array(p_request_id,p_root_ticket_id,p_ticket_id,p_amount,p_adjustment_type,p_reason));
  if step_up_id is null then
    raise exception 'A valid discount authorization is required' using errcode='42501';
  end if;
  select t.* into root_ticket from public.tickets t
  where t.id=p_root_ticket_id and t.parent_ticket_id is null for update;
  if root_ticket.id is null or root_ticket.status in ('Cancelled','Delivered') then
    raise exception 'Repair is not eligible for adjustment' using errcode='22023';
  end if;
  perform 1 from public.tickets t where t.parent_ticket_id=p_root_ticket_id
    order by t.id for update;
  if p_ticket_id is not null and not exists (
    select 1 from public.tickets t where t.id=p_ticket_id
      and (t.id=p_root_ticket_id or t.parent_ticket_id=p_root_ticket_id)
  ) then
    raise exception 'Adjustment target is outside the repair family' using errcode='22023';
  end if;
  select ia.* into adjustment from public.invoice_adjustments ia
  where ia.request_id=p_request_id;
  if adjustment.id is not null then
    return jsonb_build_object('adjustment',to_jsonb(adjustment),'financial',
      app_private.repair_transaction_result(p_root_ticket_id,true));
  end if;
  select coalesce(sum(coalesce(t.final_total,t.estimated_quote,0)),0)
    + coalesce((select sum(ia.amount) from public.invoice_adjustments ia
        where ia.repair_root_ticket_id=p_root_ticket_id),0)
  into current_obligation from public.tickets t
  where t.id=p_root_ticket_id or t.parent_ticket_id=p_root_ticket_id;
  new_obligation := round(current_obligation-p_amount,2);
  select coalesce((select sum(p.amount) from public.payments p
      where p.repair_root_ticket_id=p_root_ticket_id),0)
    - coalesce((select sum(r.amount) from public.refunds r
      where r.repair_root_ticket_id=p_root_ticket_id),0)
  into net_received;
  if new_obligation < 0 then
    raise exception 'Adjustment exceeds the repair obligation' using errcode='22023';
  end if;
  if new_obligation < net_received then
    raise exception 'Adjustment requires refund reconciliation' using errcode='22023';
  end if;
  insert into public.invoice_adjustments (
    request_id,repair_root_ticket_id,ticket_id,amount,adjustment_type,reason,
    created_by_auth_user_id,step_up_authorization_id
  ) values (
    p_request_id,p_root_ticket_id,p_ticket_id,-round(p_amount,2),
    p_adjustment_type,trim(p_reason),actor.auth_user_id,step_up_id
  ) returning * into adjustment;

  for invoice_row in
    select t.id,greatest(0,
      coalesce(t.final_total,t.estimated_quote,0)
      +coalesce((select sum(ia.amount) from public.invoice_adjustments ia
        where ia.repair_root_ticket_id=p_root_ticket_id
          and (ia.ticket_id=t.id or (ia.ticket_id is null and t.id=p_root_ticket_id))),0)
      -coalesce((select sum(pa.amount) from public.payment_allocations pa
        where pa.ticket_id=t.id),0)) as balance
    from public.tickets t
    where t.id=p_root_ticket_id or t.parent_ticket_id=p_root_ticket_id
  loop
    update public.tickets set balance_due=invoice_row.balance where id=invoice_row.id;
  end loop;
  return jsonb_build_object('adjustment',to_jsonb(adjustment),'financial',
    app_private.repair_transaction_result(p_root_ticket_id,false));
end;
$$;

-- Source: 20260905000000_phase3_repair_cancellation_and_delivery.sql
create or replace function public.cancel_repair(
  p_request_id uuid,
  p_root_ticket_id bigint,
  p_refund_amount numeric,
  p_refund_method text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.app_users%rowtype;
  root_ticket public.tickets%rowtype;
  step_up_id uuid;
  obligation_value numeric(14,2);
  received_value numeric(14,2);
  refunded_value numeric(14,2);
  refund_value numeric(14,2);
  retained_value numeric(14,2);
  adjustment_value numeric(14,2);
  new_refund public.refunds%rowtype;
begin
  refund_value:=round(coalesce(p_refund_amount,0),2);
  if p_request_id is null or p_root_ticket_id is null or refund_value<0
    or trim(coalesce(p_reason,''))=''
    or (refund_value>0 and trim(coalesce(p_refund_method,''))='') then
    raise exception 'Invalid repair cancellation' using errcode='22023';
  end if;
  select au.* into actor from public.app_users au
  where au.auth_user_id=(select auth.uid()) and au.status='Active';
  if actor.auth_user_id is null
    or actor.role not in ('Business Owner','Manager','Cashier','Orbito Support')
    or not app_private.current_client_access_allowed() then
    raise exception 'Repair cancellation is not authorized' using errcode='42501';
  end if;
  step_up_id := app_private.claim_step_up('repair-refund',p_request_id,'cancel_repair',jsonb_build_array(p_request_id,p_root_ticket_id,p_refund_amount,p_refund_method,p_reason));
  if step_up_id is null then
    raise exception 'A valid repair-refund authorization is required' using errcode='42501';
  end if;
  select t.* into root_ticket from public.tickets t
  where t.id=p_root_ticket_id and t.parent_ticket_id is null for update;
  if root_ticket.id is null then
    raise exception 'Repair root ticket not found' using errcode='22023';
  end if;
  if root_ticket.cancellation_request_id=p_request_id then
    return jsonb_build_object('financial',app_private.repair_transaction_result(p_root_ticket_id,true),
      'refund',(select to_jsonb(r) from public.refunds r
        where r.request_id=md5(p_request_id::text||':refund')::uuid));
  end if;
  if root_ticket.status in ('Cancelled','Delivered') then
    raise exception 'Repair cannot be cancelled in its current status' using errcode='22023';
  end if;
  perform 1 from public.tickets t where t.parent_ticket_id=p_root_ticket_id
    order by t.id for update;
  select coalesce(sum(coalesce(t.final_total,t.estimated_quote,0)),0)
    +coalesce((select sum(ia.amount) from public.invoice_adjustments ia
      where ia.repair_root_ticket_id=p_root_ticket_id),0)
  into obligation_value from public.tickets t
  where t.id=p_root_ticket_id or t.parent_ticket_id=p_root_ticket_id;
  select coalesce(sum(p.amount),0) into received_value from public.payments p
    where p.repair_root_ticket_id=p_root_ticket_id;
  select coalesce(sum(r.amount),0) into refunded_value from public.refunds r
    where r.repair_root_ticket_id=p_root_ticket_id;
  if refund_value>received_value-refunded_value then
    raise exception 'Refund exceeds net payments received' using errcode='22023';
  end if;
  retained_value:=round(received_value-refunded_value-refund_value,2);
  adjustment_value:=round(retained_value-obligation_value,2);
  if adjustment_value>0 then
    raise exception 'Cancellation cannot increase the repair obligation' using errcode='22023';
  end if;
  if adjustment_value<0 then
    insert into public.invoice_adjustments(
      request_id,repair_root_ticket_id,ticket_id,amount,adjustment_type,reason,
      created_by_auth_user_id,step_up_authorization_id
    ) values(
      md5(p_request_id::text||':adjustment')::uuid,p_root_ticket_id,null,
      adjustment_value,'cancellation',trim(p_reason),actor.auth_user_id,step_up_id
    );
  end if;
  if refund_value>0 then
    insert into public.refunds(
      request_id,repair_root_ticket_id,amount,method,reason,
      created_by_auth_user_id,step_up_authorization_id
    ) values(
      md5(p_request_id::text||':refund')::uuid,p_root_ticket_id,refund_value,
      trim(p_refund_method),trim(p_reason),actor.auth_user_id,step_up_id
    ) returning * into new_refund;
  end if;
  update public.tickets set balance_due=0,status='Cancelled'
  where id=p_root_ticket_id or parent_ticket_id=p_root_ticket_id;
  update public.tickets set cancellation_request_id=p_request_id,
    cancelled_at=now(),cancelled_by_auth_user_id=actor.auth_user_id,
    cancellation_reason=trim(p_reason)
  where id=p_root_ticket_id;
  return jsonb_build_object('financial',app_private.repair_transaction_result(p_root_ticket_id,false),
    'refund',case when new_refund.id is null then null else to_jsonb(new_refund) end,
    'retainedAmount',retained_value);
end;
$$;

-- Source: 20260905000000_phase3_repair_cancellation_and_delivery.sql
create or replace function public.deliver_repair(
  p_request_id uuid,
  p_root_ticket_id bigint,
  p_allow_udhar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.app_users%rowtype;
  root_ticket public.tickets%rowtype;
  step_up_id uuid;
  financial jsonb;
  outstanding_value numeric(14,2);
  approval public.credit_approvals%rowtype;
begin
  if p_request_id is null or p_root_ticket_id is null then
    raise exception 'request_id and repair root are required' using errcode='22023';
  end if;
  select au.* into actor from public.app_users au
  where au.auth_user_id=(select auth.uid()) and au.status='Active';
  if actor.auth_user_id is null
    or actor.role not in ('Business Owner','Manager','Cashier','Orbito Support')
    or not app_private.current_client_access_allowed() then
    raise exception 'Repair delivery is not authorized' using errcode='42501';
  end if;
  select t.* into root_ticket from public.tickets t
  where t.id=p_root_ticket_id and t.parent_ticket_id is null for update;
  if root_ticket.id is null then
    raise exception 'Repair root ticket not found' using errcode='22023';
  end if;
  if root_ticket.delivery_request_id=p_request_id then
    return jsonb_build_object('financial',app_private.repair_transaction_result(p_root_ticket_id,true),
      'deliveredAt',root_ticket.delivered_at,'creditApproval',(
        select to_jsonb(ca) from public.credit_approvals ca
        where ca.request_id=md5(p_request_id::text||':delivery-credit')::uuid));
  end if;
  if root_ticket.status<>'Ready' then
    raise exception 'Only a Ready repair can be delivered' using errcode='22023';
  end if;
  perform 1 from public.tickets t where t.parent_ticket_id=p_root_ticket_id
    order by t.id for update;
  financial:=app_private.repair_transaction_result(p_root_ticket_id,false);
  outstanding_value:=round((financial->>'outstanding')::numeric,2);
  if outstanding_value>0 then
    if not p_allow_udhar then
      raise exception 'Outstanding balance must be paid or approved as Udhar' using errcode='42501';
    end if;
    step_up_id := app_private.claim_step_up('udhar',p_request_id,'deliver_repair',jsonb_build_array(p_request_id,p_root_ticket_id,p_allow_udhar));
    if step_up_id is null then
      raise exception 'A valid Udhar authorization is required' using errcode='42501';
    end if;
    insert into public.credit_approvals(
      request_id,repair_root_ticket_id,approved_amount,status,
      approved_by_auth_user_id,step_up_authorization_id
    ) values(
      md5(p_request_id::text||':delivery-credit')::uuid,p_root_ticket_id,
      outstanding_value,'Active',actor.auth_user_id,step_up_id
    ) returning * into approval;
  end if;
  update public.tickets set status='Delivered',delivery_request_id=p_request_id,
    delivered_at=now(),delivered_by_auth_user_id=actor.auth_user_id,
    collected_at=now()
  where id=p_root_ticket_id;
  return jsonb_build_object('financial',app_private.repair_transaction_result(p_root_ticket_id,false),
    'deliveredAt',(select delivered_at from public.tickets where id=p_root_ticket_id),
    'creditApproval',case when approval.id is null then null else to_jsonb(approval) end);
end;
$$;

-- Source: 20260905010000_phase3_retail_returns_and_inventory_adjustments.sql
create or replace function public.create_retail_return(
  p_request_id uuid,
  p_sale_id bigint,
  p_lines jsonb,
  p_refund_method text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor public.app_users%rowtype;
  sale_row public.sales%rowtype;
  existing_return_id integer;
  step_up_id uuid;
  line_value jsonb;
  sale_line public.sale_lines%rowtype;
  return_id_value integer;
  quantity_value integer;
  prior_quantity integer;
  prior_reduction numeric(14,2);
  line_gross numeric(14,2);
  reduction_value numeric(14,2);
  total_reduction numeric(14,2):=0;
  prior_total_reduction numeric(14,2);
  payments_value numeric(14,2);
  prior_refunds_value numeric(14,2);
  new_obligation numeric(14,2);
  net_paid numeric(14,2);
  refund_value numeric(14,2);
  outstanding_value numeric(14,2);
  restock_value boolean;
  compatibility_items jsonb:='[]'::jsonb;
  new_refund public.refunds%rowtype;
  inventory_row record;
  inventory_enabled boolean;
begin
  if p_request_id is null or p_sale_id is null
    or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0
    or jsonb_array_length(p_lines)>100 or trim(coalesce(p_reason,''))='' then
    raise exception 'Invalid retail return' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_lines) a
    group by a->>'saleLineId' having count(*)>1) then
    raise exception 'A sale line may appear only once per return' using errcode='22023';
  end if;
  select au.* into actor from public.app_users au
  where au.auth_user_id=(select auth.uid()) and au.status='Active';
  if actor.auth_user_id is null
    or actor.role not in ('Business Owner','Manager','Cashier','Orbito Support')
    or not app_private.current_client_access_allowed() then
    raise exception 'Retail return is not authorized' using errcode='42501';
  end if;
  select coalesce(sc.inventory_module_enabled,false) into inventory_enabled
    from public.shop_config sc where sc.id=1;
  step_up_id := app_private.claim_step_up('return',p_request_id,'create_retail_return',jsonb_build_array(p_request_id,p_sale_id,p_lines,p_refund_method,p_reason));
  if step_up_id is null then
    raise exception 'A valid return authorization is required' using errcode='42501';
  end if;
  select r.id into existing_return_id from public.returns r where r.request_id=p_request_id;
  if existing_return_id is not null then
    return app_private.retail_return_result(existing_return_id,true);
  end if;
  select s.* into sale_row from public.sales s where s.id=p_sale_id for update;
  if sale_row.id is null then
    raise exception 'Source sale not found' using errcode='22023';
  end if;

  perform 1 from public.sale_lines sl
  where sl.id in (select (value->>'saleLineId')::bigint from jsonb_array_elements(p_lines))
  order by sl.id for update;
  perform 1 from public.inventory i
  where i.id in (select sl.inventory_id from public.sale_lines sl
    where sl.id in (select (value->>'saleLineId')::bigint from jsonb_array_elements(p_lines))
      and sl.inventory_id is not null)
  order by i.id for update;

  for line_value in select value from jsonb_array_elements(p_lines)
  loop
    quantity_value:=(line_value->>'quantity')::integer;
    restock_value:=coalesce((line_value->>'restock')::boolean,false);
    select sl.* into sale_line from public.sale_lines sl
      where sl.id=(line_value->>'saleLineId')::bigint and sl.sale_id=p_sale_id;
    if sale_line.id is null or quantity_value is null or quantity_value<=0 then
      raise exception 'Invalid returned sale line' using errcode='22023';
    end if;
    select coalesce(sum(rl.quantity),0)::integer,coalesce(sum(rl.refund_amount),0)
      into prior_quantity,prior_reduction
    from public.return_lines rl where rl.sale_line_id=sale_line.id;
    if quantity_value>sale_line.quantity-prior_quantity then
      raise exception 'Return quantity exceeds the remaining sold quantity' using errcode='22023';
    end if;
    if restock_value and sale_line.item_kind<>'inventory' then
      raise exception 'Only tracked Inventory can return to sellable stock' using errcode='22023';
    end if;
    if restock_value and not inventory_enabled then
      raise exception 'Inventory module is not enabled' using errcode='42501';
    end if;
    line_gross:=app_private.sale_line_gross_value(sale_line.id);
    reduction_value:=case when quantity_value=sale_line.quantity-prior_quantity
      then round(line_gross-prior_reduction,2)
      else round(line_gross*quantity_value/sale_line.quantity,2) end;
    if reduction_value<0 or prior_reduction+reduction_value>line_gross then
      raise exception 'Returned value does not reconcile' using errcode='P0001';
    end if;
    total_reduction:=total_reduction+reduction_value;
    compatibility_items:=compatibility_items||jsonb_build_array(jsonb_build_object(
      'sale_line_id',sale_line.id,'name',sale_line.name_snapshot,
      'variant_name',sale_line.variant_snapshot,'qty',quantity_value,
      'sold_price',round(reduction_value/quantity_value,2),'restock',restock_value));
  end loop;
  total_reduction:=round(total_reduction,2);
  select coalesce(sum(rl.refund_amount),0) into prior_total_reduction
  from public.return_lines rl join public.returns r on r.id=rl.return_id
  where r.original_sale_id=p_sale_id;
  new_obligation:=round(sale_row.total_bill-prior_total_reduction-total_reduction,2);
  if new_obligation<0 then
    raise exception 'Return exceeds the sale obligation' using errcode='22023';
  end if;
  select coalesce(sum(p.amount),0) into payments_value from public.payments p where p.sale_id=p_sale_id;
  select coalesce(sum(r.amount),0) into prior_refunds_value from public.refunds r where r.sale_id=p_sale_id;
  net_paid:=round(payments_value-prior_refunds_value,2);
  refund_value:=round(greatest(0,net_paid-new_obligation),2);
  if refund_value>0 and trim(coalesce(p_refund_method,''))='' then
    raise exception 'Refund method is required when money is returned' using errcode='22023';
  end if;

  insert into public.returns(request_id,original_sale_id,returned_items,refund_amount,
    refund_method,processed_by,notes)
  values(p_request_id,p_sale_id,compatibility_items,refund_value,
    case when refund_value>0 then trim(p_refund_method) else '' end,
    actor.employee_id,trim(p_reason)) returning id into return_id_value;

  for line_value in select value from jsonb_array_elements(p_lines)
  loop
    quantity_value:=(line_value->>'quantity')::integer;
    restock_value:=coalesce((line_value->>'restock')::boolean,false);
    select sl.* into sale_line from public.sale_lines sl where sl.id=(line_value->>'saleLineId')::bigint;
    select coalesce(sum(rl.quantity),0)::integer,coalesce(sum(rl.refund_amount),0)
      into prior_quantity,prior_reduction from public.return_lines rl where rl.sale_line_id=sale_line.id;
    line_gross:=app_private.sale_line_gross_value(sale_line.id);
    reduction_value:=case when quantity_value=sale_line.quantity-prior_quantity
      then round(line_gross-prior_reduction,2)
      else round(line_gross*quantity_value/sale_line.quantity,2) end;
    insert into public.return_lines(return_id,sale_line_id,quantity,refund_amount,restock)
      values(return_id_value,sale_line.id,quantity_value,reduction_value,restock_value);
    if restock_value then
      update public.inventory set qty=qty+quantity_value where id=sale_line.inventory_id;
      insert into public.inventory_movements(request_id,inventory_id,movement_type,
        quantity_delta,sale_id,return_id,reason,created_by_auth_user_id)
      values(md5(p_request_id::text||':return-line:'||sale_line.id)::uuid,
        sale_line.inventory_id,'return_restock',quantity_value,p_sale_id,
        return_id_value,trim(p_reason),actor.auth_user_id);
    end if;
  end loop;
  if refund_value>0 then
    insert into public.refunds(request_id,sale_id,return_id,amount,method,reason,
      created_by_auth_user_id,step_up_authorization_id)
    values(md5(p_request_id::text||':refund')::uuid,p_sale_id,return_id_value,
      refund_value,trim(p_refund_method),trim(p_reason),actor.auth_user_id,step_up_id)
    returning * into new_refund;
  end if;
  outstanding_value:=round(greatest(0,new_obligation-net_paid+refund_value),2);
  if outstanding_value=0 then
    update public.credit_approvals set status='Settled',settled_at=now()
      where sale_id=p_sale_id and status='Active';
  end if;
  update public.udhar set total_amount=new_obligation,
    amount_paid=least(new_obligation,net_paid-refund_value),balance_due=outstanding_value,
    status=case when outstanding_value=0 then 'Settled' else 'Partial' end,
    settled_at=case when outstanding_value=0 then now() else null end
  where sale_id=p_sale_id;
  return app_private.retail_return_result(return_id_value,false);
end;
$$;

-- Source: 20260905020000_phase3_unified_udhar_and_reporting.sql
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
    payment_result := public.record_repair_payment(
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

-- Source: 20260905031000_phase3_repair_component_change_guard.sql
create or replace function public.mark_repair_component_not_needed(
  p_request_id uuid,
  p_ticket_id bigint,
  p_component_index integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.app_users%rowtype;
  step_up_id uuid;
  ticket_row public.tickets%rowtype;
  components jsonb;
  component jsonb;
begin
  if p_request_id is null or p_ticket_id is null or p_component_index is null
     or p_component_index < 0 or trim(coalesce(p_reason, '')) = '' then
    raise exception 'Invalid component change' using errcode = '22023';
  end if;
  select au.* into actor from public.app_users au
  where au.auth_user_id = (select auth.uid()) and au.status = 'Active';
  if actor.auth_user_id is null
     or actor.role not in ('Business Owner','Manager','Cashier','Technician','Orbito Support')
     or not app_private.current_client_access_allowed() then
    raise exception 'Component change is not authorized' using errcode = '42501';
  end if;
  step_up_id := app_private.claim_step_up('remove-component',p_request_id,'mark_repair_component_not_needed',jsonb_build_array(p_request_id,p_ticket_id,p_component_index,p_reason));
  if step_up_id is null then
    raise exception 'A valid component-change authorization is required' using errcode = '42501';
  end if;
  select t.* into ticket_row from public.tickets t where t.id = p_ticket_id for update;
  if ticket_row.id is null or ticket_row.status in ('Cancelled','Delivered') then
    raise exception 'Repair is not eligible for component change' using errcode = '22023';
  end if;
  components := coalesce(ticket_row.components_noted, '[]'::jsonb);
  if jsonb_typeof(components) <> 'array' or p_component_index >= jsonb_array_length(components) then
    raise exception 'Repair component not found' using errcode = '22023';
  end if;
  component := components -> p_component_index;
  if component ->> 'removalRequestId' = p_request_id::text then
    return jsonb_build_object('ticket',to_jsonb(ticket_row),'idempotentReplay',true);
  end if;
  if coalesce((component ->> 'removed')::boolean, false) then
    raise exception 'Repair component is already marked not needed' using errcode = '22023';
  end if;
  component := component || jsonb_build_object(
    'removed', true,
    'removedReason', trim(p_reason),
    'removedBy', actor.display_name,
    'removedByAuthUserId', actor.auth_user_id,
    'removedAt', now(),
    'removalRequestId', p_request_id,
    'stepUpAuthorizationId', step_up_id
  );
  components := jsonb_set(components, array[p_component_index::text], component, false);
  update public.tickets set components_noted = components where id = p_ticket_id
  returning * into ticket_row;
  return jsonb_build_object('ticket',to_jsonb(ticket_row),'idempotentReplay',false);
end;
$$;
