-- Phase 3E: atomic repair creation and repair-family payment collection.

alter table public.tickets
  add column request_id uuid;

create unique index tickets_request_id_key
  on public.tickets (request_id)
  where request_id is not null;
create unique index tickets_invoice_number_key
  on public.tickets (invoice_number)
  where invoice_number is not null;
create index tickets_parent_ticket_id_idx
  on public.tickets (parent_ticket_id)
  where parent_ticket_id is not null;

create or replace function app_private.repair_transaction_result(
  target_root_ticket_id bigint,
  replay boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ticket', to_jsonb(root_ticket),
    'familyObligation', coalesce((
      select sum(coalesce(t.final_total, t.estimated_quote, 0))
      from public.tickets t
      where t.id = root_ticket.id or t.parent_ticket_id = root_ticket.id
    ), 0) + coalesce((
      select sum(ia.amount)
      from public.invoice_adjustments ia
      where ia.repair_root_ticket_id = root_ticket.id
    ), 0),
    'paymentsReceived', coalesce((
      select sum(p.amount)
      from public.payments p
      where p.repair_root_ticket_id = root_ticket.id
    ), 0),
    'refundsPaid', coalesce((
      select sum(r.amount)
      from public.refunds r
      where r.repair_root_ticket_id = root_ticket.id
    ), 0),
    'outstanding', greatest(0,
      coalesce((
        select sum(coalesce(t.final_total, t.estimated_quote, 0))
        from public.tickets t
        where t.id = root_ticket.id or t.parent_ticket_id = root_ticket.id
      ), 0)
      + coalesce((select sum(ia.amount) from public.invoice_adjustments ia
          where ia.repair_root_ticket_id = root_ticket.id), 0)
      - coalesce((select sum(p.amount) from public.payments p
          where p.repair_root_ticket_id = root_ticket.id), 0)
      + coalesce((select sum(r.amount) from public.refunds r
          where r.repair_root_ticket_id = root_ticket.id), 0)
    ),
    'idempotentReplay', replay
  )
  from public.tickets root_ticket
  where root_ticket.id = target_root_ticket_id
    and root_ticket.parent_ticket_id is null
$$;

revoke all on function app_private.repair_transaction_result(bigint, boolean)
  from public, anon, authenticated;

create or replace function public.create_repair_ticket(
  p_request_id uuid,
  p_ticket jsonb,
  p_tenders jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.app_users%rowtype;
  shop public.shop_config%rowtype;
  existing_ticket_id bigint;
  new_ticket_id bigint;
  new_payment_id bigint;
  ticket_number_value text;
  invoice_number_value text;
  quote_value numeric(14,2);
  labour_value numeric(14,2);
  paid_value numeric(14,2) := 0;
  amount_value numeric(14,2);
  cash_tendered_value numeric(14,2);
  change_value numeric(14,2);
  method_value text;
  tender_value jsonb;
  tender_number integer := 0;
  payment_history_value jsonb := '[]'::jsonb;
  advance_methods text := '';
begin
  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  select au.* into actor
  from public.app_users au
  where au.auth_user_id = (select auth.uid()) and au.status = 'Active';
  if actor.auth_user_id is null
     or actor.role not in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support') then
    raise exception 'Repair creation is not authorized' using errcode = '42501';
  end if;

  select sc.* into shop
  from public.shop_config sc
  where sc.id = 1
  for update;
  if shop.id is null
     or not coalesce(shop.repair_module_enabled, false)
     or (coalesce(shop.suspended, false) and actor.role <> 'Orbito Support') then
    raise exception 'Repair access is unavailable' using errcode = '42501';
  end if;

  select t.id into existing_ticket_id
  from public.tickets t
  where t.request_id = p_request_id;
  if existing_ticket_id is not null then
    return app_private.repair_transaction_result(existing_ticket_id, true);
  end if;

  if jsonb_typeof(p_ticket) <> 'object'
     or jsonb_typeof(coalesce(p_ticket -> 'components', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(p_tenders) <> 'array'
     or jsonb_array_length(p_tenders) > 10 then
    raise exception 'Invalid repair request' using errcode = '22023';
  end if;
  if trim(coalesce(p_ticket ->> 'customerName', '')) = ''
     or trim(coalesce(p_ticket ->> 'customerPhone', '')) = ''
     or trim(coalesce(p_ticket ->> 'deviceBrand', '')) = ''
     or trim(coalesce(p_ticket ->> 'deviceModel', '')) = '' then
    raise exception 'Customer and device details are required' using errcode = '22023';
  end if;

  quote_value := round((p_ticket ->> 'quotedAmount')::numeric, 2);
  labour_value := round(coalesce(nullif(p_ticket ->> 'labourCost', '')::numeric, 0), 2);
  if quote_value < 0 or labour_value < 0 then
    raise exception 'Repair amounts cannot be negative' using errcode = '22023';
  end if;

  for tender_value in select value from jsonb_array_elements(p_tenders)
  loop
    tender_number := tender_number + 1;
    method_value := trim(coalesce(tender_value ->> 'method', ''));
    amount_value := round((tender_value ->> 'amount')::numeric, 2);
    if method_value = ''
       or lower(method_value) in ('udhar', 'udhar (credit)')
       or amount_value <= 0 then
      raise exception 'Invalid repair payment %', tender_number using errcode = '22023';
    end if;
    if lower(method_value) = 'cash' then
      cash_tendered_value := round(coalesce(
        nullif(tender_value ->> 'cashTendered', '')::numeric, amount_value
      ), 2);
      if cash_tendered_value < amount_value then
        raise exception 'Cash received cannot be less than the payment' using errcode = '22023';
      end if;
      change_value := round(cash_tendered_value - amount_value, 2);
    else
      if nullif(tender_value ->> 'cashTendered', '') is not null then
        raise exception 'Cash tender is valid only for Cash payments' using errcode = '22023';
      end if;
      cash_tendered_value := null;
      change_value := 0;
    end if;
    paid_value := paid_value + amount_value;
    advance_methods := concat_ws(' + ', nullif(advance_methods, ''), method_value);
    payment_history_value := payment_history_value || jsonb_build_array(jsonb_build_object(
      'amount', amount_value, 'method', method_value, 'date', now()
    ));
  end loop;
  paid_value := round(paid_value, 2);
  if paid_value > quote_value then
    raise exception 'Initial payment exceeds the repair invoice' using errcode = '22023';
  end if;

  update public.shop_config
  set ticket_seq = coalesce(ticket_seq, 0) + 1,
      invoice_seq = coalesce(invoice_seq, 0) + 1
  where id = 1
  returning
    concat(coalesce(nullif(trim(ticket_prefix), ''), 'TK'),
      to_char(now() at time zone 'Asia/Karachi', 'YYYYMMDD'),
      lpad(ticket_seq::text, 4, '0')),
    concat(coalesce(nullif(trim(invoice_prefix), ''), 'INV'),
      to_char(now() at time zone 'Asia/Karachi', 'YYYYMMDD'),
      lpad(invoice_seq::text, 4, '0'))
  into ticket_number_value, invoice_number_value;

  insert into public.tickets (
    request_id, ticket_number, invoice_number, customer_name, customer_phone,
    device_brand, device_model, imei, components_noted, estimated_quote,
    advance_payment, advance_method, status, technician_note, created_by,
    labour_cost, final_total, amount_paid, balance_due, payment_history,
    is_locked, placed_at
  ) values (
    p_request_id, ticket_number_value, invoice_number_value,
    trim(p_ticket ->> 'customerName'), trim(p_ticket ->> 'customerPhone'),
    trim(p_ticket ->> 'deviceBrand'), trim(p_ticket ->> 'deviceModel'),
    trim(coalesce(p_ticket ->> 'imei', '')),
    coalesce(p_ticket -> 'components', '[]'::jsonb), quote_value,
    paid_value, advance_methods, 'Pending',
    trim(coalesce(p_ticket ->> 'technicianNote', '')), actor.display_name,
    labour_value, quote_value, paid_value, quote_value - paid_value,
    payment_history_value, true, now()
  ) returning id into new_ticket_id;

  tender_number := 0;
  for tender_value in select value from jsonb_array_elements(p_tenders)
  loop
    tender_number := tender_number + 1;
    method_value := trim(tender_value ->> 'method');
    amount_value := round((tender_value ->> 'amount')::numeric, 2);
    if lower(method_value) = 'cash' then
      cash_tendered_value := round(coalesce(
        nullif(tender_value ->> 'cashTendered', '')::numeric, amount_value
      ), 2);
      change_value := round(cash_tendered_value - amount_value, 2);
    else
      cash_tendered_value := null;
      change_value := 0;
    end if;

    insert into public.payments (
      request_id, repair_root_ticket_id, amount, method, cash_tendered,
      change_given, source, note, created_by_auth_user_id
    ) values (
      md5(p_request_id::text || ':advance:' || tender_number)::uuid,
      new_ticket_id, amount_value, method_value, cash_tendered_value,
      change_value, 'repair_advance', '', actor.auth_user_id
    ) returning id into new_payment_id;

    insert into public.payment_allocations (payment_id, ticket_id, amount)
    values (new_payment_id, new_ticket_id, amount_value);
  end loop;

  return app_private.repair_transaction_result(new_ticket_id, false);
end;
$$;

create or replace function public.record_repair_payment(
  p_request_id uuid,
  p_root_ticket_id bigint,
  p_tenders jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.app_users%rowtype;
  shop public.shop_config%rowtype;
  root_ticket public.tickets%rowtype;
  existing_payment_id bigint;
  new_payment_id bigint;
  tender_value jsonb;
  tender_number integer := 0;
  method_value text;
  amount_value numeric(14,2);
  cash_tendered_value numeric(14,2);
  change_value numeric(14,2);
  total_new_payment numeric(14,2) := 0;
  obligation_value numeric(14,2);
  received_value numeric(14,2);
  refunded_value numeric(14,2);
  outstanding_value numeric(14,2);
  remaining_value numeric(14,2);
  allocation_value numeric(14,2);
  invoice_row record;
begin
  if p_request_id is null or p_root_ticket_id is null then
    raise exception 'request_id and repair root are required' using errcode = '22023';
  end if;

  select au.* into actor
  from public.app_users au
  where au.auth_user_id = (select auth.uid()) and au.status = 'Active';
  if actor.auth_user_id is null
     or actor.role not in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support') then
    raise exception 'Repair payment is not authorized' using errcode = '42501';
  end if;

  select sc.* into shop from public.shop_config sc where sc.id = 1;
  if shop.id is null
     or not coalesce(shop.repair_module_enabled, false)
     or (coalesce(shop.suspended, false) and actor.role <> 'Orbito Support') then
    raise exception 'Repair access is unavailable' using errcode = '42501';
  end if;

  select t.* into root_ticket
  from public.tickets t
  where t.id = p_root_ticket_id and t.parent_ticket_id is null
  for update;
  if root_ticket.id is null then
    raise exception 'Repair root ticket not found' using errcode = '22023';
  end if;

  perform 1 from public.tickets t
  where t.parent_ticket_id = p_root_ticket_id
  order by t.id
  for update;

  select p.id into existing_payment_id
  from public.payments p
  where p.request_id = md5(p_request_id::text || ':payment:1')::uuid;
  if existing_payment_id is not null then
    return app_private.repair_transaction_result(p_root_ticket_id, true);
  end if;

  if jsonb_typeof(p_tenders) <> 'array'
     or jsonb_array_length(p_tenders) = 0
     or jsonb_array_length(p_tenders) > 10 then
    raise exception 'At least one payment tender is required' using errcode = '22023';
  end if;

  for tender_value in select value from jsonb_array_elements(p_tenders)
  loop
    tender_number := tender_number + 1;
    method_value := trim(coalesce(tender_value ->> 'method', ''));
    amount_value := round((tender_value ->> 'amount')::numeric, 2);
    if method_value = ''
       or lower(method_value) in ('udhar', 'udhar (credit)')
       or amount_value <= 0 then
      raise exception 'Invalid repair payment %', tender_number using errcode = '22023';
    end if;
    if lower(method_value) = 'cash' then
      cash_tendered_value := round(coalesce(
        nullif(tender_value ->> 'cashTendered', '')::numeric, amount_value
      ), 2);
      if cash_tendered_value < amount_value then
        raise exception 'Cash received cannot be less than the payment' using errcode = '22023';
      end if;
    elsif nullif(tender_value ->> 'cashTendered', '') is not null then
      raise exception 'Cash tender is valid only for Cash payments' using errcode = '22023';
    end if;
    total_new_payment := total_new_payment + amount_value;
  end loop;
  total_new_payment := round(total_new_payment, 2);

  select coalesce(sum(coalesce(t.final_total, t.estimated_quote, 0)), 0)
    + coalesce((select sum(ia.amount) from public.invoice_adjustments ia
        where ia.repair_root_ticket_id = p_root_ticket_id), 0)
  into obligation_value
  from public.tickets t
  where t.id = p_root_ticket_id or t.parent_ticket_id = p_root_ticket_id;
  select coalesce(sum(p.amount), 0) into received_value
  from public.payments p where p.repair_root_ticket_id = p_root_ticket_id;
  select coalesce(sum(r.amount), 0) into refunded_value
  from public.refunds r where r.repair_root_ticket_id = p_root_ticket_id;
  outstanding_value := round(obligation_value - received_value + refunded_value, 2);

  if outstanding_value <= 0 then
    raise exception 'Repair family has no outstanding balance' using errcode = '22023';
  end if;
  if total_new_payment > outstanding_value then
    raise exception 'Payment exceeds repair-family outstanding balance' using errcode = '22023';
  end if;

  tender_number := 0;
  for tender_value in select value from jsonb_array_elements(p_tenders)
  loop
    tender_number := tender_number + 1;
    method_value := trim(tender_value ->> 'method');
    amount_value := round((tender_value ->> 'amount')::numeric, 2);
    if lower(method_value) = 'cash' then
      cash_tendered_value := round(coalesce(
        nullif(tender_value ->> 'cashTendered', '')::numeric, amount_value
      ), 2);
      change_value := round(cash_tendered_value - amount_value, 2);
    else
      cash_tendered_value := null;
      change_value := 0;
    end if;

    insert into public.payments (
      request_id, repair_root_ticket_id, amount, method, cash_tendered,
      change_given, source, note, created_by_auth_user_id
    ) values (
      md5(p_request_id::text || ':payment:' || tender_number)::uuid,
      p_root_ticket_id, amount_value, method_value, cash_tendered_value,
      change_value, 'repair_collection', '', actor.auth_user_id
    ) returning id into new_payment_id;

    remaining_value := amount_value;
    for invoice_row in
      select calculated.ticket_id,
             greatest(0, calculated.invoice_obligation - calculated.allocated) as invoice_outstanding
      from (
        select t.id as ticket_id,
          coalesce(t.final_total, t.estimated_quote, 0)
            + coalesce((select sum(ia.amount) from public.invoice_adjustments ia
                where ia.repair_root_ticket_id = p_root_ticket_id
                  and (ia.ticket_id = t.id or (ia.ticket_id is null and t.id = p_root_ticket_id))), 0)
            as invoice_obligation,
          coalesce((select sum(pa.amount) from public.payment_allocations pa
                where pa.ticket_id = t.id), 0) as allocated,
          t.parent_ticket_id,
          t.created_at,
          t.id as ticket_sort_id
        from public.tickets t
        where t.id = p_root_ticket_id or t.parent_ticket_id = p_root_ticket_id
      ) calculated
      where calculated.invoice_obligation > calculated.allocated
      order by (calculated.parent_ticket_id is not null), calculated.created_at, calculated.ticket_sort_id
    loop
      exit when remaining_value <= 0;
      allocation_value := least(remaining_value, invoice_row.invoice_outstanding);
      insert into public.payment_allocations (payment_id, ticket_id, amount)
      values (new_payment_id, invoice_row.ticket_id, allocation_value);
      remaining_value := remaining_value - allocation_value;
    end loop;
    if remaining_value <> 0 then
      raise exception 'Payment allocation did not reconcile' using errcode = 'P0001';
    end if;
  end loop;

  for invoice_row in
    select t.id,
      greatest(0,
        coalesce(t.final_total, t.estimated_quote, 0)
        + coalesce((select sum(ia.amount) from public.invoice_adjustments ia
            where ia.repair_root_ticket_id = p_root_ticket_id
              and (ia.ticket_id = t.id or (ia.ticket_id is null and t.id = p_root_ticket_id))), 0)
        - coalesce((select sum(pa.amount) from public.payment_allocations pa
            where pa.ticket_id = t.id), 0)
      ) as balance,
      coalesce((select sum(pa.amount) from public.payment_allocations pa
          where pa.ticket_id = t.id), 0) as paid,
      coalesce((select jsonb_agg(jsonb_build_object(
          'amount', pa.amount, 'method', p.method, 'date', p.created_at
        ) order by p.created_at, p.id, pa.id)
        from public.payment_allocations pa
        join public.payments p on p.id = pa.payment_id
        where pa.ticket_id = t.id), '[]'::jsonb) as history
    from public.tickets t
    where t.id = p_root_ticket_id or t.parent_ticket_id = p_root_ticket_id
  loop
    update public.tickets
    set amount_paid = invoice_row.paid,
        balance_due = invoice_row.balance,
        payment_history = invoice_row.history
    where id = invoice_row.id;
  end loop;

  return app_private.repair_transaction_result(p_root_ticket_id, false);
end;
$$;

revoke all on function public.create_repair_ticket(uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.create_repair_ticket(uuid, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.record_repair_payment(uuid, bigint, jsonb)
  from public, anon;
grant execute on function public.record_repair_payment(uuid, bigint, jsonb)
  to authenticated, service_role;

comment on column public.tickets.request_id is
  'Phase 3 operation id for idempotent repair invoice creation.';
comment on function public.create_repair_ticket(uuid, jsonb, jsonb) is
  'Atomic original repair invoice creation and initial advance ledger write.';
comment on function public.record_repair_payment(uuid, bigint, jsonb) is
  'Atomic parent-first payment allocation within one repair family; never changes operational status or delivery.';
