-- Edge Functions use the built-in service_role client for trusted
-- Shop runtime state reads. RLS remains enabled for browser roles.
grant select on table public.shop_config to service_role;
