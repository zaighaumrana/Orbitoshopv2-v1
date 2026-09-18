import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

test('retail checkout submits once across RPC/reload and retains request ID on failure', async () => {
  const pos = readFileSync(new URL('../src/pos/pos.js', import.meta.url), 'utf8')
  const api = readFileSync(new URL('../src/features/pos/checkout/api.js', import.meta.url), 'utf8')
  // Execute the actual checkout orchestration and payload builder with only I/O stubbed.
  const start = pos.indexOf('async function _finalizeCheckout()')
  const end = pos.indexOf('/* ═', start)
  const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
  const calls = [], errors = []
  let rpcGate = deferred(), reloadGate = deferred(), ids = 0
  const cart = () => [{ name:'Test item', qty:1, originalPrice:100, soldPrice:100 }]
  const posState = { cart:cart(), checkoutPayment:'Cash', cashTendered:100 }
  const state = { modal:null }
  const context = vm.createContext({
    posState, state, CFG:{tax_rate:0}, SESSION:{employee:{name:'Fixture'}},
    crypto:{randomUUID:()=>`request-${++ids}`},
    sb:{rpc(name, args) { calls.push({name,args}); return rpcGate.promise }},
    dlog(){}, logBillEvent(){}, render(){},
    load:()=>reloadGate.promise, showBlockingError:message=>errors.push(message),
    confirmAction:async()=>{}, window:{location:{pathname:'/pos'}},
  })
  vm.runInContext(`let checkoutInFlight = false;\n${api.replace(/^import .*$/gm, '').replace('export async function', 'async function')}\n${pos.slice(start,end)}\nglobalThis.submit = _finalizeCheckout`, context)
  const first = context.submit()
  const duplicate = context.submit()
  assert.equal(calls.length, 1, 'rapid second activation must not send another RPC')
  await duplicate
  rpcGate.resolve({data:{invoiceNumber:'INV-1',createdAt:'2026-09-19'}})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(posState.cart.length, 0)
  await context.submit() // Old checkout button during post-success reload.
  assert.equal(calls.length, 1, 'cleared cart must never reach the RPC')
  reloadGate.resolve(); await first
  await context.submit()
  assert.equal(calls.length, 1)
  assert.equal(state.modal.type, 'receipt')
  assert.equal(errors.length, 0)

  posState.cart=cart();posState.cashTendered=100;rpcGate=deferred()
  const failed=context.submit()
  const retryId=calls.at(-1).args.p_request_id
  rpcGate.resolve({error:{message:'Fixture transient failure'}});await failed
  assert.equal(posState.checkoutRequestId,retryId)
  assert.equal(posState.cart.length,1)
  rpcGate=deferred()
  const retry=context.submit()
  assert.equal(calls.at(-1).args.p_request_id,retryId)
  assert.notEqual(retryId,calls[0].args.p_request_id)
  rpcGate.resolve({data:{invoiceNumber:'INV-2',createdAt:'2026-09-19'}});await retry
  assert.equal(calls.length,3)
  assert.equal(errors.length,1,'only the genuine failed attempt reports an error')
  assert.ok(calls.every(call=>call.name==='create_retail_sale'&&call.args.p_lines.length===1))
})
