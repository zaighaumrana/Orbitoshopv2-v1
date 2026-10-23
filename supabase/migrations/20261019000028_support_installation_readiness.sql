-- Additive optional capability; never part of the required POS preflight.
CREATE FUNCTION public.support_ticket_installation_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb;sc public.shop_config;b app_private.owner_bootstrap;u auth.users;
BEGIN
 c:=public.support_ticket_capability_context();
 SELECT * INTO sc FROM public.shop_config WHERE id=1;
 SELECT * INTO b FROM app_private.owner_bootstrap WHERE singleton;
 SELECT * INTO u FROM auth.users WHERE id=b.owner_auth_id;
 IF sc.onboarding_completed_at IS NULL OR b.owner_auth_id IS NULL
  OR public.bridge_runtime_preflight()->>'owner_account' IS DISTINCT FROM 'active'
  OR u.email_confirmed_at IS NULL OR u.deleted_at IS NOT NULL OR coalesce(u.is_anonymous,false)
  OR (u.banned_until IS NOT NULL AND u.banned_until>now())
  OR NOT EXISTS(SELECT 1 FROM public.app_users a WHERE a.auth_user_id=u.id AND a.status='Active'
    AND a.role='Business Owner' AND a.employee_id IS NULL AND lower(trim(a.email))=lower(trim(u.email)))
 THEN RAISE EXCEPTION 'Confirmed active owner and completed onboarding required' USING errcode='42501';END IF;
 RETURN c||jsonb_build_object('installation_version',2,'ready',true);
END $$;
REVOKE ALL ON FUNCTION public.support_ticket_installation_context() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.support_ticket_installation_context() TO service_role;
