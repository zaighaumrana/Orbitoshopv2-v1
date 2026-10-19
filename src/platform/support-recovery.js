// Optional tab recovery for an already attempted request. Never an authority cache.
export const RECOVERY_KEY = 'retrasell.support.pending.v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const lifetime = 6 * 60 * 60 * 1000
export function validPending(p) {
  return p && Object.keys(p).sort().join(',') === 'action,category,message,request_id,subject' &&
    p.action === 'create' && UUID.test(p.request_id) &&
    ['technical','billing_question','account','other'].includes(p.category) &&
    typeof p.subject === 'string' && [...p.subject].length >= 1 && [...p.subject].length <= 160 &&
    typeof p.message === 'string' && [...p.message].length >= 1 && [...p.message].length <= 4000
}
export function recoveryStore(storage, now = Date.now) {
  const clear = () => { try { storage?.removeItem(RECOVERY_KEY) } catch {} }
  return { clear,
    save(scope, pending) {
      if (!validPending(pending)) { clear(); return }
      try { storage?.setItem(RECOVERY_KEY, JSON.stringify({version:1,scope,expires:now()+lifetime,pending})) } catch {}
    },
    restore(scope) {
      try {
        const raw = storage?.getItem(RECOVERY_KEY)
        if (!raw) return null
        if (raw.length > 24000) { clear(); return null }
        const r = JSON.parse(raw)
        if (r.version !== 1 || r.scope !== scope || r.expires <= now() || r.expires > now()+lifetime || !validPending(r.pending)) { clear(); return null }
        return r.pending
      } catch { clear(); return null }
    },
  }
}
