-- Server-side register shifts for POS operators (Business Owner and Cashier).
-- Additive: one table, five RPCs, one summary helper and one new PIN purpose ('shift-close').
-- Existing tables, policies, transaction workflows and financial history are untouched; the only
-- re-created functions are get_app_config (one new read_contracts key), shop_backend_capabilities
-- (one new capability) and verify_override_pin_guarded (one new purpose).
set local lock_timeout='5s';
set local statement_timeout='60s';

create table public.register_shifts (
 id uuid primary key default gen_random_uuid(),
 operator_auth_user_id uuid not null references auth.users(id) on delete restrict,
 operator_name text not null check (char_length(btrim(operator_name)) between 1 and 120),
 operator_role text not null check (operator_role in ('Business Owner','Cashier')),
 started_at timestamptz not null default now(),
 opening_cash numeric(14,2) not null default 0 check (opening_cash >= 0),
 open_request_id uuid not null unique,
 ended_at timestamptz,
 close_reason text check (close_reason in ('operator','manager_forced')),
 closed_by_auth_user_id uuid references auth.users(id) on delete restrict,
 close_request_id uuid unique,
 counted_cash numeric(14,2) check (counted_cash is null or counted_cash >= 0),
 expected_cash numeric(14,2),
 difference numeric(14,2),
 note text not null default '' check (char_length(note) <= 500),
 approval text check (approval in ('override-pin','owner-adjustment')),
 step_up_authorization_id uuid references public.step_up_authorizations(id) on delete restrict,
 summary jsonb,
 constraint register_shifts_close_shape check (
  (ended_at is null and close_reason is null and closed_by_auth_user_id is null and close_request_id is null
   and summary is null and expected_cash is null and counted_cash is null and difference is null
   and approval is null and step_up_authorization_id is null)
  or (ended_at is not null and ended_at >= started_at and close_reason is not null
   and closed_by_auth_user_id is not null and close_request_id is not null
   and summary is not null and expected_cash is not null)
 ),
 constraint register_shifts_count_shape check (
  close_reason is null
  or (close_reason = 'operator' and counted_cash is not null and difference is not null)
  or (close_reason = 'manager_forced' and counted_cash is null and difference is null and approval is null)
 )
);
-- One open register per operator, enforced by the database.
create unique index register_shifts_one_open_per_operator on public.register_shifts(operator_auth_user_id) where ended_at is null;
create index register_shifts_operator_started_idx on public.register_shifts(operator_auth_user_id, started_at desc, id desc);
create index register_shifts_started_idx on public.register_shifts(started_at desc, id desc);

alter table public.register_shifts enable row level security;
revoke all on public.register_shifts from public,anon,authenticated;
grant select on public.register_shifts to authenticated;
create policy register_shifts_read on public.register_shifts for select to authenticated using (
 (select app_private.current_client_access_allowed())
 and (
  (select app_private.current_app_role()) in ('Business Owner','Manager','Orbito Support')
  or operator_auth_user_id = (select auth.uid())
 )
);
create policy support_consent_guard on public.register_shifts as restrictive for all to authenticated
 using ((select app_private.support_access_allowed())) with check ((select app_private.support_access_allowed()));

-- Shifts are permanent records: only the audited RPCs open or close them, and a closed shift never changes.
create function app_private.protect_register_shifts() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then
  raise exception 'Register shifts are permanent records' using errcode='42501';
 end if;
 if old.ended_at is not null then
  raise exception 'A closed register shift cannot change' using errcode='42501';
 end if;
 if new.id<>old.id or new.operator_auth_user_id<>old.operator_auth_user_id or new.started_at<>old.started_at
    or new.opening_cash<>old.opening_cash or new.open_request_id<>old.open_request_id then
  raise exception 'A register shift keeps its operator, start time and opening cash' using errcode='42501';
 end if;
 return new;
end$$;
revoke all on function app_private.protect_register_shifts() from public,anon,authenticated;
create trigger register_shifts_protect before update or delete on public.register_shifts
 for each row execute function app_private.protect_register_shifts();

create function app_private.register_shift_json(r public.register_shifts) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
  'id',r.id,'operatorId',r.operator_auth_user_id,'operatorName',r.operator_name,'role',r.operator_role,
  'startedAt',r.started_at,'openingCash',r.opening_cash,'endedAt',r.ended_at,'closeReason',r.close_reason,
  'countedCash',r.counted_cash,'expectedCash',r.expected_cash,'difference',r.difference,'note',r.note,
  'approvedBy',case r.approval when 'override-pin' then 'override PIN' when 'owner-adjustment' then 'owner (own adjustment)' else null end,
  'summary',r.summary)
$$;
revoke all on function app_private.register_shift_json(public.register_shifts) from public,anon,authenticated;

-- The day's figures for one operator between two instants. Online channels and unpaid credit never
-- count as register cash. Expected cash = opening cash + cash received - cash paid back as refunds.
create function app_private.register_shift_summary(p_operator uuid,p_from timestamptz,p_to timestamptz,p_opening numeric)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 v_cash_sales numeric(14,2); v_cash_repair numeric(14,2); v_cash_credit_new numeric(14,2); v_cash_credit_repaid numeric(14,2);
 v_online_credit_new numeric(14,2); v_online_credit_repaid numeric(14,2);
 v_channels jsonb; v_online_total numeric(14,2); v_credit_given numeric(14,2);
 v_return_count integer; v_return_total numeric(14,2); v_refund_cash numeric(14,2); v_refund_online numeric(14,2);
 v_retail numeric(14,2); v_repair numeric(14,2); v_items integer; v_discounts numeric(14,2);
 v_created integer; v_handed integer; v_open_now integer; v_cash_total numeric(14,2); v_expected numeric(14,2);
begin
 -- Each payment lands in exactly one bucket. A payment made in the same transaction as a credit approval
 -- is "paid at creation"; a payment after a credit approval is "repaid later"; everything else is a sale or repair payment.
 with pay as (
  select p.amount,
   lower(btrim(p.method))='cash' as is_cash,
   p.sale_id is not null as is_sale,
   exists(select 1 from public.credit_approvals ca where ca.status in ('Active','Settled') and ca.created_at=p.created_at
    and ((p.sale_id is not null and ca.sale_id=p.sale_id) or (p.repair_root_ticket_id is not null and ca.repair_root_ticket_id=p.repair_root_ticket_id))) as credit_new,
   exists(select 1 from public.credit_approvals ca where ca.status in ('Active','Settled') and ca.created_at<p.created_at
    and ((p.sale_id is not null and ca.sale_id=p.sale_id) or (p.repair_root_ticket_id is not null and ca.repair_root_ticket_id=p.repair_root_ticket_id))) as credit_later
  from public.payments p
  where p.created_by_auth_user_id=p_operator and p.created_at>=p_from and p.created_at<p_to
 )
 select
  round(coalesce(sum(amount) filter (where is_cash and not credit_new and not credit_later and is_sale),0),2),
  round(coalesce(sum(amount) filter (where is_cash and not credit_new and not credit_later and not is_sale),0),2),
  round(coalesce(sum(amount) filter (where is_cash and credit_new),0),2),
  round(coalesce(sum(amount) filter (where is_cash and not credit_new and credit_later),0),2),
  round(coalesce(sum(amount) filter (where not is_cash and credit_new),0),2),
  round(coalesce(sum(amount) filter (where not is_cash and not credit_new and credit_later),0),2)
 into v_cash_sales,v_cash_repair,v_cash_credit_new,v_cash_credit_repaid,v_online_credit_new,v_online_credit_repaid
 from pay;

 select coalesce(jsonb_agg(jsonb_build_object('method',c.method,'amount',coalesce(x.amount,0)) order by c.sort,c.method),'[]'::jsonb),
        coalesce(sum(coalesce(x.amount,0)),0)
 into v_channels,v_online_total
 from (
  select m.method,0 as sort from unnest(array['Raast','JazzCash','EasyPaisa','Bank Transfer']) as m(method)
  union
  select btrim(p.method),1 from public.payments p
   where p.created_by_auth_user_id=p_operator and p.created_at>=p_from and p.created_at<p_to
    and lower(btrim(p.method))<>'cash' and btrim(p.method) not in ('Raast','JazzCash','EasyPaisa','Bank Transfer')
 ) c
 left join (
  select btrim(p.method) as method,round(sum(p.amount),2) as amount from public.payments p
  where p.created_by_auth_user_id=p_operator and p.created_at>=p_from and p.created_at<p_to and lower(btrim(p.method))<>'cash'
  group by btrim(p.method)
 ) x on x.method=c.method;

 select round(coalesce(sum(ca.approved_amount),0),2) into v_credit_given from public.credit_approvals ca
 where ca.approved_by_auth_user_id=p_operator and ca.created_at>=p_from and ca.created_at<p_to and ca.status<>'Revoked';

 select count(*)::integer,
        round(coalesce(sum((select sum(rl.refund_amount) from public.return_lines rl where rl.return_id=r.id)),0),2)
 into v_return_count,v_return_total from public.returns r
 where r.created_by_auth_user_id=p_operator and r.created_at>=p_from and r.created_at<p_to;

 -- Every refund counts here (returns and repair refunds), because each one is cash that left the drawer when paid in cash.
 select round(coalesce(sum(r.amount) filter (where lower(btrim(r.method))='cash'),0),2),
        round(coalesce(sum(r.amount) filter (where lower(btrim(r.method))<>'cash'),0),2)
 into v_refund_cash,v_refund_online from public.refunds r
 where r.created_by_auth_user_id=p_operator and r.created_at>=p_from and r.created_at<p_to;

 select round(coalesce(sum(s.total_bill),0),2),round(coalesce(sum(s.discount),0),2) into v_retail,v_discounts from public.sales s
 where s.created_by_auth_user_id=p_operator and s.created_at>=p_from and s.created_at<p_to;
 select coalesce(sum(sl.quantity),0)::integer into v_items from public.sale_lines sl join public.sales s on s.id=sl.sale_id
 where s.created_by_auth_user_id=p_operator and s.created_at>=p_from and s.created_at<p_to;
 select round(coalesce(sum(coalesce(t.final_total,t.estimated_quote,0)),0),2),
        (count(*) filter (where t.parent_ticket_id is null))::integer
 into v_repair,v_created from public.tickets t
 where t.created_by_auth_user_id=p_operator and t.created_at>=p_from and t.created_at<p_to;
 select count(*)::integer into v_handed from public.tickets t
 where t.delivered_by_auth_user_id=p_operator and t.delivered_at>=p_from and t.delivered_at<p_to;
 select count(*)::integer into v_open_now from public.tickets t
 where t.parent_ticket_id is null and t.status not in ('Delivered','Cancelled');

 v_cash_total:=v_cash_sales+v_cash_repair+v_cash_credit_new+v_cash_credit_repaid;
 v_expected:=round(coalesce(p_opening,0)+v_cash_total-v_refund_cash,2);
 return jsonb_build_object(
  'openingCash',round(coalesce(p_opening,0),2),
  'invoiced',jsonb_build_object('retail',v_retail,'repair',v_repair,'total',round(v_retail+v_repair,2)),
  'cash',jsonb_build_object('sales',v_cash_sales,'repair',v_cash_repair,'udharAtCreation',v_cash_credit_new,'udharRepaid',v_cash_credit_repaid,'total',v_cash_total),
  'online',jsonb_build_object('channels',v_channels,'total',v_online_total),
  'udhar',jsonb_build_object('given',v_credit_given,'paidAtCreationCash',v_cash_credit_new,'paidAtCreationOnline',v_online_credit_new,
   'repaidCash',v_cash_credit_repaid,'repaidOnline',v_online_credit_repaid),
  'returns',jsonb_build_object('count',v_return_count,'total',v_return_total,'cash',v_refund_cash,'online',v_refund_online),
  'tickets',jsonb_build_object('created',v_created,'handedBack',v_handed,'openNow',v_open_now),
  'itemsSold',v_items,'discounts',v_discounts,'expectedCash',v_expected);
end$$;
revoke all on function app_private.register_shift_summary(uuid,timestamptz,timestamptz,numeric) from public,anon,authenticated;

-- ── RPCs. All run as the caller's identity (auth.uid()); writes happen only here. ──
create function public.open_register_shift(p_request_id uuid,p_opening_cash numeric) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor public.app_users%rowtype; v_shift public.register_shifts%rowtype; v_opening numeric(14,2);
begin
 perform public.support_request_guard();
 select * into v_actor from public.app_users where auth_user_id=auth.uid() and status='Active';
 if v_actor.auth_user_id is null or v_actor.role not in ('Business Owner','Cashier')
  or not app_private.current_client_access_allowed() then
  raise exception 'Register operations are not authorized' using errcode='42501';
 end if;
 if p_request_id is null or p_opening_cash is null or p_opening_cash<0 or p_opening_cash>999999999.99 then
  raise exception 'Enter a valid opening cash amount' using errcode='22023';
 end if;
 v_opening:=round(p_opening_cash,2);
 perform pg_advisory_xact_lock(hashtextextended('register-shift:'||v_actor.auth_user_id::text,0));
 select * into v_shift from public.register_shifts where open_request_id=p_request_id;
 if v_shift.id is not null then
  if v_shift.operator_auth_user_id<>v_actor.auth_user_id then
   raise exception 'Request identity conflicts with its original owner' using errcode='22023';
  end if;
  return jsonb_build_object('shift',app_private.register_shift_json(v_shift),'idempotentReplay',true,'alreadyOpen',v_shift.ended_at is null);
 end if;
 -- Already open on another device: converge on it instead of failing.
 select * into v_shift from public.register_shifts where operator_auth_user_id=v_actor.auth_user_id and ended_at is null;
 if v_shift.id is not null then
  return jsonb_build_object('shift',app_private.register_shift_json(v_shift),'idempotentReplay',false,'alreadyOpen',true);
 end if;
 insert into public.register_shifts(operator_auth_user_id,operator_name,operator_role,opening_cash,open_request_id)
 values(v_actor.auth_user_id,
  coalesce(nullif(btrim(v_actor.display_name),''),(select e.name from public.employees e where e.id=v_actor.employee_id),'Operator'),
  v_actor.role,v_opening,p_request_id)
 returning * into v_shift;
 return jsonb_build_object('shift',app_private.register_shift_json(v_shift),'idempotentReplay',false,'alreadyOpen',false);
end$$;

create function public.get_my_open_register_shift() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor public.app_users%rowtype; v_shift public.register_shifts%rowtype;
begin
 perform public.support_request_guard();
 select * into v_actor from public.app_users where auth_user_id=auth.uid() and status='Active';
 if v_actor.auth_user_id is null or v_actor.role not in ('Business Owner','Cashier')
  or not app_private.current_client_access_allowed() then
  raise exception 'Register operations are not authorized' using errcode='42501';
 end if;
 select * into v_shift from public.register_shifts where operator_auth_user_id=v_actor.auth_user_id and ended_at is null;
 if v_shift.id is null then return jsonb_build_object('shift',null); end if;
 return jsonb_build_object('shift',app_private.register_shift_json(v_shift));
end$$;

create function public.get_register_shift_summary(p_shift_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor public.app_users%rowtype; v_shift public.register_shifts%rowtype;
begin
 perform public.support_request_guard();
 select * into v_actor from public.app_users where auth_user_id=auth.uid() and status='Active';
 if v_actor.auth_user_id is null or v_actor.role not in ('Business Owner','Manager','Cashier','Orbito Support')
  or not app_private.current_client_access_allowed() then
  raise exception 'Register reports are not authorized' using errcode='42501';
 end if;
 select * into v_shift from public.register_shifts where id=p_shift_id;
 if v_shift.id is null or (v_actor.role='Cashier' and v_shift.operator_auth_user_id<>v_actor.auth_user_id) then
  raise exception 'Register shift unavailable' using errcode='22023';
 end if;
 if v_shift.ended_at is not null then
  return jsonb_build_object('shift',app_private.register_shift_json(v_shift),'summary',v_shift.summary,'live',false);
 end if;
 return jsonb_build_object('shift',app_private.register_shift_json(v_shift),'live',true,
  'summary',app_private.register_shift_summary(v_shift.operator_auth_user_id,v_shift.started_at,clock_timestamp(),v_shift.opening_cash));
end$$;

create function public.close_register_shift(p_request_id uuid,p_shift_id uuid,p_counted_cash numeric,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor public.app_users%rowtype; v_shift public.register_shifts%rowtype;
 v_closed_at timestamptz; v_summary jsonb; v_expected numeric(14,2); v_counted numeric(14,2); v_diff numeric(14,2);
 v_note text; v_approval text; v_claimed uuid;
begin
 perform public.support_request_guard();
 select * into v_actor from public.app_users where auth_user_id=auth.uid() and status='Active';
 if v_actor.auth_user_id is null or v_actor.role not in ('Business Owner','Cashier')
  or not app_private.current_client_access_allowed() then
  raise exception 'Register operations are not authorized' using errcode='42501';
 end if;
 if p_request_id is null or p_shift_id is null or p_counted_cash is null or p_counted_cash<0 or p_counted_cash>999999999.99 then
  raise exception 'Enter the cash counted in the register' using errcode='22023';
 end if;
 v_note:=btrim(coalesce(p_note,''));
 if char_length(v_note)>500 then raise exception 'The note is too long' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('register-shift:'||v_actor.auth_user_id::text,0));
 select * into v_shift from public.register_shifts where id=p_shift_id for update;
 if v_shift.id is null or v_shift.operator_auth_user_id<>v_actor.auth_user_id then
  raise exception 'Register shift unavailable' using errcode='22023';
 end if;
 if v_shift.ended_at is not null then
  if v_shift.close_request_id=p_request_id then
   return jsonb_build_object('shift',app_private.register_shift_json(v_shift),'idempotentReplay',true);
  end if;
  raise exception 'This register is already closed' using errcode='22023';
 end if;
 v_closed_at:=clock_timestamp();
 v_summary:=app_private.register_shift_summary(v_shift.operator_auth_user_id,v_shift.started_at,v_closed_at,v_shift.opening_cash);
 v_expected:=(v_summary->>'expectedCash')::numeric;
 v_counted:=round(p_counted_cash,2);
 v_diff:=round(v_counted-v_expected,2);
 v_approval:=null; v_claimed:=null;
 if v_diff<0 and v_actor.role='Cashier' then
  -- A cashier closing short needs a written reason and a fresh override-PIN approval bound to this exact close.
  if char_length(v_note) not between 3 and 500 then
   raise exception 'A reason is required when the cash is short' using errcode='22023';
  end if;
  v_claimed:=app_private.claim_step_up('shift-close',p_request_id,'shift-close',jsonb_build_array(p_shift_id,v_counted));
  if v_claimed is null then
   raise exception 'A fresh PIN approval is required to close a register that is short' using errcode='42501';
  end if;
  v_approval:='override-pin';
 elsif v_diff<0 then
  v_approval:='owner-adjustment';   -- the owner counting less is the owner's own money
 end if;
 update public.register_shifts set ended_at=v_closed_at,close_reason='operator',closed_by_auth_user_id=v_actor.auth_user_id,
  close_request_id=p_request_id,counted_cash=v_counted,expected_cash=v_expected,difference=v_diff,note=v_note,
  approval=v_approval,step_up_authorization_id=v_claimed,summary=v_summary
 where id=v_shift.id returning * into v_shift;
 return jsonb_build_object('shift',app_private.register_shift_json(v_shift),'idempotentReplay',false);
end$$;

create function public.force_close_register_shift(p_request_id uuid,p_shift_id uuid,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor public.app_users%rowtype; v_shift public.register_shifts%rowtype;
 v_closed_at timestamptz; v_summary jsonb; v_note text;
begin
 perform public.support_request_guard();
 select * into v_actor from public.app_users where auth_user_id=auth.uid() and status='Active';
 if v_actor.auth_user_id is null or v_actor.role not in ('Business Owner','Manager')
  or not app_private.current_client_access_allowed() then
  raise exception 'Closing a register for someone else is not authorized' using errcode='42501';
 end if;
 if p_request_id is null or p_shift_id is null then
  raise exception 'Choose the register to close' using errcode='22023';
 end if;
 v_note:=btrim(coalesce(p_note,''));
 if char_length(v_note)>500 then raise exception 'The note is too long' using errcode='22023'; end if;
 select * into v_shift from public.register_shifts where id=p_shift_id;
 if v_shift.id is null then raise exception 'Register shift unavailable' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('register-shift:'||v_shift.operator_auth_user_id::text,0));
 select * into v_shift from public.register_shifts where id=p_shift_id for update;
 if v_actor.role='Manager' and v_shift.operator_role='Business Owner' then
  raise exception 'Only the Business Owner can close the owner''s register' using errcode='42501';
 end if;
 if v_shift.ended_at is not null then
  if v_shift.close_request_id=p_request_id then
   return jsonb_build_object('shift',app_private.register_shift_json(v_shift),'idempotentReplay',true);
  end if;
  raise exception 'This register is already closed' using errcode='22023';
 end if;
 v_closed_at:=clock_timestamp();
 v_summary:=app_private.register_shift_summary(v_shift.operator_auth_user_id,v_shift.started_at,v_closed_at,v_shift.opening_cash);
 update public.register_shifts set ended_at=v_closed_at,close_reason='manager_forced',closed_by_auth_user_id=v_actor.auth_user_id,
  close_request_id=p_request_id,counted_cash=null,difference=null,approval=null,step_up_authorization_id=null,
  expected_cash=(v_summary->>'expectedCash')::numeric,summary=v_summary,
  note=coalesce(nullif(v_note,''),'Closed by management without a cash count.')
 where id=v_shift.id returning * into v_shift;
 return jsonb_build_object('shift',app_private.register_shift_json(v_shift),'idempotentReplay',false);
end$$;

-- Bounded, keyset-paged history. Owner, Manager and Support read everyone; a Cashier reads only their own.
create function public.list_register_shifts(p_operator uuid default null,p_limit integer default 25,
 p_before_started_at timestamptz default null,p_before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor public.app_users%rowtype; v_limit integer; v_rows jsonb; v_next jsonb:=null;
begin
 perform public.support_request_guard();
 select * into v_actor from public.app_users where auth_user_id=auth.uid() and status='Active';
 if v_actor.auth_user_id is null or v_actor.role not in ('Business Owner','Manager','Cashier','Orbito Support')
  or not app_private.current_client_access_allowed() then
  raise exception 'Register history is not authorized' using errcode='42501';
 end if;
 if (p_before_started_at is null)<>(p_before_id is null) then
  raise exception 'The page position is incomplete' using errcode='22023';
 end if;
 if v_actor.role='Cashier' and p_operator is not null and p_operator<>v_actor.auth_user_id then
  raise exception 'Register history is not authorized' using errcode='42501';
 end if;
 v_limit:=least(greatest(coalesce(p_limit,25),1),100);
 select coalesce(jsonb_agg(app_private.register_shift_json(t) order by t.started_at desc,t.id desc),'[]'::jsonb) into v_rows
 from public.register_shifts t where t.id in (
  select s.id from public.register_shifts s
  where (v_actor.role<>'Cashier' or s.operator_auth_user_id=v_actor.auth_user_id)
   and (p_operator is null or s.operator_auth_user_id=p_operator)
   and (p_before_started_at is null or (s.started_at,s.id)<(p_before_started_at,p_before_id))
  order by s.started_at desc,s.id desc limit v_limit+1);
 if jsonb_array_length(v_rows)>v_limit then
  v_rows:=v_rows-v_limit;
  v_next:=jsonb_build_object('startedAt',v_rows->(v_limit-1)->>'startedAt','id',v_rows->(v_limit-1)->>'id');
 end if;
 return jsonb_build_object('items',v_rows,'nextCursor',v_next);
end$$;

revoke all on function public.open_register_shift(uuid,numeric) from public,anon;
revoke all on function public.get_my_open_register_shift() from public,anon;
revoke all on function public.get_register_shift_summary(uuid) from public,anon;
revoke all on function public.close_register_shift(uuid,uuid,numeric,text) from public,anon;
revoke all on function public.force_close_register_shift(uuid,uuid,text) from public,anon;
revoke all on function public.list_register_shifts(uuid,integer,timestamptz,uuid) from public,anon;
grant execute on function public.open_register_shift(uuid,numeric) to authenticated,service_role;
grant execute on function public.get_my_open_register_shift() to authenticated,service_role;
grant execute on function public.get_register_shift_summary(uuid) to authenticated,service_role;
grant execute on function public.close_register_shift(uuid,uuid,numeric,text) to authenticated,service_role;
grant execute on function public.force_close_register_shift(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.list_register_shifts(uuid,integer,timestamptz,uuid) to authenticated,service_role;

-- ── New PIN purpose: 'shift-close' (cashier closing short). Same mechanism as 'inventory'. ──
alter table public.step_up_authorizations drop constraint step_up_authorizations_purpose_check;
alter table public.step_up_authorizations add constraint step_up_authorizations_purpose_check
 check(purpose in ('admin','settle','return','discount','udhar','remove-component','repair-refund','inventory','shift-close'));

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
    ('admin','settle','return','discount','udhar','remove-component','repair-refund','inventory','shift-close')
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

create or replace function public.get_app_config() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.support_request_guard();
  if not app_private.current_client_access_allowed() then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select jsonb_build_object(
    'shop_email',sc.shop_email,'onboarding_version',sc.onboarding_version,'onboarding_completed_at',sc.onboarding_completed_at,
    'paper_resupply_enabled',coalesce((select (payload->>'paper_resupply_enabled')::boolean from app_private.billing_projection where singleton),sc.paper_resupply_enabled),
    'shop_name',sc.shop_name,'shop_address',sc.shop_address,'shop_phone',sc.shop_phone,'shop_logo',sc.shop_logo,'shop_description',sc.shop_description,
    'primary_color',sc.primary_color,'secondary_color',sc.secondary_color,'currency',sc.currency,'tax_rate',sc.tax_rate,
    'strict_login_mode',sc.strict_login_mode,'discount_pin_required',sc.discount_pin_required,'partial_udhar_allowed',sc.partial_udhar_allowed,'terms_text',sc.terms_text,
    'repair_module_enabled',sc.repair_module_enabled,'inventory_module_enabled',sc.inventory_module_enabled,'technician_module_enabled',sc.technician_module_enabled,
    'live_tracking_enabled',sc.live_tracking_enabled,'ems_enabled',sc.ems_enabled,'ems_track_breaks',sc.ems_track_breaks,
    'invoice_prefix',sc.invoice_prefix,'ticket_prefix',sc.ticket_prefix,'suspended',coalesce(sc.suspended,false),
    'read_contracts',jsonb_build_object('repair_families',1,'receipt_archive',1,'catalog_icons',1,'icon_preferences',1,'inventory_retirement',1,'register_shifts',1),
    'icon_preferences',coalesce((select jsonb_agg(to_jsonb(p) order by p.icon_id) from public.icon_preferences p),'[]'::jsonb)
  ) into result from public.shop_config sc where sc.id=1;
  return result;
end $$;

create or replace function public.shop_backend_capabilities() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sc public.shop_config;bc app_private.bridge_config;caps jsonb;
begin
  select * into strict sc from public.shop_config where id=1;select * into strict bc from app_private.bridge_config where singleton;
  caps:=jsonb_build_object(
    'inventory-retirement',
      (select count(*)=4 from information_schema.columns where table_schema='public' and table_name='inventory' and column_name in ('retired_at','retired_by','retirement_reason','retirement_request_id'))
      and coalesce((select relrowsecurity from pg_class where oid=to_regclass('app_private.inventory_change_requests')),false)
      and not has_table_privilege('authenticated','app_private.inventory_change_requests','SELECT')
      and exists(select 1 from pg_trigger where tgrelid='public.inventory'::regclass and tgname='inventory_protect_retirement' and tgenabled<>'D')
      and exists(select 1 from pg_trigger where tgrelid=to_regclass('app_private.inventory_change_requests') and tgname='inventory_change_requests_immutable' and tgenabled<>'D')
      and to_regprocedure('public.change_inventory_stock(uuid,integer,text,integer,integer,text)') is not null
      and has_function_privilege('authenticated','public.change_inventory_stock(uuid,integer,text,integer,integer,text)','EXECUTE')
      and not has_table_privilege('authenticated','public.inventory','DELETE')
      and not has_function_privilege('authenticated','public.verify_override_pin_guarded(uuid,text,text)','EXECUTE')
      and has_function_privilege('service_role','public.verify_override_pin_guarded(uuid,text,text)','EXECUTE')
      and not has_function_privilege('anon','public.change_inventory_stock(uuid,integer,text,integer,integer,text)','EXECUTE')
      and not has_function_privilege('authenticated','app_private.apply_inventory_change(uuid,integer,text,integer,integer,text,text)','EXECUTE')
      and exists(select 1 from pg_constraint where conrelid='public.inventory'::regclass and conname='inventory_retirement_shape'),
    'icon-label-preferences',
      coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.icon_preferences')),false)
      and (select count(*)=4 from pg_policy where polrelid=to_regclass('public.icon_preferences') and polname in ('icon_preferences_read','icon_preferences_insert','icon_preferences_update','support_consent_guard'))
      and exists(select 1 from pg_policy where polrelid=to_regclass('public.icon_preferences') and polname='support_consent_guard' and not polpermissive)
      and has_table_privilege('authenticated','public.icon_preferences','SELECT')
      and has_table_privilege('authenticated','public.icon_preferences','INSERT')
      and has_table_privilege('authenticated','public.icon_preferences','UPDATE')
      and not has_table_privilege('anon','public.icon_preferences','SELECT')
      and not has_table_privilege('authenticated','public.icon_preferences','DELETE')
      and exists(select 1 from pg_constraint where conrelid=to_regclass('public.icon_preferences') and conname='icon_preferences_contexts'),
    'catalog-icons-and-brands',
      (select count(*)=3 from information_schema.columns where table_schema='public' and table_name in ('quick_items','repair_components','inventory') and column_name='icon_id' and data_type='text')
      and coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.device_brands')),false)
      and (select count(*)=4 from pg_policy where polrelid=to_regclass('public.device_brands') and polname in ('device_brands_read','device_brands_insert','device_brands_update','support_consent_guard'))
      and exists(select 1 from pg_policy where polrelid=to_regclass('public.device_brands') and polname='support_consent_guard' and not polpermissive)
      and has_table_privilege('authenticated','public.device_brands','SELECT')
      and has_table_privilege('authenticated','public.device_brands','INSERT')
      and has_table_privilege('authenticated','public.device_brands','UPDATE')
      and to_regclass('public.tickets_open_queue_idx') is not null
      and not has_table_privilege('anon','public.device_brands','SELECT')
      and not has_table_privilege('authenticated','public.device_brands','DELETE')
      and exists(select 1 from pg_constraint where conrelid=to_regclass('public.device_brands') and conname='device_brands_normalized_unique'),
    'register-shifts',
      coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.register_shifts')),false)
      and exists(select 1 from pg_policy where polrelid=to_regclass('public.register_shifts') and polname='register_shifts_read')
      and exists(select 1 from pg_policy where polrelid=to_regclass('public.register_shifts') and polname='support_consent_guard' and not polpermissive)
      and has_table_privilege('authenticated','public.register_shifts','SELECT')
      and not has_table_privilege('authenticated','public.register_shifts','INSERT')
      and not has_table_privilege('authenticated','public.register_shifts','UPDATE')
      and not has_table_privilege('authenticated','public.register_shifts','DELETE')
      and not has_table_privilege('anon','public.register_shifts','SELECT')
      and exists(select 1 from pg_trigger where tgrelid='public.register_shifts'::regclass and tgname='register_shifts_protect' and tgenabled<>'D')
      and exists(select 1 from pg_constraint where conrelid='public.register_shifts'::regclass and conname='register_shifts_close_shape')
      and exists(select 1 from pg_indexes where schemaname='public' and tablename='register_shifts' and indexname='register_shifts_one_open_per_operator')
      and to_regprocedure('public.open_register_shift(uuid,numeric)') is not null
      and to_regprocedure('public.get_my_open_register_shift()') is not null
      and to_regprocedure('public.get_register_shift_summary(uuid)') is not null
      and to_regprocedure('public.close_register_shift(uuid,uuid,numeric,text)') is not null
      and to_regprocedure('public.force_close_register_shift(uuid,uuid,text)') is not null
      and to_regprocedure('public.list_register_shifts(uuid,integer,timestamp with time zone,uuid)') is not null
      and has_function_privilege('authenticated','public.open_register_shift(uuid,numeric)','EXECUTE')
      and has_function_privilege('authenticated','public.close_register_shift(uuid,uuid,numeric,text)','EXECUTE')
      and has_function_privilege('authenticated','public.force_close_register_shift(uuid,uuid,text)','EXECUTE')
      and has_function_privilege('authenticated','public.list_register_shifts(uuid,integer,timestamp with time zone,uuid)','EXECUTE')
      and not has_function_privilege('anon','public.open_register_shift(uuid,numeric)','EXECUTE')
      and not has_function_privilege('anon','public.close_register_shift(uuid,uuid,numeric,text)','EXECUTE')
      and not has_function_privilege('authenticated','app_private.register_shift_summary(uuid,timestamp with time zone,timestamp with time zone,numeric)','EXECUTE')
      and exists(select 1 from pg_constraint where conrelid='public.step_up_authorizations'::regclass and conname='step_up_authorizations_purpose_check' and pg_get_constraintdef(oid) like '%shift-close%'),
    'usage-outbox',to_regclass('app_private.bridge_events') is not null and to_regclass('app_private.bridge_outbox') is not null and exists(select 1 from pg_trigger where tgrelid='app_private.bridge_events'::regclass and tgname='bridge_events_immutable' and tgenabled<>'D') and not has_function_privilege('authenticated','public.bridge_claim_outbox(integer)','EXECUTE'),
    'billing-projection',to_regprocedure('public.bridge_apply_billing(uuid,bigint,jsonb)') is not null and not has_function_privilege('authenticated','public.bridge_apply_billing(uuid,bigint,jsonb)','EXECUTE'),
    'config-journal',to_regclass('app_private.config_requests') is not null and to_regprocedure('public.bridge_onboarding(text,jsonb)') is not null,
    'support-identity',to_regprocedure('public.support_ticket_actor_context()') is not null and not has_function_privilege('anon','public.support_ticket_actor_context()','EXECUTE'),
    'support-consent',public.support_consent_capability(),
    'support-durable-submissions',to_regclass('app_private.support_submissions') is not null and not has_table_privilege('authenticated','app_private.support_submissions','SELECT') and not has_function_privilege('authenticated','public.support_delivery_finish(uuid,uuid,text,uuid,text)','EXECUTE'),
    'owner-bootstrap',to_regclass('app_private.owner_bootstrap') is not null,
    'private-rls',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relkind in ('r','p') and not c.relrowsecurity),
    'bounded-operational-reads',
      exists(select 1 from pg_proc where oid='public.get_repair_family_page(text,text,text,integer,integer)'::regprocedure and not prosecdef and provolatile='s' and proconfig=array['search_path=""'])
      and exists(select 1 from pg_proc where oid='public.get_receipt_archive_page(text,text,timestamp with time zone,timestamp with time zone,integer,integer)'::regprocedure and not prosecdef and provolatile='s' and proconfig=array['search_path=""'])
      and has_function_privilege('authenticated','public.get_repair_family_page(text,text,text,integer,integer)','EXECUTE')
      and has_function_privilege('authenticated','public.get_receipt_archive_page(text,text,timestamp with time zone,timestamp with time zone,integer,integer)','EXECUTE')
      and not has_function_privilege('anon','public.get_repair_family_page(text,text,text,integer,integer)','EXECUTE')
      and not has_function_privilege('anon','public.get_receipt_archive_page(text,text,timestamp with time zone,timestamp with time zone,integer,integer)','EXECUTE')
      and (select relrowsecurity from pg_class where oid='public.tickets'::regclass)
      and (select relrowsecurity from pg_class where oid='public.sales'::regclass)
      and (select count(*)=2 from pg_policy where polrelid in ('public.tickets'::regclass,'public.sales'::regclass)
        and polname='support_consent_guard' and not polpermissive and pg_get_expr(polqual,polrelid) like '%SELECT%')
  );
  return jsonb_build_object('contract','retrasell-backend-capabilities-v1','client_id',sc.platform_client_id,'source_id',bc.source_id,'client_binding',bc.client_binding,'observed_at',now(),'capabilities',caps,'runtime',public.bridge_runtime_preflight()->'checks','delivery',jsonb_build_object('usage_pending',(select count(*) from app_private.bridge_outbox where state in ('pending','leased')),'support_pending',(select count(*) from app_private.support_submissions where state<>'acknowledged')));
end $$;
