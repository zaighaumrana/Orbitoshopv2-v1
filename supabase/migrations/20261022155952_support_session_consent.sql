begin;
create table app_private.support_cases(
 ticket_id uuid primary key,source_id uuid not null,client_binding text not null,client_id integer not null,verified_at timestamptz not null default now()
);
create table app_private.support_consents(
 id uuid primary key default extensions.gen_random_uuid(),request_id uuid not null unique,ticket_id uuid not null references app_private.support_cases(ticket_id),
 purpose text not null check(length(purpose) between 20 and 400),scope text not null default 'shop_operations' check(scope='shop_operations'),
 approved_by uuid not null references auth.users(id),approved_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 revoked_at timestamptz,session_id uuid unique,support_user_id uuid,platform_actor uuid,used_at timestamptz,
 check(expires_at>approved_at and expires_at<=approved_at+interval '30 minutes')
);
create table app_private.support_consent_events(id bigint generated always as identity primary key,consent_id uuid not null references app_private.support_consents(id),event text not null,actor uuid not null,at timestamptz not null default clock_timestamp());
alter table app_private.support_cases enable row level security;
alter table app_private.support_consents enable row level security;
alter table app_private.support_consent_events enable row level security;
revoke all on app_private.support_cases,app_private.support_consents,app_private.support_consent_events from public,anon,authenticated,service_role;

create function app_private.support_owner() returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();sid uuid;
begin
 begin sid:=(auth.jwt()->>'session_id')::uuid;exception when invalid_text_representation then raise exception 'Verified owner required' using errcode='42501';end;
 if not exists(select 1 from auth.users u join public.app_users a on a.auth_user_id=u.id join auth.sessions s on s.user_id=u.id
  where u.id=actor and a.role='Business Owner' and a.status='Active' and a.employee_id is null and lower(a.email)=lower(u.email)
   and u.email_confirmed_at is not null and u.deleted_at is null and not coalesce(u.is_anonymous,false)
   and (u.banned_until is null or u.banned_until<=now()) and s.id=sid and s.created_at is not null and (s.not_after is null or s.not_after>now()))
 then raise exception 'Verified owner required' using errcode='42501';end if;
 return actor;
end $$;
revoke all on function app_private.support_owner() from public,anon,authenticated,service_role;

-- Only the verified ticket proxy may attest a case. Browser-supplied IDs alone
-- never establish that a case belongs to this Shop.
create function public.support_case_observe(p_ticket uuid,p_client integer,p_source uuid,p_binding text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.shop_config s cross join app_private.bridge_config b where s.id=1 and b.singleton
  and s.platform_client_id=p_client and b.source_id=p_source and b.client_binding=p_binding)
 then raise exception 'Case binding mismatch' using errcode='42501';end if;
 insert into app_private.support_cases(ticket_id,client_id,source_id,client_binding) values(p_ticket,p_client,p_source,p_binding)
 on conflict(ticket_id) do update set verified_at=now() where support_cases.client_id=excluded.client_id and support_cases.source_id=excluded.source_id and support_cases.client_binding=excluded.client_binding;
 if not found then raise exception 'Case binding changed' using errcode='42501';end if;
end $$;
revoke all on function public.support_case_observe(uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.support_case_observe(uuid,integer,uuid,text) to service_role;

create function public.support_consent(p_action text,p_case uuid default null,p_consent uuid default null,p_purpose text default '',p_confirmation text default '',p_request uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.support_owner();c app_private.support_consents;stamp timestamptz:=clock_timestamp();
begin
 if p_action='approve' then
  if p_request is null then raise exception 'Original approval request identity required' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  if p_confirmation is distinct from 'AUTHORIZE SUPPORT' or length(btrim(p_purpose)) not between 20 and 400 or p_purpose ~ '[[:cntrl:]]'
   or not exists(select 1 from app_private.support_cases k cross join public.shop_config s cross join app_private.bridge_config b
    where k.ticket_id=p_case and s.id=1 and b.singleton and s.onboarding_completed_at is not null and not s.suspended
     and s.platform_client_id=k.client_id and b.source_id=k.source_id and b.client_binding=k.client_binding)
  then raise exception 'Verified case, completed Shop and explicit owner authorization required' using errcode='42501';end if;
  select * into c from app_private.support_consents where request_id=p_request;
  if found then
   if c.ticket_id<>p_case or c.purpose<>btrim(p_purpose) or c.approved_by<>actor then raise exception 'Approval identity conflict' using errcode='42501';end if;
  else
   stamp:=clock_timestamp();
   insert into app_private.support_consents(request_id,ticket_id,purpose,approved_by,approved_at,expires_at) values(p_request,p_case,btrim(p_purpose),actor,stamp,stamp+interval '30 minutes') returning * into c;
   insert into app_private.support_consent_events(consent_id,event,actor) values(c.id,'approved',actor);
  end if;
 elsif p_action='revoke' then
  select * into c from app_private.support_consents where id=p_consent for update;
  if not found then raise exception 'Approval unavailable';end if;
  if c.revoked_at is null then
   update app_private.support_consents set revoked_at=stamp where id=c.id;
   insert into app_private.support_consent_events(consent_id,event,actor) values(c.id,'revoked',actor);
  end if;
 elsif p_action<>'list' then raise exception 'Unknown consent action';end if;
 return jsonb_build_object('approved_id',case when p_action='approve' then c.id end,'approvals',
  (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select id,ticket_id,purpose,scope,approved_by,approved_at,expires_at,revoked_at,platform_actor,used_at from app_private.support_consents order by approved_at desc limit 50)x),
  'history',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select e.event,e.actor,e.at,e.consent_id from app_private.support_consent_events e order by e.at desc limit 100)x));
end $$;
revoke all on function public.support_consent(text,uuid,uuid,text,text,uuid) from public,anon,service_role;
grant execute on function public.support_consent(text,uuid,uuid,text,text,uuid) to authenticated;

create function app_private.support_session_valid(p_actor uuid,p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.support_consents c join app_private.support_cases k on k.ticket_id=c.ticket_id
  join auth.sessions a on a.id=c.session_id and a.user_id=c.support_user_id
  join auth.users u on u.id=a.user_id join public.app_users profile on profile.auth_user_id=u.id
  cross join public.shop_config s cross join app_private.bridge_config b
  where c.support_user_id=p_actor and c.session_id=p_session and c.revoked_at is null and c.expires_at>now()
   and a.created_at is not null and (a.not_after is null or a.not_after>now()) and u.deleted_at is null and u.email_confirmed_at is not null
   and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now())
   and profile.role='Orbito Support' and profile.status='Active' and profile.employee_id is null and lower(profile.email)=lower(u.email)
   and exists(select 1 from public.app_users owner_profile join auth.users owner_auth on owner_auth.id=owner_profile.auth_user_id where owner_profile.auth_user_id=c.approved_by and owner_profile.role='Business Owner' and owner_profile.status='Active' and owner_auth.deleted_at is null and (owner_auth.banned_until is null or owner_auth.banned_until<=now()))
   and s.id=1 and b.singleton and s.onboarding_version=2 and s.platform_client_id=k.client_id and b.source_id=k.source_id and b.client_binding=k.client_binding)
$$;
revoke all on function app_private.support_session_valid(uuid,uuid) from public,anon,authenticated,service_role;
create function public.support_session_authorized(p_actor uuid,p_session uuid) returns boolean language sql stable security definer set search_path='' as $$select app_private.support_session_valid(p_actor,p_session)$$;
revoke all on function public.support_session_authorized(uuid,uuid) from public,anon,authenticated;
grant execute on function public.support_session_authorized(uuid,uuid) to service_role;

create function public.support_consent_bind(p_consent uuid,p_actor uuid,p_session uuid,p_platform_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c app_private.support_consents;
begin
 select * into c from app_private.support_consents where id=p_consent for update;
 if not found or c.revoked_at is not null or c.expires_at<=clock_timestamp() or c.session_id is not null or p_platform_actor is null
  or not exists(select 1 from auth.sessions s join public.app_users a on a.auth_user_id=s.user_id where s.id=p_session and s.user_id=p_actor and a.role='Orbito Support' and a.status='Active')
 then raise exception 'Current unused owner consent required' using errcode='42501';end if;
 update app_private.support_consents set session_id=p_session,support_user_id=p_actor,platform_actor=p_platform_actor,used_at=clock_timestamp() where id=c.id;
 if not app_private.support_session_valid(p_actor,p_session) then raise exception 'Current owner consent required' using errcode='42501';end if;
 insert into app_private.support_consent_events(consent_id,event,actor) values(c.id,'session_bound',p_platform_actor);
end $$;
revoke all on function public.support_consent_bind(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.support_consent_bind(uuid,uuid,uuid,uuid) to service_role;

create function app_private.support_access_allowed() returns boolean language plpgsql stable security definer set search_path='' as $$
declare sid uuid;
begin
 if not exists(select 1 from public.app_users where auth_user_id=auth.uid() and role='Orbito Support')then return true;end if;
 begin sid:=(auth.jwt()->>'session_id')::uuid;exception when invalid_text_representation then return false;end;
 return app_private.support_session_valid(auth.uid(),sid);
end $$;
revoke all on function app_private.support_access_allowed() from public;
grant execute on function app_private.support_access_allowed() to anon,authenticated,service_role;
create function public.support_request_guard() returns void language plpgsql stable security definer set search_path='' as $$
begin if not app_private.support_access_allowed() then raise exception 'Owner support approval expired or revoked' using errcode='42501';end if;end $$;
revoke all on function public.support_request_guard() from public;
grant execute on function public.support_request_guard() to anon,authenticated,service_role;
-- Data API hook also covers existing SECURITY DEFINER RPCs. Restrictive policies
-- cover subsequent RLS evaluations outside PostgREST without changing owner rules.
do $$declare t record;setting text;begin
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname='public' or n.nspname='storage' and c.relname='objects' or n.nspname='realtime' and c.relname='messages') and c.relkind in ('r','p') and c.relrowsecurity loop
  execute format('create policy support_consent_guard on %I.%I as restrictive for all to authenticated using (app_private.support_access_allowed()) with check (app_private.support_access_allowed())',t.nspname,t.relname);
 end loop;
 for setting in select unnest(setconfig) from pg_db_role_setting where setrole=(select oid from pg_roles where rolname='authenticator') loop
  if setting like 'pgrst.db_pre_request=%' and setting<>'pgrst.db_pre_request=public.support_request_guard' and setting<>'pgrst.db_pre_request=' then
   raise exception 'Existing request hook requires reviewed composition; no configuration was replaced';
  end if;
 end loop;
end $$;
alter role authenticator set pgrst.db_pre_request='public.support_request_guard';
create function public.support_consent_capability() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from pg_db_role_setting s cross join lateral unnest(s.setconfig) v where s.setrole=(select oid from pg_roles where rolname='authenticator') and v='pgrst.db_pre_request=public.support_request_guard')
$$;
revoke all on function public.support_consent_capability() from public,anon,authenticated;
grant execute on function public.support_consent_capability() to service_role;
notify pgrst,'reload config';
commit;
