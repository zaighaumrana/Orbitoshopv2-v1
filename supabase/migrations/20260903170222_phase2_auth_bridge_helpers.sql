-- Server-only verification bridge for hashed legacy credentials.
-- The password hash is never returned to an API caller.

create or replace function public.verify_legacy_credential(
  candidate_email text,
  candidate_password text
)
returns table (
  normalized_email text,
  identity_type text,
  employee_id integer,
  display_name text,
  app_role text,
  app_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    lac.normalized_email,
    lac.identity_type,
    lac.employee_id,
    case
      when lac.identity_type = 'owner' then 'Admin'::text
      else e.name
    end as display_name,
    case
      when lac.identity_type = 'owner' then 'Business Owner'::text
      else e.role
    end as app_role,
    case
      when lac.identity_type = 'owner' then 'Active'::text
      else e.status
    end as app_status
  from public.legacy_auth_credentials lac
  left join public.employees e on e.id = lac.employee_id
  where lac.normalized_email = lower(trim(candidate_email))
    and lac.password_hash = extensions.crypt(candidate_password, lac.password_hash)
    and lac.migrated_at is null
  limit 1
$$;

revoke all on function public.verify_legacy_credential(text, text) from public, anon, authenticated;
grant execute on function public.verify_legacy_credential(text, text) to service_role;
