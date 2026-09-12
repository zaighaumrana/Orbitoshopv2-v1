import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PURPOSES = new Set(['admin', 'settle', 'return', 'discount', 'udhar', 'remove-component', 'repair-refund'])
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405)
  const authorization = req.headers.get('authorization') ?? ''
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token || !SUPABASE_URL || !SUPABASE_ANON || !SUPABASE_SERVICE_ROLE) {
    return json({ ok: false, error: 'Authentication failed.' }, 401)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const purpose = String(body.purpose ?? '')
    const pin = String(body.pin ?? '')
    if (!PURPOSES.has(purpose) || !/^[0-9]{4,6}$/.test(pin)) {
      return json({ ok: false, error: 'Verification failed.' }, 403)
    }

    const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    const auth = createClient(SUPABASE_URL, SUPABASE_ANON, opts)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, opts)
    const { data: userData, error: userError } = await auth.auth.getUser(token)
    if (userError || !userData.user) return json({ ok: false, error: 'Authentication failed.' }, 401)

    const { data: profile, error: profileError } = await admin
      .from('app_users').select('role, status').eq('auth_user_id', userData.user.id).single()
    if (profileError || !profile || profile.status !== 'Active') {
      return json({ ok: false, error: 'Authorization failed.' }, 403)
    }
    const { data: shop } = await admin.from('shop_config').select('suspended').eq('id', 1).single()
    if (shop?.suspended && profile.role !== 'Orbito Support') {
      return json({ ok: false, error: 'Authorization failed.' }, 403)
    }

    const { data: valid, error: verifyError } = await admin.rpc('verify_override_pin', { candidate_pin: pin })
    if (verifyError || valid !== true) return json({ ok: false, error: 'Verification failed.' }, 403)

    const expiresAt = new Date(Date.now() + 75_000).toISOString()
    const { error: insertError } = await admin.from('step_up_authorizations').insert({
      auth_user_id: userData.user.id,
      purpose,
      expires_at: expiresAt,
    })
    if (insertError) return json({ ok: false, error: 'Authorization could not be recorded.' }, 503)
    return json({ ok: true, purpose, expiresAt })
  } catch (error) {
    console.error('PIN verification failed.', error instanceof Error ? error.message : 'unknown error')
    return json({ ok: false, error: 'Verification is unavailable.' }, 503)
  }
})
