import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'

const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function turnstile(token: string, remoteIp: string | null) {
  if (!token || !TURNSTILE_SECRET) return false
  const form = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token })
  if (remoteIp) form.set('remoteip', remoteIp)
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
    })
    const result = await response.json().catch(() => ({ success: false }))
    return result.success === true
  } catch {
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false }, 405)
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').toLowerCase().trim()
    const remoteIp = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')
    if (!email || !await turnstile(String(body.turnstileToken ?? ''), remoteIp)) {
      return json({ ok: false, error: 'Verification failed.' }, 403)
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return json({ ok: false }, 503)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const [{ data: mapped }, { data: employee }, { data: shop }] = await Promise.all([
      admin.from('app_users').select('auth_user_id').eq('email', email).maybeSingle(),
      admin.from('employees').select('id').ilike('email', email).maybeSingle(),
      admin.from('shop_config').select('owner_email').eq('id', 1).single(),
    ])
    const eligible = Boolean(mapped || employee || String(shop?.owner_email ?? '').toLowerCase().trim() === email)
    if (eligible) {
      const { data: pending } = await admin.from('password_reset_requests')
        .select('id').eq('email', email).eq('status', 'Pending').limit(1)
      if (!pending?.length) await admin.from('password_reset_requests').insert({ email })
    }
    // Enumeration-resistant response: eligibility and insert outcome are never revealed.
    return json({ ok: true })
  } catch {
    return json({ ok: true })
  }
})
