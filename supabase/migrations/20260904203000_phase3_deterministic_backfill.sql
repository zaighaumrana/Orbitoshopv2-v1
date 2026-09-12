-- Phase 3C: deterministic legacy backfill only.
-- Unknown historical Inventory identity and delivery semantics remain unfilled.

do $preflight$
begin
  if exists (select 1 from public.sale_lines)
    or exists (select 1 from public.payments)
    or exists (select 1 from public.payment_allocations)
    or exists (select 1 from public.refunds)
    or exists (select 1 from public.invoice_adjustments)
    or exists (select 1 from public.credit_approvals)
    or exists (select 1 from public.additional_work_proposals)
    or exists (select 1 from public.return_lines)
    or exists (select 1 from public.inventory_movements)
  then
    raise exception 'Phase 3 backfill requires empty canonical tables';
  end if;

  if exists (
    select 1 from public.sales
    where payment_method = 'Cash' and total_bill > 0 and coalesce(cash_tendered, 0) = 0
  ) then
    raise exception 'Ambiguous legacy Cash sale detected';
  end if;

  if exists (select 1 from public.returns) then
    raise exception 'Legacy return requires explicit refund-method resolution';
  end if;

  if exists (
    select 1 from public.sales
    where payment_method = 'Cash' and cash_tendered > 0
      and (cash_tendered < total_bill or change_given <> cash_tendered - total_bill)
  ) then
    raise exception 'Legacy Cash tender/change does not reconcile';
  end if;

  if exists (
    select 1
    from public.tickets t
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(t.payment_history) = 'array' then t.payment_history else '[]'::jsonb end
    ) p
    where coalesce(p.value ->> 'amount', p.value ->> 'paid', '') !~ '^[0-9]+([.][0-9]+)?$'
      or coalesce((p.value ->> 'amount')::numeric, (p.value ->> 'paid')::numeric, 0) <= 0
      or nullif(trim(p.value ->> 'method'), '') is null
  ) then
    raise exception 'Ambiguous legacy repair payment event detected';
  end if;
end
$preflight$;

insert into public.sale_lines (
  sale_id, line_number, item_kind, inventory_id, quick_item_id,
  name_snapshot, variant_snapshot, quantity, unit_price,
  unit_cost_snapshot, discount_amount, discount_reason, line_total,
  legacy_backfill, legacy_source, created_at
)
select
  s.id,
  i.ordinality::integer,
  'other',
  null,
  null,
  coalesce(nullif(i.value ->> 'name', ''), 'Legacy item'),
  coalesce(i.value ->> 'variant_name', i.value ->> 'variantName', ''),
  coalesce((i.value ->> 'qty')::integer, 1),
  coalesce((i.value ->> 'sold_price')::numeric, (i.value ->> 'soldPrice')::numeric, 0),
  null,
  coalesce((i.value ->> 'discount')::numeric, 0) * coalesce((i.value ->> 'qty')::integer, 1),
  coalesce(i.value ->> 'reason', ''),
  coalesce((i.value ->> 'sold_price')::numeric, (i.value ->> 'soldPrice')::numeric, 0)
    * coalesce((i.value ->> 'qty')::integer, 1),
  true,
  jsonb_build_object('table', 'sales', 'sale_id', s.id, 'item_ordinality', i.ordinality),
  s.created_at
from public.sales s
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(s.items_sold) = 'array' then s.items_sold else '[]'::jsonb end
) with ordinality i(value, ordinality);

insert into public.payments (
  request_id, sale_id, amount, method, cash_tendered, change_given,
  source, note, created_by_auth_user_id, legacy_backfill, legacy_source, created_at
)
select
  md5('phase3:legacy:sale:' || s.id)::uuid,
  s.id,
  s.total_bill,
  'Cash',
  s.cash_tendered,
  s.change_given,
  'legacy_retail_sale',
  'Deterministic backfill from reconciled Cash tender and change',
  null,
  true,
  jsonb_build_object('table', 'sales', 'sale_id', s.id),
  s.created_at
from public.sales s
where s.payment_method = 'Cash'
  and s.total_bill > 0
  and s.cash_tendered >= s.total_bill
  and s.change_given = s.cash_tendered - s.total_bill;

insert into public.payments (
  request_id, sale_id, amount, method, cash_tendered, change_given,
  source, note, created_by_auth_user_id, legacy_backfill, legacy_source, created_at
)
select
  md5('phase3:legacy:udhar:' || u.id || ':event:' || p.ordinality)::uuid,
  u.sale_id,
  coalesce((p.value ->> 'amount')::numeric, (p.value ->> 'paid')::numeric),
  p.value ->> 'method',
  null,
  0,
  'legacy_udhar_payment',
  'Deterministic backfill from reconciled legacy Udhar payment history',
  null,
  true,
  jsonb_build_object('table', 'udhar', 'udhar_id', u.id, 'event_ordinality', p.ordinality),
  case
    when coalesce(p.value ->> 'date', '') ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}'
      then (p.value ->> 'date')::timestamptz
    else u.created_at
  end
from public.udhar u
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(u.payment_history) = 'array' then u.payment_history else '[]'::jsonb end
) with ordinality p(value, ordinality)
where u.sale_id is not null;

insert into public.payments (
  request_id, repair_root_ticket_id, amount, method, cash_tendered, change_given,
  source, note, created_by_auth_user_id, legacy_backfill, legacy_source, created_at
)
select
  md5('phase3:legacy:ticket:' || t.id || ':event:' || p.ordinality)::uuid,
  t.id,
  coalesce((p.value ->> 'amount')::numeric, (p.value ->> 'paid')::numeric),
  p.value ->> 'method',
  null,
  0,
  case when p.ordinality = 1 and coalesce(t.advance_payment, 0) > 0
    then 'legacy_repair_advance' else 'legacy_repair_payment' end,
  'Deterministic backfill from reconciled legacy ticket payment history',
  null,
  true,
  jsonb_build_object('table', 'tickets', 'ticket_id', t.id, 'event_ordinality', p.ordinality),
  case
    when coalesce(p.value ->> 'date', '') ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}'
      then (p.value ->> 'date')::timestamptz
    else t.created_at
  end
from public.tickets t
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(t.payment_history) = 'array' then t.payment_history else '[]'::jsonb end
) with ordinality p(value, ordinality)
where t.parent_ticket_id is null;

insert into public.payment_allocations (payment_id, sale_id, amount, created_at)
select p.id, p.sale_id, p.amount, p.created_at
from public.payments p
where p.sale_id is not null;

insert into public.payment_allocations (payment_id, ticket_id, amount, created_at)
select p.id, p.repair_root_ticket_id, p.amount, p.created_at
from public.payments p
where p.repair_root_ticket_id is not null;

insert into public.credit_approvals (
  request_id, sale_id, approved_amount, status,
  approved_by_auth_user_id, step_up_authorization_id,
  legacy_backfill, legacy_source, created_at, settled_at
)
select
  md5('phase3:legacy:udhar-credit:' || u.id)::uuid,
  u.sale_id,
  u.balance_due,
  case when u.balance_due > 0 then 'Active' else 'Settled' end,
  null,
  null,
  true,
  jsonb_build_object('table', 'udhar', 'udhar_id', u.id),
  u.created_at,
  case when u.balance_due > 0 then null else coalesce(u.settled_at, u.created_at) end
from public.udhar u
where u.sale_id is not null and u.balance_due > 0;

insert into public.inventory_movements (
  request_id, inventory_id, movement_type, quantity_delta,
  reason, created_by_auth_user_id, created_at
)
select
  md5('phase3:opening-inventory:' || i.id)::uuid,
  i.id,
  'opening_balance',
  i.qty,
  'Phase 3 cutover opening balance from current inventory.qty; no historical movement inferred',
  null,
  now()
from public.inventory i
where i.qty > 0;

do $postcheck$
declare
  expected_lines bigint;
  expected_payments bigint;
  expected_credit bigint;
  expected_opening bigint;
begin
  select count(*) into expected_lines
  from public.sales s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.items_sold) = 'array' then s.items_sold else '[]'::jsonb end
  );

  select
    (select count(*) from public.sales
      where payment_method = 'Cash' and total_bill > 0
        and cash_tendered >= total_bill and change_given = cash_tendered - total_bill)
    + (select coalesce(sum(jsonb_array_length(
        case when jsonb_typeof(payment_history) = 'array' then payment_history else '[]'::jsonb end
      )), 0) from public.udhar where sale_id is not null)
    + (select coalesce(sum(jsonb_array_length(
        case when jsonb_typeof(payment_history) = 'array' then payment_history else '[]'::jsonb end
      )), 0) from public.tickets where parent_ticket_id is null)
  into expected_payments;

  select count(*) into expected_credit from public.udhar where sale_id is not null and balance_due > 0;
  select count(*) into expected_opening from public.inventory where qty > 0;

  if (select count(*) from public.sale_lines) <> expected_lines then
    raise exception 'Phase 3 sale-line backfill count mismatch';
  end if;
  if (select count(*) from public.payments) <> expected_payments then
    raise exception 'Phase 3 payment backfill count mismatch';
  end if;
  if (select count(*) from public.payment_allocations) <> expected_payments then
    raise exception 'Phase 3 allocation backfill count mismatch';
  end if;
  if (select count(*) from public.credit_approvals) <> expected_credit then
    raise exception 'Phase 3 credit backfill count mismatch';
  end if;
  if (select count(*) from public.inventory_movements) <> expected_opening then
    raise exception 'Phase 3 opening Inventory movement count mismatch';
  end if;
  if exists (
    select 1 from public.payments p
    left join (
      select payment_id, sum(amount) allocated
      from public.payment_allocations group by payment_id
    ) a on a.payment_id = p.id
    where p.amount <> coalesce(a.allocated, 0)
  ) then
    raise exception 'Phase 3 payment allocation sum mismatch';
  end if;
end
$postcheck$;
