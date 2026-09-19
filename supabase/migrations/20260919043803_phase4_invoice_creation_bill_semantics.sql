-- Forward-only commercial correction: BILL means invoice creation, not payment.
-- Existing immutable events/outbox history are not reinterpreted or replayed.

create or replace function public.record_repair_payment(p_request_id uuid,p_root_ticket_id bigint,p_tenders jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select app_private.record_repair_payment(p_request_id,p_root_ticket_id,p_tenders)
    || jsonb_build_object('usageEventId',null,'usageDelivery','none');
$$;

-- Preserve the exact authorized/locked financial implementation as a private core.
-- approve_additional_work already calls public.decide_additional_work, so both
-- approval entry points pass through this single capture boundary.
alter function public.decide_additional_work(uuid,bigint,text,text,text) set schema app_private;
revoke all on function app_private.decide_additional_work(uuid,bigint,text,text,text)
  from public,anon,authenticated;

create function public.decide_additional_work(
  p_request_id uuid,p_proposal_id bigint,p_decision text,p_decision_method text,
  p_decision_note text default ''
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result:=app_private.decide_additional_work(
    p_request_id,p_proposal_id,p_decision,p_decision_method,p_decision_note);
  -- Inspect persisted result rather than caller input; Pending/Declined create no invoice.
  if result->'proposal'->>'decision'='Approved' and result->'ticket'->>'id' is not null then
    return app_private.attach_usage_route(result,'create_repair_subinvoice',
      (result->'ticket'->>'request_id')::uuid,'BILL');
  end if;
  return result||jsonb_build_object('usageEventId',null,'usageDelivery','none');
end $$;
revoke all on function public.decide_additional_work(uuid,bigint,text,text,text) from public,anon;
grant execute on function public.decide_additional_work(uuid,bigint,text,text,text) to authenticated;

comment on function public.decide_additional_work(uuid,bigint,text,text,text) is
  'Authorized additional-work decision; each newly created approved child invoice captures one BILL using its stable ticket request ID. Historical retries are not backfilled.';
comment on function public.record_repair_payment(uuid,bigint,jsonb) is
  'Existing financial payment core; collecting money does not create SaaS BILL usage.';
