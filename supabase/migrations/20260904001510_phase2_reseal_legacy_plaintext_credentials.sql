-- Phase 2 follow-up: remove any plaintext credentials reintroduced by a
-- pre-cutover legacy client and make the hashed credential stores the only
-- permitted persistence path.

update public.employees
set password = null
where password is not null;

update public.shop_config
set owner_password = null,
    override_pin = null
where owner_password is not null
   or override_pin is not null;

alter table public.employees
  add constraint employees_legacy_password_must_be_null
  check (password is null);

alter table public.shop_config
  add constraint shop_config_legacy_credentials_must_be_null
  check (owner_password is null and override_pin is null);

comment on constraint employees_legacy_password_must_be_null on public.employees is
  'Phase 2: plaintext employee passwords are forbidden; legacy verification uses legacy_auth_credentials hashes.';

comment on constraint shop_config_legacy_credentials_must_be_null on public.shop_config is
  'Phase 2: plaintext owner passwords and override PINs are forbidden; use Supabase Auth and shop_security hashes.';
