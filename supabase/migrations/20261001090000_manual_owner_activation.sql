begin;

-- One activation mechanism for manual sessions and explicitly requested invites.
-- No owner password, caller-selected role, or user metadata authorization.
create function app_private.activate_bootstrap_owner(p_auth uuid,p_invitation boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sc public.shop_config%rowtype; bc app_private.bridge_config%rowtype;
 b app_private.owner_bootstrap%rowtype; u auth.users%rowtype; au public.app_users%rowtype;
begin
 select * into strict sc from public.shop_config where id=1 for update;
 select * into strict bc from app_private.bridge_config where singleton for update;
 select * into b from app_private.owner_bootstrap where singleton for update;
 if p_auth is null or not coalesce(b.singleton,false) or sc.onboarding_version<>2 or sc.suspended
  or sc.owner_email is distinct from b.payload->>'owner_email'
  or sc.platform_client_id is distinct from (b.payload->>'platform_client_id')::integer
  or bc.client_binding is distinct from b.payload->>'client_binding' then
  raise exception 'Owner activation unavailable' using errcode='42501';
 end if;
 select * into u from auth.users where id=p_auth;
 if u.id is null or lower(trim(u.email)) is distinct from b.payload->>'owner_email'
  or (not p_invitation and (u.email_confirmed_at is null or not bc.delivery_enabled or bc.usage_mode<>'bridge'))
  or (p_invitation and (u.invited_at is null or u.raw_user_meta_data->>'orbito_bootstrap_request' is distinct from b.request_id::text)) then
  raise exception 'Owner activation unavailable' using errcode='42501';
 end if;
 if (b.owner_auth_id is not null and b.owner_auth_id<>u.id)
  or (b.owner_auth_id is null and sc.onboarding_completed_at is not null)
  or exists(select 1 from public.app_users where role='Business Owner' and auth_user_id<>u.id) then
  raise exception 'Owner activation unavailable' using errcode='42501';
 end if;
 insert into public.app_users(auth_user_id,employee_id,email,display_name,role,status)
  values(u.id,null,b.payload->>'owner_email',b.payload->>'owner_name','Business Owner','Active') on conflict(auth_user_id) do nothing;
 select * into strict au from public.app_users where auth_user_id=u.id;
 if au.role<>'Business Owner' or au.status<>'Active' or au.employee_id is not null
  or lower(trim(au.email)) is distinct from b.payload->>'owner_email' then
  raise exception 'Owner activation unavailable' using errcode='42501';
 end if;
 update app_private.owner_bootstrap set owner_auth_id=u.id,lease_id=null,lease_until=null where singleton;
 update app_private.bridge_config set usage_mode='bridge',delivery_enabled=true where singleton;
 return jsonb_build_object('auth_user_id',au.auth_user_id,'employee_id',au.employee_id,'email',au.email,
  'display_name',au.display_name,'role',au.role,'status',au.status);
end $$;
revoke all on function app_private.activate_bootstrap_owner(uuid,boolean) from public,anon,authenticated,service_role;

create function public.activate_reserved_owner() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authenticated owner required' using errcode='42501'; end if;
 return app_private.activate_bootstrap_owner(auth.uid(),false);
end $$;
revoke all on function public.activate_reserved_owner() from public,anon,service_role;
grant execute on function public.activate_reserved_owner() to authenticated;

create or replace function public.bridge_onboarding(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sc public.shop_config%rowtype; bc app_private.bridge_config%rowtype;
 b app_private.owner_bootstrap%rowtype; u auth.users%rowtype; au public.app_users%rowtype;
 lease uuid; modules jsonb; k text;
begin
 select * into strict sc from public.shop_config where id=1 for update;
 select * into strict bc from app_private.bridge_config where singleton for update;
 select * into b from app_private.owner_bootstrap where singleton for update;
 if p_action='config-read' then
  return jsonb_build_object('config',jsonb_build_object('repair_module_enabled',sc.repair_module_enabled,
   'inventory_module_enabled',sc.inventory_module_enabled,'technician_module_enabled',sc.technician_module_enabled,
   'live_tracking_enabled',sc.live_tracking_enabled,'ems_enabled',sc.ems_enabled,'ems_track_breaks',sc.ems_track_breaks,'suspended',sc.suspended));
 elsif p_action='config-write' then
  modules:=p_payload->'changes';
  if modules is null or jsonb_typeof(modules)<>'object' or modules='{}' or
   modules-array['repair_module_enabled','inventory_module_enabled','technician_module_enabled','live_tracking_enabled','ems_enabled','ems_track_breaks','suspended']<>'{}' then raise exception 'Invalid config'; end if;
  for k in select jsonb_object_keys(modules) loop if jsonb_typeof(modules->k)<>'boolean' then raise exception 'Invalid config'; end if; end loop;
  update public.shop_config set repair_module_enabled=coalesce((modules->>'repair_module_enabled')::boolean,repair_module_enabled),
   inventory_module_enabled=coalesce((modules->>'inventory_module_enabled')::boolean,inventory_module_enabled),
   technician_module_enabled=coalesce((modules->>'technician_module_enabled')::boolean,technician_module_enabled),
   live_tracking_enabled=coalesce((modules->>'live_tracking_enabled')::boolean,live_tracking_enabled),
   ems_enabled=coalesce((modules->>'ems_enabled')::boolean,ems_enabled),
   ems_track_breaks=coalesce((modules->>'ems_track_breaks')::boolean,ems_track_breaks) and coalesce((modules->>'ems_enabled')::boolean,ems_enabled),
   suspended=coalesce((modules->>'suspended')::boolean,suspended) where id=1;
  return public.bridge_onboarding('config-read','{}');
 elsif p_action='status' then
  if b.owner_auth_id is not null then select * into u from auth.users where id=b.owner_auth_id; end if;
  return jsonb_build_object('source_id',bc.source_id,'client_binding',bc.client_binding,
   'infrastructure',case when b.singleton and bc.delivery_enabled and bc.usage_mode='bridge' then 'ready' else 'pending' end,
   'owner_setup',case when b.owner_auth_id is not null and u.email_confirmed_at is not null then 'owner_active' else 'owner_setup_pending' end,
   'owner_invite',case when u.invited_at is not null and u.email_confirmed_at is not null then 'owner_invite_accepted' else coalesce(b.invite_state,'owner_invite_not_started') end,
   'onboarding',case when sc.onboarding_completed_at is null then 'onboarding_pending' else 'onboarding_complete' end,
   'onboarding_version',sc.onboarding_version,'config',(public.bridge_onboarding('config-read','{}')->'config'));
 elsif p_action in ('reserve','claim') then
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or not(p_payload ?& array['request_id','platform_client_id','client_binding','business_name','owner_name','owner_email','billing_currency','shop_url','modules','paper_resupply_enabled','onboarding_version'])
   or p_payload->>'onboarding_version' is distinct from '2' or coalesce((p_payload->>'platform_client_id')::integer,0)<1
   or length(coalesce(p_payload->>'client_binding','')) not between 1 and 200
   or length(coalesce(p_payload->>'business_name','')) not between 1 and 200
   or length(coalesce(p_payload->>'owner_name','')) not between 1 and 160
   or coalesce(p_payload->>'owner_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   or coalesce(p_payload->>'billing_currency','') !~ '^[A-Z]{3}$'
   or p_payload-array['request_id','platform_client_id','client_binding','business_name','owner_name','owner_email','billing_currency','shop_url','modules','paper_resupply_enabled','onboarding_version']<>'{}'
   then raise exception 'Invalid bootstrap'; end if;
  if (p_payload->>'request_id')::uuid is null then raise exception 'Request identity required'; end if;
  modules:=p_payload->'modules';
  if modules is null or jsonb_typeof(modules)<>'object' or not(modules ?& array['repair_module_enabled','inventory_module_enabled','technician_module_enabled','live_tracking_enabled','ems_enabled','ems_track_breaks'])
   or modules-array['repair_module_enabled','inventory_module_enabled','technician_module_enabled','live_tracking_enabled','ems_enabled','ems_track_breaks']<>'{}'
   or jsonb_typeof(p_payload->'paper_resupply_enabled')<>'boolean' then raise exception 'Invalid modules'; end if;
  for k in select jsonb_object_keys(modules) loop if jsonb_typeof(modules->k)<>'boolean' then raise exception 'Invalid modules'; end if; end loop;
  if (modules->>'ems_track_breaks')::boolean and not(modules->>'ems_enabled')::boolean then raise exception 'Break tracking requires EMS'; end if;
  if b.singleton then
   if b.payload-'request_id' <> p_payload-'request_id' then raise exception 'Conflicting bootstrap identity'; end if;
   if b.owner_auth_id is not null then
    select * into strict au from public.app_users where auth_user_id=b.owner_auth_id;
    select * into strict u from auth.users where id=b.owner_auth_id;
    if au.role<>'Business Owner' or au.status<>'Active' or au.employee_id is not null
     or lower(au.email)<>p_payload->>'owner_email' or lower(u.email)<>p_payload->>'owner_email' then raise exception 'Conflicting owner'; end if;
    return public.bridge_onboarding('status','{}')||jsonb_build_object('already_provisioned',true);
   end if;
  else
   if sc.onboarding_completed_at is not null or sc.platform_client_id is not null or bc.last_sequence<>0
    or bc.delivery_enabled or (bc.client_binding is not null and bc.client_binding<>p_payload->>'client_binding')
    or exists(select 1 from public.app_users where role<>'Orbito Support')
    or exists(select 1 from public.employees) or exists(select 1 from public.legacy_auth_credentials)
    or exists(select 1 from auth.users where lower(email)=p_payload->>'owner_email') then raise exception 'Shop is initialized or owner conflicts'; end if;
   insert into app_private.owner_bootstrap(request_id,payload) values((p_payload->>'request_id')::uuid,p_payload) returning * into b;
   update public.shop_config set platform_client_id=(p_payload->>'platform_client_id')::integer,
    shop_name=p_payload->>'business_name',owner_email=p_payload->>'owner_email',onboarding_version=2,
    currency=case p_payload->>'billing_currency' when 'PKR' then 'Rs.' when 'USD' then '$' when 'EUR' then '€' when 'GBP' then '£' else p_payload->>'billing_currency' end,
    repair_module_enabled=(modules->>'repair_module_enabled')::boolean,inventory_module_enabled=(modules->>'inventory_module_enabled')::boolean,
    technician_module_enabled=(modules->>'technician_module_enabled')::boolean,live_tracking_enabled=(modules->>'live_tracking_enabled')::boolean,
    ems_enabled=(modules->>'ems_enabled')::boolean,ems_track_breaks=(modules->>'ems_track_breaks')::boolean,
    paper_resupply_enabled=(p_payload->>'paper_resupply_enabled')::boolean where id=1;
   update app_private.bridge_config set client_binding=p_payload->>'client_binding' where singleton;
  end if;
  if p_action='reserve' then
   update app_private.bridge_config set usage_mode='bridge',delivery_enabled=true where singleton;
   return public.bridge_onboarding('status','{}');
  end if;
  if b.lease_until>clock_timestamp() then raise exception 'Bootstrap in progress'; end if;
  -- Recover an Auth invite committed before a lost HTTP response. Do not adopt a
  -- pre-existing account: the reservation predates this Auth identity.
  select * into u from auth.users where lower(email)=p_payload->>'owner_email';
  if u.id is not null then
   if u.invited_at is null or u.raw_user_meta_data->>'orbito_bootstrap_request' is distinct from b.request_id::text
    or exists(select 1 from public.app_users where auth_user_id=u.id and role<>'Business Owner') then raise exception 'Conflicting auth identity'; end if;
   -- Metadata is only a recovery correlation, never a role authorization source.
   perform public.bridge_onboarding('finish',jsonb_build_object('auth_user_id',u.id));
   return public.bridge_onboarding('status','{}')||jsonb_build_object('already_provisioned',true);
  end if;
  lease:=gen_random_uuid();
  update app_private.owner_bootstrap set lease_id=lease,lease_until=clock_timestamp()+interval '2 minutes' where singleton;
  return jsonb_build_object('lease_id',lease,'request_id',b.request_id);
 elsif p_action='finish' then
  perform app_private.activate_bootstrap_owner((p_payload->>'auth_user_id')::uuid,true);
  update app_private.owner_bootstrap set invite_state='owner_invite_sent',invite_sent_at=coalesce(invite_sent_at,now()) where singleton;
  return public.bridge_onboarding('status','{}');
 elsif p_action='failed' then
  update app_private.owner_bootstrap set invite_state='owner_invite_failed',lease_id=null,lease_until=null
   where singleton and lease_id=(p_payload->>'lease_id')::uuid;
  return '{}'::jsonb;
 else raise exception 'Unsupported onboarding action'; end if;
end $$;
revoke all on function public.bridge_onboarding(text,jsonb) from public,anon,authenticated;
grant execute on function public.bridge_onboarding(text,jsonb) to service_role;


commit;
