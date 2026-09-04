-- Phase 3G: immutable repair cancellation/refund and explicit delivery.

alter table public.step_up_authorizations
  drop constraint if exists step_up_authorizations_purpose_check;
alter table public.step_up_authorizations
  add constraint step_up_authorizations_purpose_check check (purpose in (
    'admin','settle','return','discount','udhar','remove-component','repair-refund'
  ));

alter table public.tickets
  add column delivery_request_id uuid,
  add column delivered_at timestamptz,
  add column delivered_by_auth_user_id uuid references auth.users(id) on delete restrict,
  add column cancellation_request_id uuid,
  add column cancelled_at timestamptz,
  add column cancelled_by_auth_user_id uuid references auth.users(id) on delete restrict,
  add column cancellation_reason text not null default '';

create unique index tickets_delivery_request_key on public.tickets(delivery_request_id)
  where delivery_request_id is not null;
create unique index tickets_cancellation_request_key on public.tickets(cancellation_request_id)
  where cancellation_request_id is not null;
create index tickets_delivered_by_idx on public.tickets(delivered_by_auth_user_id)
  where delivered_by_auth_user_id is not null;
create index tickets_cancelled_by_idx on public.tickets(cancelled_by_auth_user_id)
  where cancelled_by_auth_user_id is not null;

create or replace function app_private.protect_ticket_financial_fields()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if current_user in ('anon','authenticated') and (
    new.request_id is distinct from old.request_id
    or new.parent_ticket_id is distinct from old.parent_ticket_id
    or new.ticket_number is distinct from old.ticket_number
    or new.invoice_number is distinct from old.invoice_number
    or new.customer_name is distinct from old.customer_name
    or new.customer_phone is distinct from old.customer_phone
    or new.device_brand is distinct from old.device_brand
    or new.device_model is distinct from old.device_model
    or new.imei is distinct from old.imei
    or new.estimated_quote is distinct from old.estimated_quote
    or new.advance_payment is distinct from old.advance_payment
    or new.advance_method is distinct from old.advance_method
    or new.labour_cost is distinct from old.labour_cost
    or new.actual_quote is distinct from old.actual_quote
    or new.final_price_override is distinct from old.final_price_override
    or new.final_total is distinct from old.final_total
    or new.amount_paid is distinct from old.amount_paid
    or new.balance_due is distinct from old.balance_due
    or new.payment_history is distinct from old.payment_history
    or new.is_locked is distinct from old.is_locked
    or new.collected_at is distinct from old.collected_at
    or new.delivery_request_id is distinct from old.delivery_request_id
    or new.delivered_at is distinct from old.delivered_at
    or new.delivered_by_auth_user_id is distinct from old.delivered_by_auth_user_id
    or new.cancellation_request_id is distinct from old.cancellation_request_id
    or new.cancelled_at is distinct from old.cancelled_at
    or new.cancelled_by_auth_user_id is distinct from old.cancelled_by_auth_user_id
    or new.cancellation_reason is distinct from old.cancellation_reason
    or (new.status is distinct from old.status and (
      new.status in ('Delivered','Cancelled') or old.status in ('Delivered','Cancelled')
    ))
  ) then
    raise exception 'Financial, delivery and cancellation fields require a dedicated transaction'
      using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function app_private.protect_ticket_financial_fields()
  from public,anon,authenticated;
create trigger tickets_protect_financial_fields
before update on public.tickets
for each row execute function app_private.protect_ticket_financial_fields();

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
  select sua.id into step_up_id from public.step_up_authorizations sua
  where sua.auth_user_id=actor.auth_user_id and sua.purpose='repair-refund'
    and sua.expires_at>now() order by sua.created_at desc limit 1;
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
    select sua.id into step_up_id from public.step_up_authorizations sua
    where sua.auth_user_id=actor.auth_user_id and sua.purpose='udhar'
      and sua.expires_at>now() order by sua.created_at desc limit 1;
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

revoke all on function public.cancel_repair(uuid,bigint,numeric,text,text)
  from public,anon;
grant execute on function public.cancel_repair(uuid,bigint,numeric,text,text)
  to authenticated,service_role;
revoke all on function public.deliver_repair(uuid,bigint,boolean)
  from public,anon;
grant execute on function public.deliver_repair(uuid,bigint,boolean)
  to authenticated,service_role;

comment on function public.cancel_repair(uuid,bigint,numeric,text,text) is
  'PIN-authorized atomic cancellation, obligation reconciliation and optional immutable refund.';
comment on function public.deliver_repair(uuid,bigint,boolean) is
  'Explicit physical handoff: Ready and either paid or PIN-approved Udhar.';
