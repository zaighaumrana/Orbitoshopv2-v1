begin;
alter table public.shop_config
 add column onboarding_version integer not null default 0,
 add column onboarding_completed_at timestamptz,
 add column shop_email text not null default '',
 add column paper_resupply_enabled boolean not null default false;
alter table public.shop_config alter column shop_name set default 'Your Business';
alter table public.shop_config alter column terms_text set default '';
alter table public.shop_config alter column override_pin set default null;
alter table public.shop_config alter column repair_module_enabled set default false;
alter table public.shop_config alter column technician_module_enabled set default false;

-- Preserve every pre-existing shop by default. Only an exact untouched baseline,
-- with no identities or business activity, is eligible for automatic cleanup.
update public.shop_config set onboarding_completed_at=now();
update public.shop_config sc set shop_name='Your Business', terms_text='',
 onboarding_completed_at=null, repair_module_enabled=false, technician_module_enabled=false
where id=1 and shop_name='FixPoint Mobile Care' and platform_client_id is null
 and coalesce(owner_email,'')='' and coalesce(shop_address,'')='' and coalesce(shop_phone,'')=''
 and coalesce(shop_description,'')='' and coalesce(shop_logo,'')=''
 and primary_color='#126c5b' and secondary_color='#e9b949' and currency='Rs.' and tax_rate=0
 and terms_text='Warranty: 30 days on parts replaced.'
 and coalesce(platform_url,'')='' and coalesce(platform_anon,'')=''
 and billing_model='fixed' and per_receipt_rate=0 and per_ticket_rate=10 and per_item_rate=1
 and strict_login_mode=false and discount_pin_required=true and partial_udhar_allowed=true
 and repair_module_enabled=true and technician_module_enabled=true and inventory_module_enabled=false
 and workshop_enabled=false and live_tracking_enabled=false and ems_enabled=false and ems_track_breaks=false and suspended=false
 and invoice_prefix='INV' and ticket_prefix='TK' and invoice_seq=0 and ticket_seq=0
 and not exists(select 1 from auth.users) and not exists(select 1 from public.app_users)
 and not exists(select 1 from public.employees) and not exists(select 1 from public.legacy_auth_credentials)
 and not exists(select 1 from public.sales) and not exists(select 1 from public.tickets)
 and not exists(select 1 from public.inventory) and not exists(select 1 from app_private.bridge_events)
 and not exists(select 1 from public.quick_items) and not exists(select 1 from public.repair_components)
 and not exists(select 1 from public.udhar) and not exists(select 1 from public.returns)
 and not exists(select 1 from public.active_sessions) and not exists(select 1 from public.attendance)
 and not exists(select 1 from public.leaves) and not exists(select 1 from public.salary_config)
 and not exists(select 1 from public.salary_slips) and not exists(select 1 from public.password_reset_requests)
 and not exists(select 1 from public.support_access_log)
 and not exists(select 1 from public.sale_lines) and not exists(select 1 from public.payments)
 and not exists(select 1 from public.payment_allocations) and not exists(select 1 from public.refunds)
 and not exists(select 1 from public.invoice_adjustments) and not exists(select 1 from public.credit_approvals)
 and not exists(select 1 from public.additional_work_proposals) and not exists(select 1 from public.return_lines)
 and not exists(select 1 from public.inventory_movements) and not exists(select 1 from public.step_up_authorizations)
 and not exists(select 1 from app_private.billing_projection) and not exists(select 1 from app_private.paper_resupply_requests)
 and not exists(select 1 from app_private.bridge_config where client_binding is not null or delivery_enabled or usage_mode<>'legacy' or last_sequence<>0)
 and not exists(select 1 from public.shop_security where override_pin_hash is not null
   and override_pin_hash<>extensions.crypt('1234',override_pin_hash));
update public.shop_security set override_pin_hash=null
 where exists(select 1 from public.shop_config where id=1 and onboarding_completed_at is null);

create table app_private.owner_bootstrap (
 singleton boolean primary key default true check(singleton),
 request_id uuid not null unique, payload jsonb not null,
 owner_auth_id uuid references auth.users(id), invite_state text not null default 'owner_invite_not_started',
 lease_id uuid, lease_until timestamptz, invite_sent_at timestamptz
);
alter table app_private.owner_bootstrap enable row level security;
revoke all on app_private.owner_bootstrap from public,anon,authenticated;
grant all on app_private.owner_bootstrap to service_role;

create function public.bridge_onboarding(p_action text,p_payload jsonb) returns jsonb
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
   'owner_invite',case when u.email_confirmed_at is not null then 'owner_invite_accepted' else coalesce(b.invite_state,'owner_invite_not_started') end,
   'onboarding',case when sc.onboarding_completed_at is null then 'onboarding_pending' else 'onboarding_complete' end,
   'onboarding_version',sc.onboarding_version,'config',(public.bridge_onboarding('config-read','{}')->'config'));
 elsif p_action='claim' then
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
  if not coalesce(b.singleton,false) then raise exception 'Bootstrap not reserved'; end if;
  select * into strict u from auth.users where id=(p_payload->>'auth_user_id')::uuid;
  if lower(u.email)<>b.payload->>'owner_email' or u.invited_at is null
   or u.raw_user_meta_data->>'orbito_bootstrap_request' is distinct from b.request_id::text then raise exception 'Invitation identity mismatch'; end if;
  insert into public.app_users(auth_user_id,employee_id,email,display_name,role,status)
   values(u.id,null,b.payload->>'owner_email',b.payload->>'owner_name','Business Owner','Active') on conflict(auth_user_id) do nothing;
  select * into strict au from public.app_users where auth_user_id=u.id;
  if au.role<>'Business Owner' or au.employee_id is not null or au.email<>b.payload->>'owner_email' or au.status<>'Active' then raise exception 'Owner conflict'; end if;
  update app_private.owner_bootstrap set owner_auth_id=u.id,invite_state='owner_invite_sent',invite_sent_at=now(),lease_until=null,lease_id=null where singleton;
  update app_private.bridge_config set usage_mode='bridge',delivery_enabled=true where singleton;
  return public.bridge_onboarding('status','{}');
 elsif p_action='failed' then
  update app_private.owner_bootstrap set invite_state='owner_invite_failed',lease_id=null,lease_until=null
   where singleton and lease_id=(p_payload->>'lease_id')::uuid;
  return '{}'::jsonb;
 else raise exception 'Unsupported onboarding action'; end if;
end $$;
revoke all on function public.bridge_onboarding(text,jsonb) from public,anon,authenticated;
grant execute on function public.bridge_onboarding(text,jsonb) to service_role;

-- This route verifies the canonical mapping and immutable reservation, never
-- user-editable Auth metadata. It returns only the signed-in owner's email.
create function public.get_owner_invite_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare owner_email text;
begin
 select b.payload->>'owner_email' into owner_email
 from app_private.owner_bootstrap b
 join public.app_users au on au.auth_user_id=b.owner_auth_id
 join auth.users u on u.id=b.owner_auth_id
 join public.shop_config sc on sc.id=1
 where b.singleton and b.owner_auth_id=auth.uid() and au.role='Business Owner'
  and au.status='Active' and au.employee_id is null and sc.onboarding_version=2 and not sc.suspended
  and lower(trim(u.email))=b.payload->>'owner_email' and lower(trim(au.email))=b.payload->>'owner_email'
  and sc.owner_email=b.payload->>'owner_email' and u.email_confirmed_at is not null;
 if owner_email is null then raise exception 'Reserved invited owner required' using errcode='42501'; end if;
 return jsonb_build_object('owner_email',owner_email);
end $$;
revoke all on function public.get_owner_invite_context() from public,anon;
grant execute on function public.get_owner_invite_context() to authenticated;

create function public.complete_shop_onboarding(p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
declare sc public.shop_config%rowtype;
begin
 select * into strict sc from public.shop_config where id=1 for update;
 if not exists(select 1 from public.app_users where auth_user_id=p_owner and role='Business Owner' and status='Active' and email=sc.owner_email)
  or not exists(select 1 from auth.users u join app_private.owner_bootstrap b on b.owner_auth_id=u.id
    where u.id=p_owner and u.email_confirmed_at is not null and coalesce(u.encrypted_password,'')<>''
      and lower(trim(u.email))=b.payload->>'owner_email' and sc.owner_email=b.payload->>'owner_email')
  or sc.onboarding_version<>2 then raise exception 'Invited owner required'; end if;
 if nullif(trim(sc.shop_name),'') is null or nullif(trim(sc.shop_address),'') is null or nullif(trim(sc.shop_phone),'') is null
  or sc.shop_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or nullif(trim(sc.currency),'') is null or sc.tax_rate is null or sc.tax_rate not between 0 and 100
  or nullif(trim(sc.invoice_prefix),'') is null or nullif(trim(sc.ticket_prefix),'') is null
  or not exists(select 1 from public.shop_security where id=1 and override_pin_hash is not null) then raise exception 'Complete required settings and PIN'; end if;
 update public.shop_config set onboarding_completed_at=coalesce(onboarding_completed_at,now()) where id=1;
end $$;
revoke all on function public.complete_shop_onboarding(uuid) from public,anon,authenticated;
grant execute on function public.complete_shop_onboarding(uuid) to service_role;

create or replace function public.get_app_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not app_private.current_client_access_allowed() then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'shop_email', sc.shop_email,
    'onboarding_version', sc.onboarding_version,
    'onboarding_completed_at', sc.onboarding_completed_at,
    'paper_resupply_enabled', coalesce((select (payload->>'paper_resupply_enabled')::boolean from app_private.billing_projection where singleton),sc.paper_resupply_enabled),
    'shop_name', sc.shop_name,
    'shop_address', sc.shop_address,
    'shop_phone', sc.shop_phone,
    'shop_logo', sc.shop_logo,
    'shop_description', sc.shop_description,
    'primary_color', sc.primary_color,
    'secondary_color', sc.secondary_color,
    'currency', sc.currency,
    'tax_rate', sc.tax_rate,
    'strict_login_mode', sc.strict_login_mode,
    'discount_pin_required', sc.discount_pin_required,
    'partial_udhar_allowed', sc.partial_udhar_allowed,
    'terms_text', sc.terms_text,
    'repair_module_enabled', sc.repair_module_enabled,
    'inventory_module_enabled', sc.inventory_module_enabled,
    'technician_module_enabled', sc.technician_module_enabled,
    'live_tracking_enabled', sc.live_tracking_enabled,
    'ems_enabled', sc.ems_enabled,
    'ems_track_breaks', sc.ems_track_breaks,
    'invoice_prefix', sc.invoice_prefix,
    'ticket_prefix', sc.ticket_prefix,
    'suspended', coalesce(sc.suspended, false)
  ) into result
  from public.shop_config sc
  where sc.id = 1;

  return result;
end;
$$;

commit;
