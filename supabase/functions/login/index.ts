// supabase/functions/login/index.ts
//
// Replaces the client-side login check that used to live in src/auth.js +
// src/shared.js's verifyLogin(). Both the owner comparison and the employee
// comparison now live in ONE function (verifyCredentials) below, so there is
// a single source of truth — a future change to how credentials are checked
// can no longer update one login path and silently miss the other.
//
// Flow: Turnstile siteverify -> verifyCredentials() -> JSON response shaped
// exactly like the old verifyLogin()/owner-branch result the frontend
// already expects: { ok, isAdmin, employee, error }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET') ?? ''
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/** Canonical Turnstile verification — POSTs to Cloudflare's siteverify endpoint. */
async function verifyTurnstile(token: string, remoteIp: string | null): Promise<boolean> {
  if (!token) return false
  const form = new URLSearchParams()
  form.set('secret', TURNSTILE_SECRET)
  form.set('response', token)
  if (remoteIp) form.set('remoteip', remoteIp)

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  const outcome = await res.json().catch(() => ({ success: false }))
  return outcome.success === true
}

/**
 * SINGLE SOURCE OF TRUTH for credential verification.
 * Mirrors the exact logic that used to be split across auth.js's owner
 * branch and shared.js's verifyLogin() — now unified so both paths are
 * always checked and updated together.
 */
async function verifyCredentials(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
  password: string,
): Promise<{ ok: boolean; isAdmin?: boolean; employee?: Record<string, unknown>; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim()

  // 1. Owner login — compared against shop_config, same as the old owner branch.
  const { data: cfg, error: cfgError } = await supabaseAdmin
    .from('shop_config')
    .select('owner_email, owner_password')
    .eq('id', 1)
    .single()

  if (!cfgError && cfg?.owner_email &&
      normalizedEmail === String(cfg.owner_email).toLowerCase() &&
      password === cfg.owner_password) {
    return {
      ok: true,
      isAdmin: true,
      employee: { name: 'Admin', role: 'Business Owner', email: normalizedEmail },
    }
  }

  // 2. Employee login — same lookup verifyLogin() used to do.
  const { data, error } = await supabaseAdmin
    .from('employees')
    .select('id, name, role, status, email')
    .eq('email', normalizedEmail)
    .eq('password', password)
    .eq('status', 'Active')
    .single()

  if (error || !data) return { ok: false, error: 'Incorrect email or password.' }

  return {
    ok: true,
    isAdmin: false,
    employee: { id: data.id, name: data.name, role: data.role, email: data.email },
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  let body: { email?: string; password?: string; turnstileToken?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400)
  }

  const { email, password, turnstileToken } = body
  if (!email || !password) {
    return json({ ok: false, error: 'Email and password are required.' }, 400)
  }

  const remoteIp = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')
  const turnstileOk = await verifyTurnstile(turnstileToken ?? '', remoteIp)
  if (!turnstileOk) {
    return json({ ok: false, error: 'Verification failed. Please try again.' }, 403)
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
  const result = await verifyCredentials(supabaseAdmin, email, password)

  if (!result.ok) return json(result, 401)
  return json(result, 200)
})
