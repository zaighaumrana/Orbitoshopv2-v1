// Software print intent only; never evidence that paper physically printed.
export const THERMAL_WIDTH_MM = 80
export function measureThermal(heightPx, copies = 1, available = true) {
  if (!Number.isInteger(copies) || copies < 1 || copies > 20) throw new Error('Invalid copy count')
  const measured = available && Number.isFinite(heightPx) && heightPx > 0
  return { copies, estimated_mm: measured ? Math.ceil(heightPx * 25.4 / 96 + 6) * copies : null,
    paper_width_mm: THERMAL_WIDTH_MM, measurement_status: measured ? 'estimated' : 'unavailable',
    template_version: 'thermal-80-v1', measurement_version: 'css-height-v1', calibration_version: 'feed-6mm-v1' }
}

let client, actorId = null, flushing = false, database, retryTimer, flushRequested = false
function openQueue() {
  database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('orbito-thermal-intents-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('intents', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch(error => { database = null; throw error })
  return database
}
async function queueOperation(mode, action) {
  const db = await openQueue()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('intents', mode)
    const request = action(transaction.objectStore('intents'))
    transaction.oncomplete = () => resolve(request?.result)
    transaction.onerror = transaction.onabort = () => reject(transaction.error)
  })
}
export function installThermalMeter(supabase) {
  if (client) return
  client = supabase
  client.auth.onAuthStateChange((_event, session) => {
    actorId = session?.user?.id || null
    // Never await another Auth method inside the Auth state-change lock.
    setTimeout(() => { void flushThermalQueue() }, 0)
  })
  window.addEventListener('online', () => { void flushThermalQueue() })
}
export async function queueThermalIntent(intent) {
  if (!actorId) { console.warn('Print metering unavailable: no active identity.'); return }
  try {
    await queueOperation('readwrite', store => store.add({ id: crypto.randomUUID(), actorId, intent }))
    void flushThermalQueue()
  } catch { console.warn('Print metering could not be saved on this device. Printing remains available.') }
}
export async function flushThermalQueue() {
  if (flushing) { flushRequested = true; return }
  if (!client || !actorId || !navigator.onLine) return
  clearTimeout(retryTimer)
  flushing = true
  flushRequested = false
  let retry = false
  const actor = actorId
  try {
    const queued = await queueOperation('readonly', store => store.getAll())
    for (const entry of queued) {
      if (actorId !== actor) break
      if (entry.actorId !== actor) continue // Never resend another user's intent under this session.
      if (entry.deliveryState === 'rejected') continue // Retain evidence without head-of-line blocking.
      const { data, error } = await client.rpc('record_thermal_intent', {
        p_request_id: entry.id, p_actor_id: entry.actorId, p_intent: entry.intent,
      })
      if (error?.code === '22023') {
        await queueOperation('readwrite', store => store.put({ ...entry, deliveryState: 'rejected', rejectionCode: '22023' }))
        console.warn('A print measurement was rejected and retained for diagnosis.')
        continue
      }
      if (error || !data?.accepted) { retry = true; break }
      await queueOperation('readwrite', store => store.delete(entry.id))
    }
  } catch { retry = true /* Outage does not block printing or delete pending intent. */ }
  finally {
    flushing = false
    if (actorId && navigator.onLine && (retry || flushRequested || actorId !== actor)) {
      retryTimer = setTimeout(() => { void flushThermalQueue() }, retry ? 30000 : 0)
    }
  }
}
