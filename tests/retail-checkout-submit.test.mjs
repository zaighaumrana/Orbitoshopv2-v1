import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import {captureAuthority,setUIAuthority,invalidateUIAuthority} from '../src/ui-authority.js'

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
    posState, state, CFG:{tax_rate:0}, SESSION:{authUserId:'actor-A',employee:{name:'Fixture'}},
    captureAuthority:()=>()=>true,structuredClone,cartOperations:new Map(),
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

test('late checkout ACK remains original-actor owned after same-role/native-session replacement',async()=>{
 const pos=readFileSync(new URL('../src/pos/pos.js',import.meta.url),'utf8');
 const api=readFileSync(new URL('../src/features/pos/checkout/api.js',import.meta.url),'utf8');
 const start=pos.indexOf('async function _finalizeCheckout()'),end=pos.indexOf('/* ═',start);
 let complete,calls=0,reloads=0;const operations=new Map();
 setUIAuthority('actor-A:native-A');
 const old={cart:[{name:'A private item',qty:1,originalPrice:100,soldPrice:100}],checkoutPayment:'Cash',cashTendered:100};
 const ctx=vm.createContext({posState:old,state:{modal:null},CFG:{tax_rate:0},SESSION:{authUserId:'actor-A',employee:{name:'A'}},
  captureAuthority,structuredClone,cartOperations:operations,crypto:{randomUUID:()=> 'original-request'},
  sb:{rpc:(_name,args)=>{calls++;assert.equal(args.p_request_id,'original-request');return new Promise(r=>complete=r)}},
  dlog(){},logBillEvent(){},render(){},load:async()=>{reloads++},showBlockingError(){assert.fail('old response cannot show a B error')},confirmAction:async()=>{},window:{location:{pathname:'/pos'}}});
 vm.runInContext(`let checkoutInFlight=false;${api.replace(/^import .*$/gm,'').replace('export async function','async function')}\n${pos.slice(start,end)}\nglobalThis.submit=_finalizeCheckout`,ctx);
 const pending=ctx.submit();const retained=structuredClone(operations.get('original-request').inputs);
 invalidateUIAuthority();setUIAuthority('actor-B:native-B');ctx.posState={cart:[],cashTendered:0};ctx.SESSION={authUserId:'actor-B',employee:{name:'B'}};
 complete({data:{invoiceNumber:'A-INV',createdAt:'2026-10-25'}});await pending;
 assert.equal(calls,1);assert.equal(reloads,0);assert.equal(ctx.state.modal,null);assert.equal(ctx.posState.cart.length,0);
 const op=operations.get('original-request');assert.equal(op.actor,'actor-A');assert.equal(op.status,'succeeded');assert.equal(op.result.sale.receiptNo,'A-INV');assert.deepEqual(structuredClone(op.inputs),retained);
 assert.equal([...operations.values()].filter(o=>o.actor===ctx.SESSION.authUserId).length,0);
 setUIAuthority('actor-A:new-native');assert.equal(op.inputs.requestId,'original-request');assert.equal(calls,1,'return/reconciliation never replays a command');
 invalidateUIAuthority();
});
