-- Run only after migrations in the disposable local PostgreSQL fixture.
begin;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111');
insert into public.app_users(auth_user_id,email,display_name,role,status)
values('11111111-1111-4111-8111-111111111111','fixture@example.invalid','Fixture','Business Owner','Active');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.set_override_pin('1234');
do $$
declare actor uuid:='11111111-1111-4111-8111-111111111111'; r jsonb; approval uuid; retried uuid;
begin
  for i in 1..5 loop
    r:=public.verify_override_pin_guarded(actor,'9999','return');
    assert r='{"ok":false}'::jsonb,'Wrong PIN accepted';
  end loop;
  assert (select failures=5 and locked_until>now() from app_private.pin_attempts where auth_user_id=actor),'Cooldown not persisted';
  assert public.verify_override_pin_guarded(actor,'1234','return')='{"ok":false}'::jsonb,'Correct PIN bypassed cooldown';
  -- Failed attempts survive lock expiry and escalate; refreshing cannot change
  -- this actor-keyed database record.
  for i in 6..10 loop
    update app_private.pin_attempts set locked_until=clock_timestamp()-interval '1 second' where auth_user_id=actor;
    assert public.verify_override_pin_guarded(actor,'9999','return')='{"ok":false}'::jsonb;
    if i=8 then
      assert (select locked_until>clock_timestamp()+interval '4 minutes' from app_private.pin_attempts where auth_user_id=actor),'Missing 5-minute tier';
    end if;
    if i=10 then
      assert (select locked_until>clock_timestamp()+interval '29 minutes' from app_private.pin_attempts where auth_user_id=actor),'Missing 30-minute tier';
    end if;
  end loop;
  -- Time travel only in test setup; the browser cannot access this table.
  update app_private.pin_attempts set locked_until=now()-interval '1 second' where auth_user_id=actor;
  r:=public.verify_override_pin_guarded(actor,'1234','return');
  assert (r->>'ok')::boolean,'Correct PIN rejected after cooldown';
  assert (select failures=0 and locked_until is null from app_private.pin_attempts where auth_user_id=actor),'Success did not reset';
  approval:=app_private.claim_step_up('return','22222222-2222-4222-8222-222222222222','fixture','{"amount":1}');
  assert approval is not null,'No claim';
  assert app_private.claim_step_up('return','33333333-3333-4333-8333-333333333333','fixture','{"amount":1}') is null,'Reused for separate request';
  retried:=app_private.claim_step_up('return','22222222-2222-4222-8222-222222222222','fixture','{"amount":1}');
  assert retried=approval,'Same request did not reuse claim';
  -- Test-only expiry mutation keeps the historical constraint valid.
  update public.step_up_authorizations set created_at=now()-interval '3 minutes',expires_at=now()-interval '2 minutes' where id=approval;
  assert app_private.claim_step_up('return','22222222-2222-4222-8222-222222222222','fixture','{"amount":1}')=approval,'Expired same-request retry rejected';
  begin
    perform app_private.claim_step_up('return','22222222-2222-4222-8222-222222222222','fixture','{"amount":2}');
    raise exception 'Conflicting request accepted';
  exception when invalid_parameter_value then null; end;
  assert not has_function_privilege('authenticated','public.verify_override_pin_guarded(uuid,text,text)','EXECUTE'),'Browser can bypass Edge actor binding';
  assert not has_table_privilege('authenticated','app_private.pin_attempts','UPDATE'),'Browser can reset cooldown';
  assert not app_private.has_step_up('return'),'Unscoped gate still open';
end;
$$;
-- Exercise a real protected financial consumer with canonical line/tender data.
select public.verify_override_pin_guarded('11111111-1111-4111-8111-111111111111','1234','discount');
set local role authenticated;
select public.create_retail_sale('44444444-4444-4444-8444-444444444444',
 '[{"itemKind":"other","name":"Fixture","quantity":1,"originalPrice":100,"unitPrice":90,"discountReason":"Fixture"}]',
 '[{"amount":90,"method":"Cash","cashTendered":90}]');
select public.create_retail_sale('44444444-4444-4444-8444-444444444444',
 '[{"itemKind":"other","name":"Fixture","quantity":1,"originalPrice":100,"unitPrice":90,"discountReason":"Fixture"}]',
 '[{"amount":90,"method":"Cash","cashTendered":90}]');
do $$ begin
 begin
  perform public.create_retail_sale('55555555-5555-4555-8555-555555555555',
   '[{"itemKind":"other","name":"Fixture","quantity":1,"originalPrice":100,"unitPrice":90,"discountReason":"Fixture"}]',
   '[{"amount":90,"method":"Cash","cashTendered":90}]');
  raise exception 'Second discounted sale accepted without new PIN';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin assert (select count(*)=1 from public.sales),'Duplicate sale'; end $$;
rollback;
select 'PASS Phase 4 PIN/claim/local discounted-sale tests' as result;
