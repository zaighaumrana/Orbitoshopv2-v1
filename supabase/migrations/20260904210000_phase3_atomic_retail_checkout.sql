-- Phase 3D: one retry-safe transaction owns retail checkout.

alter table public.sales
  add column request_id uuid;

create unique index sales_request_id_key
  on public.sales (request_id)
  where request_id is not null;

create unique index sales_invoice_number_key
  on public.sales (invoice_number)
  where invoice_number is not null;

create unique index udhar_sale_id_key
  on public.udhar (sale_id)
  where sale_id is not null;

create or replace function app_private.retail_sale_result(target_sale_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'saleId', s.id,
    'invoiceNumber', s.invoice_number,
    'createdAt', s.created_at,
    'customerName', s.customer_name,
    'employeeName', s.employee_name,
    'discount', s.discount,
    'tax', s.tax,
    'total', s.total_bill,
    'paymentMethod', s.payment_method,
    'cashTendered', s.cash_tendered,
    'changeGiven', s.change_given,
    'creditAmount', coalesce((
      select sum(ca.approved_amount)
      from public.credit_approvals ca
      where ca.sale_id = s.id and ca.status = 'Active'
    ), 0),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lineNumber', sl.line_number,
        'itemKind', sl.item_kind,
        'inventoryId', sl.inventory_id,
        'quickItemId', sl.quick_item_id,
        'name', sl.name_snapshot,
        'variantName', sl.variant_snapshot,
        'quantity', sl.quantity,
        'unitPrice', sl.unit_price,
        'unitCost', sl.unit_cost_snapshot,
        'discountAmount', sl.discount_amount,
        'discountReason', sl.discount_reason,
        'lineTotal', sl.line_total
      ) order by sl.line_number)
      from public.sale_lines sl
      where sl.sale_id = s.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'amount', p.amount,
        'method', p.method,
        'cashTendered', p.cash_tendered,
        'changeGiven', p.change_given
      ) order by p.id)
      from public.payments p
      where p.sale_id = s.id
    ), '[]'::jsonb)
  )
  from public.sales s
  where s.id = target_sale_id
$$;

revoke all on function app_private.retail_sale_result(bigint)
  from public, anon, authenticated;

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
    if not app_private.has_step_up('discount') then
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
    select sua.id into step_up_id
    from public.step_up_authorizations sua
    where sua.auth_user_id = actor.auth_user_id
      and sua.purpose = 'udhar'
      and sua.expires_at > now()
    order by sua.created_at desc
    limit 1;
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

revoke all on function public.create_retail_sale(uuid, jsonb, jsonb, boolean, text, text)
  from public, anon;
grant execute on function public.create_retail_sale(uuid, jsonb, jsonb, boolean, text, text)
  to authenticated, service_role;

-- The RPC is now the only authenticated browser path that can create a retail
-- sale or its compatibility Udhar row.
revoke insert on public.sales from authenticated;
drop policy if exists sales_insert_counter on public.sales;
revoke insert on public.udhar from authenticated;
drop policy if exists udhar_insert_step_up on public.udhar;

comment on column public.sales.request_id is
  'Phase 3 checkout operation id. A retry returns the original committed sale.';
comment on function public.create_retail_sale(uuid, jsonb, jsonb, boolean, text, text) is
  'Atomic idempotent retail checkout: header, lines, payments, allocations, Udhar approval and Inventory movement.';
