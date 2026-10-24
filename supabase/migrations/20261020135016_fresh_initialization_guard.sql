-- Forward-only detection, never an automatic timestamp/owner/configuration reset.
begin;
create function public.fresh_shop_initialization_context() returns jsonb
language plpgsql security definer set search_path='' as $$
declare sc public.shop_config%rowtype; bc app_private.bridge_config%rowtype;
begin
 select * into strict sc from public.shop_config where id=1 for share;
 select * into strict bc from app_private.bridge_config where singleton for share;
 return jsonb_build_object('pending',sc.onboarding_version=0 and sc.onboarding_completed_at is null
  and sc.platform_client_id is null and bc.client_binding is null and not bc.delivery_enabled
  and bc.usage_mode='legacy' and bc.last_sequence=0
  and not exists(select 1 from app_private.owner_bootstrap)
  and not exists(select 1 from public.app_users)
  and not exists(select 1 from auth.users)
  and not exists(select 1 from public.sales) and not exists(select 1 from public.tickets)
  and not exists(select 1 from app_private.bridge_events),
  'onboarding_version',sc.onboarding_version,'completed',sc.onboarding_completed_at is not null);
end $$;
revoke all on function public.fresh_shop_initialization_context() from public,anon,authenticated;
grant execute on function public.fresh_shop_initialization_context() to service_role;
commit;
