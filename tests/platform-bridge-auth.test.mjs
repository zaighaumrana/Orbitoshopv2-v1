import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const source = read('supabase/functions/platform-bridge/index.ts')
// Deliberately non-production, distinct fixtures. No live clients or networking.
const callSecret = 'fixture-call-only', serviceKey = 'fixture-db-only', sourceSecret = 'fixture-ingest-only'
function fixture({ configured = callSecret, acks, fetchFails = false, done = true } = {}) {
  const calls = [], deliveries = [], clients = []
  const batch = {
    enabled: true, source_id: 'fixture-source', client_binding: 'fixture-client', lease_id: 'fixture-lease',
    events: ['BILL', 'INVENTORY', 'THERMAL'].map((metric, i) => ({
      event_id: `event-${i}`, sequence: 7 + i, body: { metric, quantity: 1 },
    })),
  }
  let handler
  const context = vm.createContext({
    Response, URL, TextEncoder, Uint8Array, crypto, AbortSignal,
    Deno: { env: { get: key => ({
      PLATFORM_BRIDGE_CALL_SECRET: configured, SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      PLATFORM_BRIDGE_SOURCE_SECRET: sourceSecret, PLATFORM_BRIDGE_ENDPOINT: 'https://fixture.invalid/ingest',
      SUPABASE_URL: 'https://fixture.supabase.co',
    })[key] }, serve: fn => { handler = fn } },
    createClient(url, key) {
      clients.push({ url, key })
      return { async rpc(name, args) {
        calls.push({ name, args })
        return { data: name === 'bridge_claim_outbox' ? batch : done, error: null }
      } }
    },
    async fetch(url, options) {
      deliveries.push({ url: String(url), options })
      if (fetchFails) throw Error('Fixture network failure')
      return new Response(JSON.stringify({ schema_version: 1, source_id: batch.source_id,
        acknowledgements: acks ?? batch.events.map(e => ({ event_id: e.event_id, status: 'accepted' })),
      }))
    },
  })
  vm.runInContext(stripTypeScriptTypes(source.replace(/^import .*$/gm, '')), context)
  return { calls, clients, deliveries, batch,
    invoke: (token, method = 'POST') => handler(new Request('https://fixture.invalid', {
      method, headers: token == null ? {} : { authorization: `Bearer ${token}` },
    })),
  }
}

test('bridge caller boundary rejects missing/wrong/legacy credentials before DB or delivery', async () => {
  for (const token of [undefined, '', 'wrong', serviceKey, sourceSecret]) {
    const f = fixture()
    const response = await f.invoke(token)
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'Not authorized' })
    assert.equal(f.clients.length + f.calls.length + f.deliveries.length, 0)
  }
  for (const token of [callSecret, serviceKey]) {
    const f = fixture({ configured: '' })
    assert.equal((await f.invoke(token)).status, 401, 'missing config has no fallback')
    assert.equal(f.clients.length, 0)
  }
  assert.equal((await fixture().invoke(callSecret, 'GET')).status, 405)
})

test('correct opaque caller key preserves claim, envelope, event sequences, lease and outbound source key', async () => {
  const f = fixture()
  const response = await f.invoke(callSecret)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { enabled: true, acknowledged: 3 })
  assert.equal(f.clients[0].key, serviceKey, 'DB uses its own credential')
  assert.equal(f.calls[0].name, 'bridge_claim_outbox')
  assert.equal(f.calls[0].args.p_limit, 50)
  const { options } = f.deliveries[0]
  assert.equal(options.headers.Authorization, `Bearer ${sourceSecret}`)
  assert.equal(options.redirect, 'error')
  assert.deepEqual(JSON.parse(options.body), { schema_version: 1, source_id: f.batch.source_id,
    client_binding: f.batch.client_binding, events: f.batch.events })
  for (const call of f.calls.slice(1)) {
    assert.equal(call.name, 'bridge_finish_delivery')
    assert.equal(call.args.p_lease_id, f.batch.lease_id)
    assert.equal(call.args.p_accepted, true)
  }
})

test('duplicate-status ACK works, duplicate/missing ACK entries do not; failed leases never count', async () => {
  const acks = [
    { event_id: 'event-0', status: 'duplicate' },
    { event_id: 'event-1', status: 'accepted' }, { event_id: 'event-1', status: 'duplicate' },
  ]
  const f = fixture({ acks })
  assert.equal((await (await f.invoke(callSecret)).json()).acknowledged, 1)
  assert.deepEqual(f.calls.slice(1).map(c => c.args.p_accepted), [true, false, false])
  const stale = fixture({ done: false })
  assert.equal((await (await stale.invoke(callSecret)).json()).acknowledged, 0)
  const offline = fixture({ fetchFails: true })
  assert.equal((await offline.invoke(callSecret)).status, 502)
  assert.ok(offline.calls.slice(1).every(c => c.args.p_accepted === false && c.args.p_lease_id === offline.batch.lease_id))
})

test('only bridge opts out of gateway JWT; opaque call secret is not an account-admin credential', async () => {
  const config = read('supabase/config.toml').replace(/\r\n/g, '\n').replace(/^#.*$/gm, '').trim()
  const functions = [...config.matchAll(/\[functions\.([^\]]+)\]\s*verify_jwt = (true|false)/g)]
  assert.deepEqual(functions.filter(entry => entry[2] === 'false').map(entry => entry[1]), ['platform-bridge'])
  assert.ok(functions.some(entry => entry[1] === 'platform-bridge'))
  for (const entry of readdirSync(new URL('../supabase/functions/', import.meta.url), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'platform-bridge' || entry.name.startsWith('_')) continue
    assert.doesNotMatch(read(`supabase/functions/${entry.name}/index.ts`), /PLATFORM_BRIDGE_CALL_SECRET/)
  }
  const ctx = vm.createContext({ Response, URL, Deno: { serve() {}, env: { get: () => 'fixture' } },
    createClient: () => ({ auth: { getUser: async token => {
      assert.equal(token, callSecret)
      return { data: { user: null }, error: { message: 'Not a user JWT' } }
    } } }),
  })
  vm.runInContext(stripTypeScriptTypes(read('supabase/functions/account-admin/index.ts').replace(/^import .*$/gm, '')), ctx)
  assert.equal(await ctx.context(new Request('https://fixture.invalid', { headers: { authorization: `Bearer ${callSecret}` } })), null)
})
