-- Per-client project tenancy: random local Shop identity, never caller supplied.
-- Future version changes update legal_policy through a reviewed forward migration.
create table app_private.legal_policy (
  singleton boolean primary key default true check (singleton),
  shop_id uuid not null unique default extensions.gen_random_uuid(),
  published boolean not null default false,
  required_revision text not null,
  terms_version text not null,
  privacy_version text not null,
  dpa_version text not null
);
insert into app_private.legal_policy
  (singleton, required_revision, terms_version, privacy_version, dpa_version)
values (true, '2026-09-27.1', '1.0', '1.0', '1.0');

create table app_private.legal_acceptances (
  id uuid primary key default extensions.gen_random_uuid(),
  shop_id uuid not null references app_private.legal_policy(shop_id),
  auth_user_id uuid not null,
  accepted_name text not null check (accepted_name ~ '[^[:space:]]'),
  accepted_role text not null check (accepted_role = 'Business Owner'),
  required_revision text not null,
  terms_version text not null,
  privacy_version text not null,
  dpa_version text not null,
  accepted_at timestamptz not null default clock_timestamp(),
  unique (shop_id, required_revision)
);
-- No Auth FK/cascade: removing an account must not erase contracting evidence.
-- Personal-data retention of this evidence is an explicit business/legal decision.
alter table app_private.legal_policy enable row level security;
alter table app_private.legal_acceptances enable row level security;
revoke all on app_private.legal_policy, app_private.legal_acceptances from public, anon, authenticated;
grant all on app_private.legal_policy, app_private.legal_acceptances to service_role;

create function public.get_legal_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  policy app_private.legal_policy%rowtype;
  receipt app_private.legal_acceptances%rowtype;
begin
  if auth.uid() is null or not app_private.current_client_access_allowed()
    or app_private.current_app_role() is distinct from 'Business Owner' then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  select * into strict policy from app_private.legal_policy where singleton;
  select * into receipt from app_private.legal_acceptances
    where shop_id = policy.shop_id order by accepted_at desc, id desc limit 1;
  return jsonb_build_object(
    'published', policy.published,
    'required_revision', policy.required_revision,
    'terms_version', policy.terms_version,
    'privacy_version', policy.privacy_version,
    'dpa_version', policy.dpa_version,
    'accepted', exists(select 1 from app_private.legal_acceptances
      where shop_id = policy.shop_id and required_revision = policy.required_revision),
    'receipt', case when receipt.id is null then null else jsonb_build_object(
      'accepted_name', receipt.accepted_name, 'accepted_role', receipt.accepted_role,
      'accepted_at', receipt.accepted_at, 'required_revision', receipt.required_revision,
      'terms_version', receipt.terms_version, 'privacy_version', receipt.privacy_version,
      'dpa_version', receipt.dpa_version) end);
end $$;
revoke all on function public.get_legal_status() from public, anon;
grant execute on function public.get_legal_status() to authenticated;

create function public.accept_legal_terms(
  p_authorized boolean, p_required_revision text,
  p_terms_version text, p_privacy_version text, p_dpa_version text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  policy app_private.legal_policy%rowtype;
  actor public.app_users%rowtype;
begin
  if auth.uid() is null or not app_private.current_client_access_allowed() then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  select * into actor from public.app_users
    where auth_user_id = auth.uid() and status = 'Active' for share;
  if actor.role is distinct from 'Business Owner' then
    raise exception 'Only the Business Owner may accept' using errcode = '42501';
  end if;
  if actor.display_name is null or actor.display_name !~ '[^[:space:]]' then
    raise exception 'Business Owner name is required before accepting legal terms' using errcode = '22023';
  end if;
  if p_authorized is distinct from true then
    raise exception 'Confirm your authority to accept' using errcode = '22023';
  end if;
  -- Serialize policy updates against acceptance; dates, identity and Shop are server-derived.
  select * into strict policy from app_private.legal_policy where singleton for share;
  if not policy.published then
    raise exception 'Legal documents are being finalized.' using errcode = '22023';
  end if;
  if p_required_revision is distinct from policy.required_revision
    or p_terms_version is distinct from policy.terms_version
    or p_privacy_version is distinct from policy.privacy_version
    or p_dpa_version is distinct from policy.dpa_version then
    raise exception 'Legal documents changed. Reload and review them.' using errcode = '22023';
  end if;
  insert into app_private.legal_acceptances
    (shop_id, auth_user_id, accepted_name, accepted_role, required_revision,
     terms_version, privacy_version, dpa_version)
  values (policy.shop_id, auth.uid(), actor.display_name, actor.role, policy.required_revision,
    policy.terms_version, policy.privacy_version, policy.dpa_version)
  on conflict (shop_id, required_revision) do nothing;
  return public.get_legal_status();
end $$;
revoke all on function public.accept_legal_terms(boolean,text,text,text,text) from public, anon;
grant execute on function public.accept_legal_terms(boolean,text,text,text,text) to authenticated;

-- Public reader gets publication/version metadata only; never identity or acceptance evidence.
create function public.get_legal_publication()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('published', published, 'required_revision', required_revision,
    'terms_version', terms_version, 'privacy_version', privacy_version, 'dpa_version', dpa_version)
  from app_private.legal_policy where singleton
$$;
revoke all on function public.get_legal_publication() from public;
grant execute on function public.get_legal_publication() to anon, authenticated;
