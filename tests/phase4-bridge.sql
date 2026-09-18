-- Disposable local PostgreSQL fixture only; all test data rolls back.
begin;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111');
insert into public.app_users(auth_user_id,email,display_name,role,status)
values('11111111-1111-4111-8111-111111111111','bridge@example.invalid','Fixture','Business Owner','Active');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);

do $$
declare source uuid; eid uuid; again uuid; payload jsonb; batch jsonb; req jsonb; r text;
begin
  select source_id into source from app_private.bridge_config;
  assert public.get_platform_billing()='{"available":false}'::jsonb,'Missing treated as available';
  assert (public.bridge_claim_outbox()->>'enabled')::boolean=false,'Delivery enabled by default';
  eid:=app_private.append_bridge_event('usage','fixture','22222222-2222-4222-8222-222222222222','{"metric":"BILL","quantity":1}',now());
  again:=app_private.append_bridge_event('usage','fixture','22222222-2222-4222-8222-222222222222','{"metric":"BILL","quantity":1}',now());
  assert eid=again,'Event duplicated';
  assert (select state='held_legacy' from app_private.bridge_outbox where event_id=eid),'Legacy usage eligible for double billing';
  begin
    perform app_private.append_bridge_event('usage','fixture','22222222-2222-4222-8222-222222222222','{"metric":"BILL","quantity":2}',now());
    raise exception 'Conflicting event accepted';
  exception when invalid_parameter_value then null; end;
  begin
    update app_private.bridge_events set body='{}' where event_id=eid;
    raise exception 'Payload mutation accepted';
  exception when object_not_in_prerequisite_state then null; end;
  payload:='{"schema_version":1,"currency":"PKR","platform_updated_at":"2026-09-18T00:00:00Z","paper_resupply_enabled":true,"usage":{"BILL":2,"INVENTORY":null},"invoices":[{"id":"i1","reference":"INV-1","period":"September","status":"paid","total":100,"paid":100,"outstanding":0}],"outstanding_total":0,"estimated_current_charges":10,"recent_billing":"Payment received","billed_through":160,"settled_through":160,"estimate_through":162,"pricing_version":"v1"}';
  assert public.bridge_apply_billing(source,18,payload)='applied','Projection failed';
  assert public.bridge_apply_billing(source,18,payload)='unchanged','Identical revision not idempotent';
  assert public.bridge_apply_billing(source,17,jsonb_set(payload,'{invoices,0,status}','"unpaid"'))='stale','Stale paid overwrite accepted';
  assert public.get_platform_billing()->'projection'->'invoices'->0->>'status'='paid','Paid state overwritten';
  begin
    perform public.bridge_apply_billing(source,18,jsonb_set(payload,'{outstanding_total}','99'));
    raise exception 'Revision conflict accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.bridge_apply_billing(source,19,payload||'{"thermal_mm":100}');
    raise exception 'Raw metering accepted into customer projection';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.bridge_apply_billing(gen_random_uuid(),19,payload);
    raise exception 'Foreign source accepted';
  exception when invalid_parameter_value then null; end;
  req:=public.request_paper_resupply('33333333-3333-4333-8333-333333333333');
  assert (req->>'accepted')::boolean,'Resupply rejected';
  assert (public.request_paper_resupply('33333333-3333-4333-8333-333333333333')->>'replayed')::boolean,'Retry not recognized';
  assert (public.request_paper_resupply('44444444-4444-4444-8444-444444444444')->>'already_active')::boolean,'Duplicate active request';
  assert (select count(*)=1 from app_private.paper_resupply_requests),'Duplicate requests persisted';
  -- Delivery failure updates ONLY the outbox, never the event.
  update app_private.bridge_config set client_binding='fixture-client',delivery_enabled=true;
  batch:=public.bridge_claim_outbox(50);
  assert jsonb_array_length(batch->'events')=1,'Legacy BILL leaked into batch';
  assert not public.bridge_finish_delivery((batch->'events'->0->>'event_id')::uuid,gen_random_uuid(),true),'Wrong lease acknowledged';
  assert public.bridge_finish_delivery((batch->'events'->0->>'event_id')::uuid,(batch->>'lease_id')::uuid,false),'Retry not queued';
  assert (select count(*)=2 from app_private.bridge_events),'Outage lost immutable event';
  update app_private.bridge_outbox set next_attempt_at=now()-interval '1 second' where state='pending';
  batch:=public.bridge_claim_outbox(50);
  assert public.bridge_finish_delivery((batch->'events'->0->>'event_id')::uuid,(batch->>'lease_id')::uuid,true),'ACK failed';
  assert (select count(*)=2 from app_private.bridge_events),'ACK deleted history';
  assert public.bridge_apply_resupply(source,'33333333-3333-4333-8333-333333333333',2,'fulfilled',now())='applied';
  assert public.bridge_apply_resupply(source,'33333333-3333-4333-8333-333333333333',1,'requested',now())='stale';
  begin
    perform public.bridge_apply_resupply(source,'33333333-3333-4333-8333-333333333333',3,'requested',now());
    raise exception 'Terminal lifecycle reopened';
  exception when invalid_parameter_value then null; end;
  payload:=jsonb_set(payload,'{paper_resupply_enabled}','false');
  assert public.bridge_apply_billing(source,19,payload)='applied';
  begin
    perform public.request_paper_resupply('55555555-5555-4555-8555-555555555555');
    raise exception 'Disabled resupply accepted';
  exception when insufficient_privilege then null; end;
  -- Projection revision never resets canonical usage.
  assert (select count(*)=2 from app_private.bridge_events),'Projection reset usage';
end $$;

set local role authenticated;
select public.get_platform_billing();
do $$ begin
  assert not has_table_privilege(current_user,'app_private.bridge_events','SELECT'),'Owner can read raw events';
  assert not has_function_privilege(current_user,'public.bridge_claim_outbox(integer)','EXECUTE'),'Client can deliver';
  assert not has_function_privilege(current_user,'public.bridge_apply_billing(uuid,bigint,jsonb)','EXECUTE'),'Client can set paid';
  assert not has_function_privilege(current_user,'app_private.append_bridge_event(text,text,uuid,jsonb,timestamptz)','EXECUTE'),'Client can fabricate BILL';
end $$;
reset role;

-- Canonical roles are checked in the RPC, including Support (not generic admin).
do $$ declare role_name text; employee integer;
begin
  insert into public.employees(name,email,role,status) values('Fixture','staff@example.invalid','Cashier','Active') returning id into employee;
  foreach role_name in array array['Manager','Cashier','Technician','Orbito Support'] loop
    update public.app_users set role=role_name,
      employee_id=case when role_name='Orbito Support' then null else employee end where auth_user_id=auth.uid();
    begin perform public.get_platform_billing(); raise exception 'Role % can read billing',role_name;
    exception when insufficient_privilege then null; end;
    begin perform public.request_paper_resupply(gen_random_uuid()); raise exception 'Role % can resupply',role_name;
    exception when insufficient_privilege then null; end;
  end loop;
  update public.app_users set role='Business Owner',employee_id=null,status='Inactive' where auth_user_id=auth.uid();
  begin perform public.get_platform_billing(); raise exception 'Inactive Owner can read';
  exception when insufficient_privilege then null; end;
  update public.app_users set status='Active' where auth_user_id=auth.uid();
  update public.shop_config set suspended=true where id=1;
  begin perform public.get_platform_billing(); raise exception 'Suspended Owner can read';
  exception when insufficient_privilege then null; end;
  assert not has_function_privilege('anon','public.get_platform_billing()','EXECUTE'),'Anonymous access';
end $$;
rollback;
select 'PASS Phase 4 bridge/projection/resupply/role fixture' as result;
