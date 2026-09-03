-- Hash legacy login credentials and the override PIN before neutralizing the
-- browser-readable plaintext columns. This migration never emits their values.

insert into public.legacy_auth_credentials (
  normalized_email, identity_type, employee_id, password_hash
)
select
  lower(trim(sc.owner_email)),
  'owner',
  null,
  extensions.crypt(sc.owner_password, extensions.gen_salt('bf', 12))
from public.shop_config sc
where sc.id = 1
  and nullif(trim(sc.owner_email), '') is not null
  and nullif(sc.owner_password, '') is not null
  and not exists (
    select 1 from public.app_users au
    where lower(trim(au.email)) = lower(trim(sc.owner_email))
  );

insert into public.legacy_auth_credentials (
  normalized_email, identity_type, employee_id, password_hash
)
select
  lower(trim(e.email)),
  'employee',
  e.id,
  extensions.crypt(e.password, extensions.gen_salt('bf', 12))
from public.employees e
where nullif(trim(e.email), '') is not null
  and nullif(e.password, '') is not null
  and not exists (
    select 1 from public.app_users au where au.employee_id = e.id
  );

update public.shop_security ss
set override_pin_hash = extensions.crypt(sc.override_pin, extensions.gen_salt('bf', 12))
from public.shop_config sc
where ss.id = 1
  and sc.id = 1
  and nullif(sc.override_pin, '') is not null;

update public.employees
set password = null
where password is not null;

update public.shop_config
set owner_password = null,
    override_pin = null
where id = 1;
