-- Phase 3I: unified Udhar settlement and canonical financial reporting.
-- Legacy financial columns remain compatibility caches; canonical reads come from
-- invoices, immutable adjustments, payments, refunds, returns, and approvals.

alter table public.sales
  add column created_by_auth_user_id uuid references auth.users(id) on delete restrict;
alter table public.tickets
  add column created_by_auth_user_id uuid references auth.users(id) on delete restrict;
alter table public.returns
  add column created_by_auth_user_id uuid references auth.users(id) on delete restrict;

create index sales_created_by_auth_user_id_idx
  on public.sales (created_by_auth_user_id) where created_by_auth_user_id is not null;
create index tickets_created_by_auth_user_id_idx
  on public.tickets (created_by_auth_user_id) where created_by_auth_user_id is not null;
create index returns_created_by_auth_user_id_idx
  on public.returns (created_by_auth_user_id) where created_by_auth_user_id is not null;

-- Backfill only when the legacy actor maps unambiguously to one client identity.
update public.sales s
set created_by_auth_user_id = (
  select min(au.auth_user_id::text)::uuid
  from public.app_users au
  where au.employee_id = s.employee_id
  having count(*) = 1
)
where s.employee_id is not null
  and s.created_by_auth_user_id is null
  and (select count(*) from public.app_users au where au.employee_id = s.employee_id) = 1;

update public.returns r
set created_by_auth_user_id = (
  select min(au.auth_user_id::text)::uuid
  from public.app_users au
  where au.employee_id = r.processed_by
  having count(*) = 1
)
where r.processed_by is not null
  and r.created_by_auth_user_id is null
  and (select count(*) from public.app_users au where au.employee_id = r.processed_by) = 1;

update public.tickets t
set created_by_auth_user_id = (
  select min(au.auth_user_id::text)::uuid
  from public.app_users au
  where lower(trim(au.display_name)) = lower(trim(t.created_by))
  having count(*) = 1
)
where trim(coalesce(t.created_by, '')) <> ''
  and t.created_by_auth_user_id is null
  and (select count(*) from public.app_users au
    where lower(trim(au.display_name)) = lower(trim(t.created_by))) = 1;

create or replace function app_private.capture_financial_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by_auth_user_id is null then
    new.created_by_auth_user_id := (select auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function app_private.capture_financial_actor()
  from public, anon, authenticated;

create trigger sales_capture_financial_actor
before insert on public.sales
for each row execute function app_private.capture_financial_actor();

create trigger tickets_capture_financial_actor
before insert on public.tickets
for each row execute function app_private.capture_financial_actor();

create trigger returns_capture_financial_actor
before insert on public.returns
for each row execute function app_private.capture_financial_actor();

create or replace function app_private.udhar_account_result(
  account_kind text,
  source_id bigint,
  replay boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with retail as (
    select
      'retail'::text as kind,
      s.id as source_id,
      coalesce(s.invoice_number, 'INV-' || s.id::text) as reference,
      coalesce(nullif(trim(u.customer_name), ''), nullif(trim(s.customer_name), ''), 'Walk-in') as customer_name,
      coalesce(u.customer_phone, '') as customer_phone,
      s.created_at,
      round(s.total_bill, 2) as original_obligation,
      round(coalesce((select sum(rl.refund_amount)
        from public.return_lines rl
        join public.returns r on r.id = rl.return_id
        where r.original_sale_id = s.id), 0), 2) as commercial_reduction,
      round(coalesce((select sum(p.amount) from public.payments p where p.sale_id = s.id), 0), 2) as payments_received,
      round(coalesce((select sum(r.amount) from public.refunds r where r.sale_id = s.id), 0), 2) as refunds_paid,
      round(coalesce((select max(ca.approved_amount) from public.credit_approvals ca
        where ca.sale_id = s.id and ca.status = 'Active'), 0), 2) as approved_amount
    from public.sales s
    left join public.udhar u on u.sale_id = s.id
    where account_kind = 'retail' and s.id = source_id
  ), repair as (
    select
      'repair'::text as kind,
      t.id as source_id,
      coalesce(t.invoice_number, t.ticket_number, 'REPAIR-' || t.id::text) as reference,
      coalesce(nullif(trim(t.customer_name), ''), 'Customer') as customer_name,
      coalesce(t.customer_phone, '') as customer_phone,
      t.created_at,
      round(coalesce((select sum(coalesce(f.final_total, f.estimated_quote, 0))
        from public.tickets f where f.id = t.id or f.parent_ticket_id = t.id), 0), 2) as original_obligation,
      round(-coalesce((select sum(ia.amount) from public.invoice_adjustments ia
        where ia.repair_root_ticket_id = t.id), 0), 2) as commercial_reduction,
      round(coalesce((select sum(p.amount) from public.payments p
        where p.repair_root_ticket_id = t.id), 0), 2) as payments_received,
      round(coalesce((select sum(r.amount) from public.refunds r
        where r.repair_root_ticket_id = t.id), 0), 2) as refunds_paid,
      round(coalesce((select max(ca.approved_amount) from public.credit_approvals ca
        where ca.repair_root_ticket_id = t.id and ca.status = 'Active'), 0), 2) as approved_amount
    from public.tickets t
    where account_kind = 'repair' and t.id = source_id and t.parent_ticket_id is null
  ), account as (
    select * from retail union all select * from repair
  )
  select jsonb_build_object(
    'kind', a.kind,
    'sourceId', a.source_id,
    'reference', a.reference,
    'customerName', a.customer_name,
    'customerPhone', a.customer_phone,
    'createdAt', a.created_at,
    'originalObligation', a.original_obligation,
    'commercialReduction', a.commercial_reduction,
    'effectiveObligation', round(a.original_obligation - a.commercial_reduction, 2),
    'paymentsReceived', a.payments_received,
    'refundsPaid', a.refunds_paid,
    'netPayments', round(a.payments_received - a.refunds_paid, 2),
    'outstanding', round(greatest(0,
      a.original_obligation - a.commercial_reduction
      - a.payments_received + a.refunds_paid), 2),
    'approvedAmount', a.approved_amount,
    'status', case when a.original_obligation - a.commercial_reduction
      - a.payments_received + a.refunds_paid <= 0 then 'Settled' else 'Active' end,
    'idempotentReplay', replay
  )
  from account a
$$;

revoke all on function app_private.udhar_account_result(text, bigint, boolean)
  from public, anon, authenticated;

create or replace function public.get_unified_udhar_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.app_users%rowtype;
  result jsonb;
begin
  select au.* into actor from public.app_users au
  where au.auth_user_id = (select auth.uid()) and au.status = 'Active';
  if actor.auth_user_id is null
     or actor.role not in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
     or not app_private.current_client_access_allowed() then
    raise exception 'Udhar access is not authorized' using errcode = '42501';
  end if;

  with active_accounts as (
    select 'retail'::text kind, ca.sale_id::bigint source_id, min(ca.created_at) approved_at
    from public.credit_approvals ca
    where ca.status = 'Active' and ca.sale_id is not null
    group by ca.sale_id
    union all
    select 'repair'::text, ca.repair_root_ticket_id, min(ca.created_at)
    from public.credit_approvals ca
    where ca.status = 'Active' and ca.repair_root_ticket_id is not null
    group by ca.repair_root_ticket_id
  ), hydrated as (
    select aa.*, app_private.udhar_account_result(aa.kind, aa.source_id, false) account
    from active_accounts aa
  )
  select coalesce(jsonb_agg(h.account order by h.approved_at, h.source_id), '[]'::jsonb)
  into result
  from hydrated h
  where (h.account ->> 'outstanding')::numeric > 0;

  return result;
end;
$$;

revoke all on function public.get_unified_udhar_accounts() from public, anon;
grant execute on function public.get_unified_udhar_accounts() to authenticated, service_role;

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
  select sua.id into step_up_id from public.step_up_authorizations sua
  where sua.auth_user_id = actor.auth_user_id and sua.purpose = 'settle'
    and sua.expires_at > now()
  order by sua.created_at desc limit 1;
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

revoke all on function public.settle_udhar(uuid, text, bigint, numeric, text, numeric)
  from public, anon;
grant execute on function public.settle_udhar(uuid, text, bigint, numeric, text, numeric)
  to authenticated, service_role;

-- The browser may read the legacy compatibility table, but may no longer write it.
revoke update on public.udhar from authenticated;
drop policy if exists udhar_update_step_up on public.udhar;

create or replace function public.get_financial_report(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_actor_only boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.app_users%rowtype;
  retail_invoiced numeric(14,2);
  repair_invoiced numeric(14,2);
  return_reductions numeric(14,2);
  repair_adjustments numeric(14,2);
  payments_collected numeric(14,2);
  refunds_paid numeric(14,2);
  receivables numeric(14,2);
  udhar_outstanding numeric(14,2);
  inventory_gross_profit numeric(14,2);
  inventory_cost_coverage numeric(14,2);
  invoice_count bigint;
  payment_count bigint;
  refund_count bigint;
  payment_methods jsonb;
  refund_methods jsonb;
begin
  select au.* into actor from public.app_users au
  where au.auth_user_id = (select auth.uid()) and au.status = 'Active';
  if actor.auth_user_id is null
     or actor.role not in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
     or not app_private.current_client_access_allowed()
     or (actor.role = 'Cashier' and not p_actor_only) then
    raise exception 'Financial reporting is not authorized' using errcode = '42501';
  end if;

  select round(coalesce(sum(s.total_bill), 0), 2), count(*)
  into retail_invoiced, invoice_count
  from public.sales s
  where (p_from is null or s.created_at >= p_from)
    and (p_to is null or s.created_at < p_to)
    and (not p_actor_only or s.created_by_auth_user_id = actor.auth_user_id);

  select round(coalesce(sum(coalesce(t.final_total, t.estimated_quote, 0)), 0), 2),
         invoice_count + count(*)
  into repair_invoiced, invoice_count
  from public.tickets t
  where (p_from is null or t.created_at >= p_from)
    and (p_to is null or t.created_at < p_to)
    and (not p_actor_only or t.created_by_auth_user_id = actor.auth_user_id);

  select round(coalesce(sum(rl.refund_amount), 0), 2)
  into return_reductions
  from public.return_lines rl
  join public.returns r on r.id = rl.return_id
  where (p_from is null or r.created_at >= p_from)
    and (p_to is null or r.created_at < p_to)
    and (not p_actor_only or r.created_by_auth_user_id = actor.auth_user_id);

  select round(coalesce(sum(ia.amount), 0), 2)
  into repair_adjustments
  from public.invoice_adjustments ia
  where (p_from is null or ia.created_at >= p_from)
    and (p_to is null or ia.created_at < p_to)
    and (not p_actor_only or ia.created_by_auth_user_id = actor.auth_user_id);

  select round(coalesce(sum(p.amount), 0), 2), count(*)
  into payments_collected, payment_count
  from public.payments p
  where (p_from is null or p.created_at >= p_from)
    and (p_to is null or p.created_at < p_to)
    and (not p_actor_only or p.created_by_auth_user_id = actor.auth_user_id);

  select round(coalesce(sum(r.amount), 0), 2), count(*)
  into refunds_paid, refund_count
  from public.refunds r
  where (p_from is null or r.created_at >= p_from)
    and (p_to is null or r.created_at < p_to)
    and (not p_actor_only or r.created_by_auth_user_id = actor.auth_user_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'method', grouped.method, 'amount', grouped.amount, 'count', grouped.event_count
  ) order by grouped.method), '[]'::jsonb)
  into payment_methods
  from (
    select p.method, round(sum(p.amount), 2) amount, count(*) event_count
    from public.payments p
    where (p_from is null or p.created_at >= p_from)
      and (p_to is null or p.created_at < p_to)
      and (not p_actor_only or p.created_by_auth_user_id = actor.auth_user_id)
    group by p.method
  ) grouped;

  select coalesce(jsonb_agg(jsonb_build_object(
    'method', grouped.method, 'amount', grouped.amount, 'count', grouped.event_count
  ) order by grouped.method), '[]'::jsonb)
  into refund_methods
  from (
    select r.method, round(sum(r.amount), 2) amount, count(*) event_count
    from public.refunds r
    where (p_from is null or r.created_at >= p_from)
      and (p_to is null or r.created_at < p_to)
      and (not p_actor_only or r.created_by_auth_user_id = actor.auth_user_id)
    group by r.method
  ) grouped;

  with retail_accounts as (
    select s.id, greatest(0,
      s.total_bill
      - coalesce((select sum(rl.refund_amount) from public.return_lines rl
          join public.returns r on r.id = rl.return_id where r.original_sale_id = s.id), 0)
      - coalesce((select sum(p.amount) from public.payments p where p.sale_id = s.id), 0)
      + coalesce((select sum(r.amount) from public.refunds r where r.sale_id = s.id), 0)
    ) outstanding,
    exists(select 1 from public.credit_approvals ca
      where ca.sale_id = s.id and ca.status = 'Active') approved
    from public.sales s
    where not p_actor_only or s.created_by_auth_user_id = actor.auth_user_id
  ), repair_accounts as (
    select t.id, greatest(0,
      coalesce((select sum(coalesce(f.final_total, f.estimated_quote, 0))
        from public.tickets f where f.id = t.id or f.parent_ticket_id = t.id), 0)
      + coalesce((select sum(ia.amount) from public.invoice_adjustments ia
        where ia.repair_root_ticket_id = t.id), 0)
      - coalesce((select sum(p.amount) from public.payments p
        where p.repair_root_ticket_id = t.id), 0)
      + coalesce((select sum(r.amount) from public.refunds r
        where r.repair_root_ticket_id = t.id), 0)
    ) outstanding,
    exists(select 1 from public.credit_approvals ca
      where ca.repair_root_ticket_id = t.id and ca.status = 'Active') approved
    from public.tickets t
    where t.parent_ticket_id is null
      and (not p_actor_only or t.created_by_auth_user_id = actor.auth_user_id)
  ), all_accounts as (
    select outstanding, approved from retail_accounts
    union all select outstanding, approved from repair_accounts
  )
  select round(coalesce(sum(outstanding), 0), 2),
         round(coalesce(sum(outstanding) filter (where approved), 0), 2)
  into receivables, udhar_outstanding
  from all_accounts;

  with reliable_sales as (
    select sl.id, sl.quantity, sl.line_total, sl.unit_cost_snapshot
    from public.sale_lines sl
    join public.sales s on s.id = sl.sale_id
    where sl.item_kind = 'inventory' and sl.unit_cost_snapshot is not null
      and (p_from is null or s.created_at >= p_from)
      and (p_to is null or s.created_at < p_to)
      and (not p_actor_only or s.created_by_auth_user_id = actor.auth_user_id)
  ), sale_margin as (
    select coalesce(sum(rs.line_total - rs.unit_cost_snapshot * rs.quantity), 0) amount,
           coalesce(sum(rs.line_total), 0) coverage
    from reliable_sales rs
  ), return_margin_reversal as (
    select coalesce(sum(
      case when rl.restock
        then (sl.line_total * rl.quantity / sl.quantity) - sl.unit_cost_snapshot * rl.quantity
        else (sl.line_total * rl.quantity / sl.quantity)
      end
    ), 0) amount
    from public.return_lines rl
    join public.returns r on r.id = rl.return_id
    join public.sale_lines sl on sl.id = rl.sale_line_id
    where sl.item_kind = 'inventory' and sl.unit_cost_snapshot is not null
      and (p_from is null or r.created_at >= p_from)
      and (p_to is null or r.created_at < p_to)
      and (not p_actor_only or r.created_by_auth_user_id = actor.auth_user_id)
  )
  select round(sm.amount - rmr.amount, 2), round(sm.coverage, 2)
  into inventory_gross_profit, inventory_cost_coverage
  from sale_margin sm cross join return_margin_reversal rmr;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'actorOnly', p_actor_only),
    'retailInvoiced', retail_invoiced,
    'repairInvoiced', repair_invoiced,
    'invoiced', round(retail_invoiced + repair_invoiced, 2),
    'retailReturnReductions', return_reductions,
    'repairAdjustments', repair_adjustments,
    'effectiveInvoiced', round(retail_invoiced + repair_invoiced - return_reductions + repair_adjustments, 2),
    'paymentsCollected', payments_collected,
    'refunds', refunds_paid,
    'netPayments', round(payments_collected - refunds_paid, 2),
    'outstandingReceivables', receivables,
    'udharOutstanding', udhar_outstanding,
    'inventoryGrossProfit', inventory_gross_profit,
    'inventoryCostCoverage', inventory_cost_coverage,
    'invoiceCount', invoice_count,
    'paymentCount', payment_count,
    'refundCount', refund_count,
    'paymentMethods', payment_methods,
    'refundMethods', refund_methods
  );
end;
$$;

revoke all on function public.get_financial_report(timestamptz, timestamptz, boolean)
  from public, anon;
grant execute on function public.get_financial_report(timestamptz, timestamptz, boolean)
  to authenticated, service_role;

comment on function public.get_unified_udhar_accounts() is
  'Authorized retail and repair Udhar accounts derived from canonical obligations, payments, refunds, and active approvals.';
comment on function public.settle_udhar(uuid, text, bigint, numeric, text, numeric) is
  'PIN-gated ordinary payment against one approved retail or repair Udhar account.';
comment on function public.get_financial_report(timestamptz, timestamptz, boolean) is
  'Canonical financial report separating invoices, payments, refunds, receivables, Udhar, and reliable Inventory gross profit.';
