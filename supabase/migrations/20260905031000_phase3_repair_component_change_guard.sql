-- Phase 3K: original repair-component evidence may only change through the
-- exact-purpose, idempotent server transaction.

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
  select sua.id into step_up_id from public.step_up_authorizations sua
  where sua.auth_user_id = actor.auth_user_id and sua.purpose = 'remove-component'
    and sua.expires_at > now() order by sua.created_at desc limit 1;
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

revoke all on function public.mark_repair_component_not_needed(uuid,bigint,integer,text)
  from public, anon;
grant execute on function public.mark_repair_component_not_needed(uuid,bigint,integer,text)
  to authenticated, service_role;

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
    or new.components_noted is distinct from old.components_noted
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
    raise exception 'Immutable repair, financial, delivery and cancellation fields require a dedicated transaction'
      using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function app_private.protect_ticket_financial_fields()
  from public,anon,authenticated;

comment on function public.mark_repair_component_not_needed(uuid,bigint,integer,text) is
  'PIN-authorized idempotent evidence-preserving repair component status change.';
