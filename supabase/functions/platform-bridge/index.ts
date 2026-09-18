import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'

// Server-to-server only. No browser CORS or caller-supplied destination/source.
// Leave deployment and scheduling disabled until Platform implements contract v1.
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})
async function sameSecret(left: string, right: string) {
  if (!left || !right) return false
  const encode = new TextEncoder()
  const [a, b] = await Promise.all([left, right].map(s => crypto.subtle.digest('SHA-256', encode.encode(s))))
  return new Uint8Array(a).reduce((difference, byte, i) => difference | (byte ^ new Uint8Array(b)[i]), 0) === 0
}

Deno.serve(async req => {
  if (req.method !== 'POST') return reply(405, { error: 'POST required' })
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? ''
  if (!await sameSecret(token, serviceKey)) return reply(401, { error: 'Not authorized' })

  const endpoint = Deno.env.get('PLATFORM_BRIDGE_ENDPOINT') ?? ''
  const secret = Deno.env.get('PLATFORM_BRIDGE_SOURCE_SECRET') ?? ''
  if (!endpoint || !secret) return reply(200, { enabled: false })
  let destination: URL
  try {
    destination = new URL(endpoint)
    if (destination.protocol !== 'https:' || destination.username || destination.password) throw new Error()
  } catch { return reply(503, { error: 'Bridge configuration unavailable' }) }

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  try {
    const { data: batch, error } = await admin.rpc('bridge_claim_outbox', { p_limit: 50 })
    if (error) throw new Error('Could not lease outbox')
    if (!batch?.enabled) return reply(200, { enabled: false })

    // No network work occurs inside Shop financial transactions. Redirects are
    // rejected so the configured per-source credential cannot leak to another host.
    let response: any
    try {
      const received = await fetch(destination, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Authorization': `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema_version: 1, source_id: batch.source_id,
          client_binding: batch.client_binding, events: batch.events }),
      })
      if (!received.ok) throw new Error('Platform did not accept delivery')
      const text = await received.text()
      if (text.length > 1024 * 1024) throw new Error('Platform response too large')
      response = JSON.parse(text)
      if (response.schema_version !== 1 || response.source_id !== batch.source_id
        || !Array.isArray(response.acknowledgements)) throw new Error('Invalid Platform reply')
    } catch {
      await Promise.all(batch.events.map((event: any) => admin.rpc('bridge_finish_delivery', {
        p_event_id: event.event_id, p_lease_id: batch.lease_id, p_accepted: false,
      })))
      return reply(502, { error: 'Platform unavailable; events remain queued' })
    }

    let acknowledged = 0
    for (const event of batch.events) {
      const matches = response.acknowledgements.filter((ack: any) => ack?.event_id === event.event_id)
      // Duplicate/conflicting acknowledgements never silently count as accepted.
      const accepted = matches.length === 1 && ['accepted', 'duplicate'].includes(matches[0].status)
      const { data: done, error: ackError } = await admin.rpc('bridge_finish_delivery', {
        p_event_id: event.event_id, p_lease_id: batch.lease_id, p_accepted: accepted,
      })
      if (ackError) throw new Error('Could not persist delivery outcome')
      if (accepted && done) acknowledged++
    }
    // A failed projection does not roll back already durable per-event ACKs.
    if (response.billing != null) {
      const { error: projectionError } = await admin.rpc('bridge_apply_billing', {
        p_source_id: batch.source_id, p_version: response.billing.sync_version, p_payload: response.billing.payload,
      })
      if (projectionError) throw new Error('Billing revision rejected')
    }
    if (response.resupply_updates != null) {
      if (!Array.isArray(response.resupply_updates) || response.resupply_updates.length > 100) throw new Error('Invalid lifecycle revisions')
      for (const update of response.resupply_updates) {
        const { error: lifecycleError } = await admin.rpc('bridge_apply_resupply', {
          p_source_id: batch.source_id, p_request_id: update.request_id, p_version: update.sync_version,
          p_status: update.status, p_updated_at: update.platform_updated_at,
        })
        if (lifecycleError) throw new Error('Lifecycle revision rejected')
      }
    }
    return reply(200, { enabled: true, acknowledged })
  } catch {
    // Never return service secrets, remote payloads or financial internals.
    return reply(503, { error: 'Bridge synchronization incomplete; retry safely' })
  }
})
