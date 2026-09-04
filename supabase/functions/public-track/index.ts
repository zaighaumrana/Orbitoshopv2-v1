import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const columns = 'ticket_number, invoice_number, customer_name, customer_phone, device_brand, device_model, imei, status, created_at, estimated_quote, final_total, components_noted'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
const phoneDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '')
const maskImei = (value: unknown) => {
  const imei = String(value ?? '').trim()
  return imei.length >= 4 ? `••••${imei.slice(-4)}` : ''
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405)
  try {
    const body = await req.json().catch(() => ({}))
    const identifier = String(body.identifier ?? '').trim()
    const phone = phoneDigits(body.phone)
    if (!identifier || identifier.length > 80 || phone.length < 7 || phone.length > 20) {
      return json({ ok: false, error: 'Ticket and phone verification are required.' }, 400)
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return json({ ok: false, error: 'Tracking is unavailable.' }, 503)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: config, error: configError } = await admin
      .from('shop_config').select('live_tracking_enabled').eq('id', 1).single()
    if (configError || !config?.live_tracking_enabled) return json({ ok: false, error: 'Tracking is unavailable.' }, 403)

    let { data: ticket, error } = await admin.from('tickets').select(columns).eq('ticket_number', identifier).maybeSingle()
    if (!ticket && !error) {
      const byInvoice = await admin.from('tickets').select(columns).eq('invoice_number', identifier).limit(1).maybeSingle()
      ticket = byInvoice.data
      error = byInvoice.error
    }
    if (error || !ticket || phoneDigits(ticket.customer_phone) !== phone) {
      return json({ ok: false, error: 'No matching repair was found.' }, 404)
    }

    return json({
      ok: true,
      ticket: {
        ticket_number: ticket.ticket_number,
        invoice_number: ticket.invoice_number,
        customer_name: ticket.customer_name,
        device_brand: ticket.device_brand,
        device_model: ticket.device_model,
        imei_masked: maskImei(ticket.imei),
        status: ticket.status,
        created_at: ticket.created_at,
        estimated_quote: ticket.estimated_quote,
        final_total: ticket.final_total,
        components_noted: ticket.components_noted,
      },
    })
  } catch (error) {
    console.error('Public tracking failed.', error instanceof Error ? error.message : 'unknown error')
    return json({ ok: false, error: 'Tracking is unavailable.' }, 503)
  }
})
