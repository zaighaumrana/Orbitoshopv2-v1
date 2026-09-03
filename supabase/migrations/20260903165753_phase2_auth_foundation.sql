-- Orbitoshopv2 Phase 2: additive Supabase Auth authorization foundation.
-- This migration intentionally does not tighten policies on legacy tables yet.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated, service_role;

create table public.app_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  employee_id integer unique references public.employees(id) on delete restrict,
  email text not null,
  display_name text not null,
  role text not null check (role in (
    'Business Owner', 'Manager', 'Cashier', 'Technician', 'Orbito Support'
  )),
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_identity_shape check (
    (role in ('Business Owner', 'Orbito Support') and employee_id is null)
    or
    (role in ('Manager', 'Cashier', 'Technician') and employee_id is not null)
  )
);

create unique index app_users_normalized_email_key
  on public.app_users (lower(trim(email)));
create unique index app_users_single_owner_key
  on public.app_users (role)
  where role = 'Business Owner';
create unique index app_users_single_support_key
  on public.app_users (role)
  where role = 'Orbito Support';
create index app_users_active_role_idx
  on public.app_users (role, status);

comment on table public.app_users is
  'Canonical application authorization identity. Never authorize from browser state or user_metadata.';

create table public.legacy_auth_credentials (
  normalized_email text primary key,
  identity_type text not null check (identity_type in ('owner', 'employee')),
  employee_id integer unique references public.employees(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now(),
  migrated_at timestamptz,
  constraint legacy_auth_identity_shape check (
    (identity_type = 'owner' and employee_id is null)
    or
    (identity_type = 'employee' and employee_id is not null)
  )
);

comment on table public.legacy_auth_credentials is
  'Server-only one-time migration vault. Contains password hashes only.';

create table public.shop_security (
  id integer primary key default 1 check (id = 1),
  override_pin_hash text,
  updated_at timestamptz not null default now()
);

comment on table public.shop_security is
  'Server-only shop security material. Never expose this table to browser roles.';

insert into public.shop_security (id) values (1)
on conflict (id) do nothing;

create table public.step_up_authorizations (
  id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in (
    'admin', 'settle', 'return', 'discount', 'udhar', 'remove-component'
  )),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint step_up_expiry_after_creation check (expires_at > created_at)
);

create index step_up_authorizations_lookup_idx
  on public.step_up_authorizations (auth_user_id, purpose, expires_at desc);

comment on table public.step_up_authorizations is
  'Short-lived server-created authorizations bound to one Auth user and exact purpose.';

alter table public.app_users enable row level security;
alter table public.legacy_auth_credentials enable row level security;
alter table public.shop_security enable row level security;
alter table public.step_up_authorizations enable row level security;

revoke all on table public.app_users from anon, authenticated;
grant select on table public.app_users to authenticated;
grant all on table public.app_users to service_role;

revoke all on table public.legacy_auth_credentials from anon, authenticated;
grant all on table public.legacy_auth_credentials to service_role;

revoke all on table public.shop_security from anon, authenticated;
grant all on table public.shop_security to service_role;

revoke all on table public.step_up_authorizations from anon, authenticated;
grant all on table public.step_up_authorizations to service_role;

create policy app_users_select_self
  on public.app_users
  for select
  to authenticated
  using ((select auth.uid()) = auth_user_id);

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function app_private.touch_updated_at() from public, anon, authenticated;

create trigger app_users_touch_updated_at
before update on public.app_users
for each row execute function app_private.touch_updated_at();

create trigger shop_security_touch_updated_at
before update on public.shop_security
for each row execute function app_private.touch_updated_at();

create or replace function app_private.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select au.role
  from public.app_users au
  where au.auth_user_id = (select auth.uid())
    and au.status = 'Active'
  limit 1
$$;

create or replace function app_private.current_employee_id()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select au.employee_id
  from public.app_users au
  where au.auth_user_id = (select auth.uid())
    and au.status = 'Active'
  limit 1
$$;

create or replace function app_private.current_app_user_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and au.status = 'Active'
  )
$$;

create or replace function app_private.current_client_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users au
    where au.auth_user_id = (select auth.uid())
      and au.status = 'Active'
      and (
        au.role = 'Orbito Support'
        or exists (
          select 1
          from public.shop_config sc
          where sc.id = 1 and coalesce(sc.suspended, false) = false
        )
      )
  )
$$;

create or replace function app_private.has_step_up(requested_purpose text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.step_up_authorizations sua
    where sua.auth_user_id = (select auth.uid())
      and sua.purpose = requested_purpose
      and sua.expires_at > now()
  )
$$;

revoke all on function app_private.current_app_role() from public, anon;
revoke all on function app_private.current_employee_id() from public, anon;
revoke all on function app_private.current_app_user_active() from public, anon;
revoke all on function app_private.current_client_access_allowed() from public, anon;
revoke all on function app_private.has_step_up(text) from public, anon;

grant execute on function app_private.current_app_role() to authenticated, service_role;
grant execute on function app_private.current_employee_id() to authenticated, service_role;
grant execute on function app_private.current_app_user_active() to authenticated, service_role;
grant execute on function app_private.current_client_access_allowed() to authenticated, service_role;
grant execute on function app_private.has_step_up(text) to authenticated, service_role;

create or replace function public.get_public_shop_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'shop_name', sc.shop_name,
    'shop_address', sc.shop_address,
    'shop_phone', sc.shop_phone,
    'shop_logo', sc.shop_logo,
    'shop_description', sc.shop_description,
    'primary_color', sc.primary_color,
    'secondary_color', sc.secondary_color,
    'suspended', coalesce(sc.suspended, false),
    'live_tracking_enabled', coalesce(sc.live_tracking_enabled, false)
  )
  from public.shop_config sc
  where sc.id = 1
$$;

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
    'workshop_enabled', sc.workshop_enabled,
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

revoke all on function public.get_public_shop_config() from public;
grant execute on function public.get_public_shop_config() to anon, authenticated, service_role;

revoke all on function public.get_app_config() from public, anon;
grant execute on function public.get_app_config() to authenticated, service_role;

alter table public.support_access_log
  add column if not exists client_auth_user_id uuid references auth.users(id) on delete set null;
