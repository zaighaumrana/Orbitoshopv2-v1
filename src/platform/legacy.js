import { createClient } from '@supabase/supabase-js'

let platform
// Isolated compatibility adapter. Never use this identity/rate for new bridge
// records. Legacy delivery is best-effort until Platform supports durable ingest.
export function shouldLogLegacy(result) {
  return result?.idempotentReplay !== true
    && (result?.usageDelivery == null || result.usageDelivery === 'legacy')
}

export async function logLegacyUsage(metric, result) {
  if (!shouldLogLegacy(result)) return
  try {
    const clientId = Number(import.meta.env.VITE_CLIENT_ID)
    if (!Number.isSafeInteger(clientId) || clientId <= 0) {
      console.warn('Legacy usage not sent: client identity is not configured.')
      return
    }
    platform ||= createClient(import.meta.env.VITE_PLATFORM_URL, import.meta.env.VITE_PLATFORM_ANON,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    const { error } = await platform.from('usage_logs').insert({
      client_id: clientId, module_type: metric, token_count: 1, rate_at_log: metric === 'BILL' ? 5 : 1,
    })
    if (error) console.warn('Legacy usage delivery failed.')
  } catch { console.warn('Legacy usage delivery unavailable.') }
}
