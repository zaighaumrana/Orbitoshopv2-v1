-- Server-only PIN hashing and verification. Plaintext values are never stored.

create or replace function public.set_override_pin(candidate_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if candidate_pin is null or candidate_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must contain 4 to 6 digits' using errcode = '22023';
  end if;

  insert into public.shop_security (id, override_pin_hash)
  values (1, extensions.crypt(candidate_pin, extensions.gen_salt('bf', 12)))
  on conflict (id) do update
    set override_pin_hash = excluded.override_pin_hash;
end;
$$;

create or replace function public.verify_override_pin(candidate_pin text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select ss.override_pin_hash = extensions.crypt(candidate_pin, ss.override_pin_hash)
    from public.shop_security ss
    where ss.id = 1 and ss.override_pin_hash is not null
  ), false)
$$;

revoke all on function public.set_override_pin(text) from public, anon, authenticated;
revoke all on function public.verify_override_pin(text) from public, anon, authenticated;
grant execute on function public.set_override_pin(text) to service_role;
grant execute on function public.verify_override_pin(text) to service_role;
