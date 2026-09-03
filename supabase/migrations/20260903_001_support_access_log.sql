-- Orbitoshopv2 V1
-- Migration: Orbito support access audit
-- Created: 2026-09-03

CREATE TABLE IF NOT EXISTS public.support_access_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    platform_user_id uuid NOT NULL,
    platform_email text NOT NULL,
    event text NOT NULL DEFAULT 'support_login',
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.support_access_log IS
'Server-written audit trail for successful Orbito platform support access.';

ALTER TABLE public.support_access_log
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE public.support_access_log
FROM anon, authenticated;

GRANT SELECT, INSERT
ON TABLE public.support_access_log
TO service_role;

REVOKE ALL
ON SEQUENCE public.support_access_log_id_seq
FROM anon, authenticated;

GRANT USAGE, SELECT
ON SEQUENCE public.support_access_log_id_seq
TO service_role;
