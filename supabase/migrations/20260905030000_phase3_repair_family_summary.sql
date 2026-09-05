-- Phase 3J: one authorized, canonical repair-family read model for UI and print.

create or replace function public.get_repair_family_summary(p_ticket_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.app_users%rowtype;
  root_id bigint;
  result jsonb;
begin
  if p_ticket_id is null then
    raise exception 'Repair ticket is required' using errcode = '22023';
  end if;
  select au.* into actor from public.app_users au
  where au.auth_user_id = (select auth.uid()) and au.status = 'Active';
  if actor.auth_user_id is null
     or actor.role not in ('Business Owner', 'Manager', 'Cashier', 'Orbito Support')
     or not app_private.current_client_access_allowed() then
    raise exception 'Repair financial summary is not authorized' using errcode = '42501';
  end if;

  select coalesce(t.parent_ticket_id, t.id) into root_id
  from public.tickets t where t.id = p_ticket_id;
  if root_id is null then
    raise exception 'Repair ticket not found' using errcode = '22023';
  end if;

  with invoice_rows as (
    select t.* from public.tickets t
    where t.id = root_id or t.parent_ticket_id = root_id
  ), totals as (
    select
      round(coalesce(sum(coalesce(t.final_total, t.estimated_quote, 0)), 0), 2) gross_billed,
      round(coalesce((select sum(ia.amount) from public.invoice_adjustments ia
        where ia.repair_root_ticket_id = root_id), 0), 2) adjustments,
      round(coalesce((select sum(p.amount) from public.payments p
        where p.repair_root_ticket_id = root_id), 0), 2) payments,
      round(coalesce((select sum(r.amount) from public.refunds r
        where r.repair_root_ticket_id = root_id), 0), 2) refunds
    from invoice_rows t
  )
  select jsonb_build_object(
    'root', jsonb_build_object(
      'id', root.id,
      'ticketNumber', root.ticket_number,
      'invoiceNumber', root.invoice_number,
      'customerName', root.customer_name,
      'customerPhone', root.customer_phone,
      'deviceBrand', root.device_brand,
      'deviceModel', root.device_model,
      'imei', root.imei,
      'status', root.status,
      'createdAt', root.created_at,
      'deliveredAt', root.delivered_at,
      'cancelledAt', root.cancelled_at,
      'cancellationReason', root.cancellation_reason
    ),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id,
      'invoiceNumber', i.invoice_number,
      'ticketNumber', i.ticket_number,
      'parentTicketId', i.parent_ticket_id,
      'amount', round(coalesce(i.final_total, i.estimated_quote, 0), 2),
      'components', coalesce(i.components_noted, '[]'::jsonb),
      'labourCost', round(coalesce(i.labour_cost, 0), 2),
      'note', coalesce(i.technician_note, ''),
      'createdAt', i.created_at
    ) order by (i.parent_ticket_id is not null), i.created_at, i.id) from invoice_rows i), '[]'::jsonb),
    'proposals', coalesce((select jsonb_agg(jsonb_build_object(
      'id', aw.id,
      'description', aw.description,
      'quotedAmount', aw.quoted_amount,
      'decision', aw.decision,
      'decisionMethod', aw.decision_method,
      'decisionNote', aw.decision_note,
      'subinvoiceTicketId', aw.subinvoice_ticket_id,
      'createdAt', aw.created_at,
      'decidedAt', aw.decided_at
    ) order by aw.created_at, aw.id) from public.additional_work_proposals aw
      where aw.root_ticket_id = root_id), '[]'::jsonb),
    'adjustments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', ia.id,
      'ticketId', ia.ticket_id,
      'amount', ia.amount,
      'type', ia.adjustment_type,
      'reason', ia.reason,
      'createdAt', ia.created_at
    ) order by ia.created_at, ia.id) from public.invoice_adjustments ia
      where ia.repair_root_ticket_id = root_id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'amount', p.amount,
      'method', p.method,
      'cashTendered', p.cash_tendered,
      'changeGiven', p.change_given,
      'source', p.source,
      'createdAt', p.created_at
    ) order by p.created_at, p.id) from public.payments p
      where p.repair_root_ticket_id = root_id), '[]'::jsonb),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'amount', r.amount,
      'method', r.method,
      'reason', r.reason,
      'createdAt', r.created_at
    ) order by r.created_at, r.id) from public.refunds r
      where r.repair_root_ticket_id = root_id), '[]'::jsonb),
    'grossBilled', totals.gross_billed,
    'adjustmentTotal', totals.adjustments,
    'effectiveObligation', round(totals.gross_billed + totals.adjustments, 2),
    'paymentsReceived', totals.payments,
    'refundsPaid', totals.refunds,
    'netPayments', round(totals.payments - totals.refunds, 2),
    'outstanding', round(greatest(0,
      totals.gross_billed + totals.adjustments - totals.payments + totals.refunds), 2),
    'udharApproved', exists(select 1 from public.credit_approvals ca
      where ca.repair_root_ticket_id = root_id and ca.status = 'Active'),
    'udharOutstanding', case when exists(select 1 from public.credit_approvals ca
      where ca.repair_root_ticket_id = root_id and ca.status = 'Active')
      then round(greatest(0,
        totals.gross_billed + totals.adjustments - totals.payments + totals.refunds), 2)
      else 0 end
  ) into result
  from public.tickets root cross join totals
  where root.id = root_id and root.parent_ticket_id is null;

  return result;
end;
$$;

revoke all on function public.get_repair_family_summary(bigint) from public, anon;
grant execute on function public.get_repair_family_summary(bigint) to authenticated, service_role;

comment on function public.get_repair_family_summary(bigint) is
  'Authorized canonical parent/children/adjustments/payments/refunds/Udhar repair-family read model for UI and printing.';
