-- Workshop uses technician_module_enabled. Keep the legacy column for compatibility;
-- remove only its unused client RPC projection. Existing function ACLs are retained.
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
