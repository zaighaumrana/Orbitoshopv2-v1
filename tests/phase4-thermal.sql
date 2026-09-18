begin;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111');
insert into public.app_users(auth_user_id,email,display_name,role,status)
values('11111111-1111-4111-8111-111111111111','thermal@example.invalid','Fixture','Business Owner','Active');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ declare sale jsonb; intent jsonb; r jsonb; r2 jsonb; actor uuid:=auth.uid();
begin
  sale:=public.create_retail_sale('22222222-2222-4222-8222-222222222222',
    '[{"itemKind":"other","name":"Fixture","quantity":1,"originalPrice":100,"unitPrice":100}]',
    '[{"amount":100,"method":"Cash","cashTendered":100}]');
  intent:=jsonb_build_object('document_type','retail_receipt','document_reference',sale->>'invoiceNumber',
    'is_reprint',false,'occurred_at',now(),'copies',1,'estimated_mm',260,'paper_width_mm',80,
    'measurement_status','estimated','template_version','thermal-80-v1','measurement_version','css-height-v1','calibration_version','feed-6mm-v1');
  r:=public.record_thermal_intent('33333333-3333-4333-8333-333333333333',actor,intent);
  assert (r->>'accepted')::boolean;
  r2:=public.record_thermal_intent('33333333-3333-4333-8333-333333333333',actor,intent);
  assert r=r2,'Retry duplicated print intent';
  begin
    perform public.record_thermal_intent('33333333-3333-4333-8333-333333333333',actor,intent||'{"copies":2}');
    raise exception 'Conflicting print identity accepted';
  exception when invalid_parameter_value then null; end;
  perform public.record_thermal_intent('44444444-4444-4444-8444-444444444444',actor,intent);
  assert (select (body->>'is_reprint')::boolean and body->>'original_event_id'=r->>'event_id'
    from app_private.bridge_events where operation_id='44444444-4444-4444-8444-444444444444'),'Reprint not linked';
  intent:=intent||'{"measurement_status":"unavailable","estimated_mm":null}';
  perform public.record_thermal_intent('55555555-5555-4555-8555-555555555555',actor,intent);
  assert (select body->'estimated_mm'='null'::jsonb from app_private.bridge_events where operation_id='55555555-5555-4555-8555-555555555555');
  begin
    perform public.record_thermal_intent(gen_random_uuid(),actor,intent||'{"estimated_mm":0}');
    raise exception 'Unavailable recorded as zero';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.record_thermal_intent(gen_random_uuid(),gen_random_uuid(),intent);
    raise exception 'Cross-session queue accepted';
  exception when insufficient_privilege then null; end;
  assert (select count(*)=1 from app_private.bridge_events where kind='usage'),'Printing billed additional BILL';
  assert (select count(*)=3 from app_private.bridge_events where kind='thermal'),'Print attempts lost/duplicated';
  assert not exists(select 1 from app_private.billing_projection),'Metering depended on resupply flag/projection';
end $$;
rollback;
select 'PASS thermal intent/retry/reprint/unavailable/independence fixture' as result;
