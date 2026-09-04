import { sb } from '../../../shared.js'
import { dlog } from '../../../debuglog.js'

export async function settleUdhar(account, amount, method) {
  dlog('udhar.settle', `ENTRY kind=${account?.kind} sourceId=${account?.sourceId} amount=${amount}`)
  if (!account?.kind || !account?.sourceId) {
    return { ok: false, error: 'Udhar account not found.' }
  }

  const { data, error } = await sb.rpc('settle_udhar', {
    p_request_id: crypto.randomUUID(),
    p_kind: account.kind,
    p_source_id: account.sourceId,
    p_amount: Number(amount),
    p_method: method,
    p_cash_tendered: method === 'Cash' ? Number(amount) : null,
  })

  if (error) {
    dlog('udhar.settle', `FAILED: ${error.message}`)
    return { ok: false, error: error.message }
  }
  dlog('udhar.settle', `SUCCEEDED replay=${Boolean(data?.idempotentReplay)}`)
  return { ok: true, account: data }
}
