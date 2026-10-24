-- Customer Support only. Existing login, bridge and privileged handoff are unchanged.
CREATE FUNCTION public.support_ticket_actor_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := auth.uid(); sid uuid; u auth.users; a public.app_users;
  sc public.shop_config; bc app_private.bridge_config;
BEGIN
  BEGIN sid := (auth.jwt()->>'session_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Support authorization denied' USING errcode='42501';
  END;
  SELECT * INTO u FROM auth.users WHERE id=actor;
  IF NOT FOUND OR u.email_confirmed_at IS NULL OR coalesce(u.is_anonymous,false)
     OR u.deleted_at IS NOT NULL OR (u.banned_until IS NOT NULL AND u.banned_until>now())
     OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=sid AND s.user_id=actor
                    AND s.created_at IS NOT NULL AND (s.not_after IS NULL OR s.not_after>now()))
  THEN RAISE EXCEPTION 'Support authorization denied' USING errcode='42501'; END IF;
  SELECT * INTO a FROM public.app_users WHERE auth_user_id=actor;
  IF NOT FOUND OR a.status IS DISTINCT FROM 'Active'
     OR NOT coalesce(a.role=ANY(ARRAY['Business Owner','Manager']),false)
     OR lower(trim(a.email)) IS DISTINCT FROM lower(trim(u.email))
     OR app_private.current_app_role() IS DISTINCT FROM a.role
     OR NOT coalesce(app_private.current_client_access_allowed(),false)
  THEN RAISE EXCEPTION 'Support authorization denied' USING errcode='42501'; END IF;
  IF (a.role='Business Owner' AND a.employee_id IS NOT NULL)
     OR (a.role='Manager' AND NOT EXISTS (SELECT 1 FROM public.employees e
            WHERE e.id=a.employee_id AND e.status='Active' AND e.role=a.role AND lower(trim(e.email))=lower(trim(a.email))))
  THEN RAISE EXCEPTION 'Support authorization denied' USING errcode='42501'; END IF;
  SELECT * INTO sc FROM public.shop_config WHERE id=1;
  SELECT * INTO bc FROM app_private.bridge_config WHERE singleton;
  IF sc.onboarding_version IS DISTINCT FROM 2 OR sc.suspended IS DISTINCT FROM false
     OR coalesce(sc.platform_client_id,0)<1 OR bc.source_id IS NULL
     OR nullif(trim(bc.client_binding),'') IS NULL
  THEN RAISE EXCEPTION 'Support authorization denied' USING errcode='42501'; END IF;
  RETURN jsonb_build_object('auth_user_id',actor,'session_id',sid,'role',a.role,
    'employee_id',a.employee_id,'platform_client_id',sc.platform_client_id,
    'source_id',bc.source_id,'client_binding',bc.client_binding);
END $$;
REVOKE ALL ON FUNCTION public.support_ticket_actor_context() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.support_ticket_actor_context() TO authenticated;

-- Non-secret installation proof. Only the server probe can call this; it grants
-- no user ticket authority and never changes owner/bootstrap/bridge state.
CREATE FUNCTION public.support_ticket_capability_context() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE sc public.shop_config;bc app_private.bridge_config;
BEGIN
 SELECT * INTO sc FROM public.shop_config WHERE id=1;
 SELECT * INTO bc FROM app_private.bridge_config WHERE singleton;
 IF sc.onboarding_version IS DISTINCT FROM 2 OR sc.suspended IS DISTINCT FROM false
  OR coalesce(sc.platform_client_id,0)<1 OR bc.source_id IS NULL OR nullif(trim(bc.client_binding),'') IS NULL
 THEN RAISE EXCEPTION 'Eligible paired Shop required' USING errcode='42501';END IF;
 RETURN jsonb_build_object('source_id',bc.source_id,'client_binding',bc.client_binding,'platform_client_id',sc.platform_client_id);
END $$;
REVOKE ALL ON FUNCTION public.support_ticket_capability_context() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.support_ticket_capability_context() TO service_role;
