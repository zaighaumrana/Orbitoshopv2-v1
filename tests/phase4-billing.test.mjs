import test from 'node:test'
import assert from 'node:assert/strict'
import { billingUsagePage } from '../src/admin/pages/billing-usage.js'
import { createPlatformBridge } from '../src/platform/bridge.js'
import { shouldLogLegacy } from '../src/platform/legacy.js'

test('legacy compatibility never dual-sends bridge events or replays', () => {
  assert.equal(shouldLogLegacy({ usageDelivery: 'legacy', idempotentReplay: false }), true)
  assert.equal(shouldLogLegacy({ usageDelivery: 'bridge', idempotentReplay: false }), false)
  assert.equal(shouldLogLegacy({ usageDelivery: 'legacy', idempotentReplay: true }), false)
  assert.equal(shouldLogLegacy({ usageDelivery: 'none' }), false)
  assert.equal(shouldLogLegacy({ idempotentReplay: false }), true) // pre-migration server
})

test('missing billing is unavailable, not zero or paid', () => {
  const html = billingUsagePage({ available: false })
  assert.match(html, /Unavailable/)
  assert.doesNotMatch(html, /PKR 0|Request Resupply/)
})

test('billing escapes invoice text, shows stale and nullable amounts, hides internal metrics', () => {
  const result = { available: true, last_synced_at: '2026-01-01', projection: {
    currency: 'PKR', usage: { BILL: 2, INVENTORY: null }, outstanding_total: 70,
    estimated_current_charges: null, recent_billing: '<img onerror=alert(1)>',
    invoices: [{ reference: '<script>', period: 'September', status: 'partially_paid', outstanding: 70 }],
    paper_resupply_enabled: false, thermal_mm: 12345,
  } }
  const html = billingUsagePage(result)
  assert.match(html, /out of date/); assert.match(html, /&lt;script&gt;/)
  assert.match(html, /Unavailable/); assert.match(html, /PKR 70/)
  assert.doesNotMatch(html, /<script>|<img|12345|Request Resupply/)
  result.projection.paper_resupply_enabled = true
  assert.match(billingUsagePage(result), /Request Resupply/)
})

test('resupply double click coalesces and timeout/reload retries same identity', async () => {
  const values = new Map()
  const storage = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) }
  const ids = []; let fail = true
  const client = { async rpc(name, args) {
    assert.equal(name, 'request_paper_resupply'); ids.push(args.p_request_id)
    return fail ? { error: new Error('timeout') } : { data: { accepted: true } }
  } }
  const bridge = createPlatformBridge(client, storage)
  const first = bridge.requestResupply('owner'); const second = bridge.requestResupply('owner')
  assert.equal(first, second)
  await assert.rejects(first, /timeout/)
  fail = false
  await createPlatformBridge(client, storage).requestResupply('owner')
  assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]); assert.equal(values.size, 0)
})
