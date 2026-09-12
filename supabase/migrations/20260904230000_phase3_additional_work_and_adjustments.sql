-- Phase 3F: durable additional-work decisions, child invoices and adjustments.

alter table public.additional_work_proposals
  add column decision_request_id uuid;

create unique index additional_work_decision_request_key
  on public.additional_work_proposals (decision_request_id)
  where decision_request_id is not null;

create or replace function public.save_additional_work_proposal(
  p_request_id uuid,
  p_root_ticket_id bigint,
  p_description text,
  p_details jsonb default '{}'::jsonb,
  p_quoted_amount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.app_users%rowtype;
  root_ticket public.tickets%rowtype;
  proposal public.additional_work_proposals%rowtype;
begin
  if p_request_id is null or p_root_ticket_id is null
     or trim(coalesce(p_description, '')) = ''
     or p_quoted_amount < 0
     or jsonb_typeof(p_details) <> 'object' then
    raise exception 'Invalid additional-work proposal' using errcode = '22023';
  end if;
  select au.* into actor from public.app_users au
  where au.auth_user_id = (select auth.uid()) and au.status = 'Active';
  if actor.auth_user_id is null
     or actor.role not in ('Business Owner','Manager','Cashier','Technician','Orbito Support')
     or not app_private.current_client_access_allowed() then
    raise exception 'Additional-work proposal is not authorized' using errcode = '42501';
  end if;
  select t.* into root_ticket from public.tickets t
  where t.id = p_root_ticket_id and t.parent_ticket_id is null
  for update;
  if root_ticket.id is null or root_ticket.status in ('Cancelled','Delivered') then
    raise exception 'Repair is not eligible for additional work' using errcode = '22023';
  end if;
  select aw.* into proposal from public.additional_work_proposals aw
  where aw.request_id = p_request_id;
  if proposal.id is null then
    insert into public.additional_work_proposals (
      request_id, root_ticket_id, description, details, quoted_amount,
      decision, created_by_auth_user_id
    ) values (
      p_request_id, p_root_ticket_id, trim(p_description), p_details,
      round(p_quoted_amount,2), 'Pending', actor.auth_user_id
    ) returning * into proposal;
  elsif proposal.root_ticket_id <> p_root_ticket_id then
    raise exception 'request_id belongs to another repair' using errcode = '22023';
  end if;
  return to_jsonb(proposal);
end;
$$;

create or replace function public.decide_additional_work(
  p_request_id uuid,
  p_proposal_id bigint,
  p_decision text,
  p_decision_method text,
  p_decision_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.app_users%rowtype;
  proposal public.additional_work_proposals%rowtype;
  root_ticket public.tickets%rowtype;
  shop public.shop_config%rowtype;
  child_ticket public.tickets%rowtype;
  child_number integer;
  child_ticket_number text;
  child_invoice_number text;
begin
  if p_request_id is null or p_proposal_id is null
     or p_decision not in ('Approved','Declined')
     or p_decision_method not in ('Phone','In person','WhatsApp','Other') then
    raise exception 'Invalid additional-work decision' using errcode = '22023';
  end if;
  select au.* into actor from public.app_users au
  where au.auth_user_id = (select auth.uid()) and au.status = 'Active';
  if actor.auth_user_id is null
     or actor.role not in ('Business Owner','Manager','Cashier','Orbito Support')
     or not app_private.current_client_access_allowed() then
    raise exception 'Additional-work decision is not authorized' using errcode = '42501';
  end if;
  select aw.* into proposal from public.additional_work_proposals aw
  where aw.id = p_proposal_id for update;
  if proposal.id is null then
    raise exception 'Additional-work proposal not found' using errcode = '22023';
  end if;
  if proposal.decision_request_id = p_request_id then
    return jsonb_build_object('proposal',to_jsonb(proposal),'ticket',(
      select to_jsonb(t) from public.tickets t where t.id=proposal.subinvoice_ticket_id
    ),'idempotentReplay',true);
  end if;
  if proposal.decision <> 'Pending' then
    raise exception 'Additional-work proposal is already decided' using errcode = '22023';
  end if;
  select t.* into root_ticket from public.tickets t
  where t.id = proposal.root_ticket_id and t.parent_ticket_id is null
  for update;
  if root_ticket.id is null or root_ticket.status in ('Cancelled','Delivered') then
    raise exception 'Repair is not eligible for additional work' using errcode = '22023';
  end if;

  if p_decision = 'Approved' then
    select sc.* into shop from public.shop_config sc where sc.id=1 for update;
    if not coalesce(shop.repair_module_enabled,false) then
      raise exception 'Repair module is not enabled' using errcode = '42501';
    end if;
    select count(*)+1 into child_number from public.tickets t
    where t.parent_ticket_id = root_ticket.id;
    child_ticket_number := concat(root_ticket.ticket_number,'-ADD',lpad(child_number::text,2,'0'));
    update public.shop_config set invoice_seq=coalesce(invoice_seq,0)+1 where id=1
    returning concat(coalesce(nullif(trim(invoice_prefix),''),'INV'),
      to_char(now() at time zone 'Asia/Karachi','YYYYMMDD'),
      lpad(invoice_seq::text,4,'0')) into child_invoice_number;

    insert into public.tickets (
      request_id,parent_ticket_id,ticket_number,invoice_number,customer_name,
      customer_phone,device_brand,device_model,imei,components_noted,
      estimated_quote,advance_payment,advance_method,status,technician_note,
      created_by,labour_cost,final_total,amount_paid,balance_due,
      payment_history,is_locked,placed_at
    ) values (
      md5(p_request_id::text||':subinvoice')::uuid,root_ticket.id,
      child_ticket_number,child_invoice_number,root_ticket.customer_name,
      root_ticket.customer_phone,root_ticket.device_brand,root_ticket.device_model,
      root_ticket.imei,coalesce(proposal.details->'components','[]'::jsonb),
      proposal.quoted_amount,0,'','Pending',
      trim(coalesce(proposal.details->>'note','')),actor.display_name,
      round(coalesce(nullif(proposal.details->>'labourCost','')::numeric,0),2),
      proposal.quoted_amount,0,proposal.quoted_amount,'[]'::jsonb,true,now()
    ) returning * into child_ticket;
  end if;

  update public.additional_work_proposals
  set decision=p_decision,
      decision_request_id=p_request_id,
      decision_method=p_decision_method,
      decision_note=trim(coalesce(p_decision_note,'')),
      decided_by_auth_user_id=actor.auth_user_id,
      decided_at=now(),
      subinvoice_ticket_id=case when p_decision='Approved' then child_ticket.id else null end
  where id=proposal.id
  returning * into proposal;

  return jsonb_build_object('proposal',to_jsonb(proposal),
    'ticket',case when child_ticket.id is null then null else to_jsonb(child_ticket) end,
    'idempotentReplay',false);
end;
$$;

create or replace function public.approve_additional_work(
  p_request_id uuid,
  p_root_ticket_id bigint,
  p_description text,
  p_details jsonb,
  p_quoted_amount numeric,
  p_decision_method text default 'In person',
  p_decision_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare proposal jsonb;
begin
  proposal := public.save_additional_work_proposal(
    p_request_id,p_root_ticket_id,p_description,p_details,p_quoted_amount
  );
  return public.decide_additional_work(
    md5(p_request_id::text||':decision')::uuid,
    (proposal->>'id')::bigint,'Approved',p_decision_method,p_decision_note
  );
end;
$$;

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
  select sua.id into step_up_id from public.step_up_authorizations sua
  where sua.auth_user_id=actor.auth_user_id and sua.purpose='discount'
    and sua.expires_at>now() order by sua.created_at desc limit 1;
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

revoke all on function public.save_additional_work_proposal(uuid,bigint,text,jsonb,numeric)
  from public,anon;
grant execute on function public.save_additional_work_proposal(uuid,bigint,text,jsonb,numeric)
  to authenticated,service_role;
revoke all on function public.decide_additional_work(uuid,bigint,text,text,text)
  from public,anon;
grant execute on function public.decide_additional_work(uuid,bigint,text,text,text)
  to authenticated,service_role;
revoke all on function public.approve_additional_work(uuid,bigint,text,jsonb,numeric,text,text)
  from public,anon;
grant execute on function public.approve_additional_work(uuid,bigint,text,jsonb,numeric,text,text)
  to authenticated,service_role;
revoke all on function public.create_repair_adjustment(uuid,bigint,bigint,numeric,text,text)
  from public,anon;
grant execute on function public.create_repair_adjustment(uuid,bigint,bigint,numeric,text,text)
  to authenticated,service_role;

-- Original repair and child-invoice creation are now both RPC-owned.
revoke insert on public.tickets from authenticated;
drop policy if exists tickets_insert_counter on public.tickets;

comment on function public.save_additional_work_proposal(uuid,bigint,text,jsonb,numeric) is
  'Durable pending additional-work proposal; Technician may propose but cannot approve.';
comment on function public.decide_additional_work(uuid,bigint,text,text,text) is
  'Durable Approved/Declined decision; Approved atomically creates a zero-paid child invoice.';
comment on function public.create_repair_adjustment(uuid,bigint,bigint,numeric,text,text) is
  'PIN-authorized immutable downward repair adjustment; excess-payment state is rejected.';
