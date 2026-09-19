-- Local disposable fixture only. Validate capture around unchanged financial cores.
begin;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111');
insert into public.app_users(auth_user_id,email,display_name,role,status)
values('11111111-1111-4111-8111-111111111111','usage@example.invalid','Fixture','Business Owner','Active');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
update public.shop_config set repair_module_enabled=true,inventory_module_enabled=true where id=1;
select public.set_override_pin('1234');
do $$ declare r jsonb; second jsonb; root_id bigint; approval uuid;
begin
  r:=public.create_retail_sale('22222222-2222-4222-8222-222222222222',
    '[{"itemKind":"other","name":"Fixture","quantity":1,"originalPrice":100,"unitPrice":100}]',
    '[{"amount":100,"method":"Cash","cashTendered":100}]');
  assert r->>'usageDelivery'='legacy','Default usage route changed';
  assert (select count(*)=1 from app_private.bridge_events),'Retail not captured';
  second:=public.create_retail_sale('22222222-2222-4222-8222-222222222222',
    '[{"itemKind":"other","name":"Fixture","quantity":1,"originalPrice":100,"unitPrice":100}]',
    '[{"amount":100,"method":"Cash","cashTendered":100}]');
  assert second->>'usageEventId'=r->>'usageEventId','Replay usage changed';
  assert (select count(*)=1 from app_private.bridge_events),'Replay rebilled';
  -- Switch only FUTURE ownership; never release historical legacy records.
  update app_private.bridge_config set usage_mode='bridge';
  r:=public.create_repair_ticket('33333333-3333-4333-8333-333333333333',
    '{"customerName":"Fixture","customerPhone":"03000000000","deviceBrand":"Fixture","deviceModel":"Test","quotedAmount":100,"labourCost":100,"components":[]}');
  root_id:=(r->'ticket'->>'id')::bigint;
  assert root_id is not null,'Repair fixture creation failed';
  assert r->>'usageDelivery'='bridge','New operation route not bridge';
  assert (select count(*)=2 from app_private.bridge_events),'Root not captured';
  r:=public.record_repair_payment('44444444-4444-4444-8444-444444444444',root_id,'[{"amount":10,"method":"Cash","cashTendered":10}]');
  assert (select count(*)=2 from app_private.bridge_events),'Direct collection incorrectly creates BILL';
  assert r->>'usageDelivery'='none','Payment returned billable route';
  perform public.record_repair_payment('44444444-4444-4444-8444-444444444444',root_id,'[{"amount":10,"method":"Cash","cashTendered":10}]');
  assert (select count(*)=2 from app_private.bridge_events),'Collection replay created BILL';
  perform public.create_inventory_item('55555555-5555-4555-8555-555555555555','Fixture','','General',10,5,1,0);
  assert (select count(*)=3 from app_private.bridge_events),'Inventory not captured';
  assert (select body->>'metric'='INVENTORY' from app_private.bridge_events where operation='create_inventory_item');
  r:=public.approve_additional_work('88888888-8888-4888-8888-888888888888',root_id,
    'Fixture work','{"components":[],"labourCost":5}',5);
  assert (select count(*)=4 from app_private.bridge_events),'Child invoice not captured';
  assert r->>'usageDelivery'='bridge','Child missing bridge route';
  second:=public.approve_additional_work('88888888-8888-4888-8888-888888888888',root_id,
    'Fixture work','{"components":[],"labourCost":5}',5);
  assert second->>'usageEventId'=r->>'usageEventId','Child retry event changed';
  assert (select count(*)=4 from app_private.bridge_events),'Child retry rebilled';
  -- Stage an existing authorized repair credit account in this test only.
  perform public.verify_override_pin_guarded(auth.uid(),'1234','udhar');
  approval:=app_private.claim_step_up('udhar','66666666-6666-4666-8666-666666666666','fixture','{}');
  insert into public.credit_approvals(request_id,repair_root_ticket_id,approved_amount,approved_by_auth_user_id,step_up_authorization_id,status)
    values('66666666-6666-4666-8666-666666666666',root_id,90,auth.uid(),approval,'Active');
  perform public.verify_override_pin_guarded(auth.uid(),'1234','settle');
  perform public.settle_udhar('77777777-7777-4777-8777-777777777777','repair',root_id,20,'Cash',20);
  assert (select count(*)=4 from app_private.bridge_events),'Udhar settlement incorrectly creates BILL';
  assert (select sum(amount)=30 from public.payments where repair_root_ticket_id=root_id),'Financial payment regression';
  assert (select count(*)=1 from app_private.bridge_outbox where state='held_legacy'),'Cutover released legacy history';
  assert (select count(*)=3 from app_private.bridge_outbox where state='pending'),'Bridge operation missing durable outbox';
  assert not (public.bridge_claim_outbox()->>'enabled')::boolean,'Operations required live Platform';
  assert not has_function_privilege('authenticated','app_private.record_repair_payment(uuid,bigint,jsonb)','EXECUTE'),'Browser can bypass capture';
end $$;
rollback;
select 'PASS atomic usage/cutover/repair settlement fixture' as result;
