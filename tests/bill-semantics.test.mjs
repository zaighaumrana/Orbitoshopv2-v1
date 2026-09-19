import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { shouldLogLegacy } from '../src/platform/legacy.js'

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const executable=p=>read(p).replace(/^import .*$/gm,'').replace(/^export /gm,'')

test('invoice-only BILL wrappers retain canonical capture, payment exclusion and separate thermal/inventory',()=>{
 const original=read('supabase/migrations/20260917174024_phase4_platform_bridge.sql')
 const correction=read('supabase/migrations/20260919043803_phase4_invoice_creation_bill_semantics.sql')
 for(const operation of ['create_retail_sale','create_repair_ticket']) {
  assert.ok(original.includes(`'${operation}',p_request_id,'BILL'`))
  assert.ok(!correction.includes(`function public.${operation}(`),'Existing all-payment-method creation capture unchanged')
 }
 const payment=correction.slice(0,correction.indexOf('alter function'))
 assert.ok(payment.includes("'usageDelivery','none'"));assert.ok(!payment.includes('attach_usage_route'))
 assert.ok(correction.includes("result->'proposal'->>'decision'='Approved'"))
 assert.ok(correction.includes("result->'ticket'->>'id' is not null"))
 assert.ok(correction.includes("(result->'ticket'->>'request_id')::uuid,'BILL'"))
 assert.ok(original.includes("'create_inventory_item',p_request_id,'INVENTORY'"))
 assert.ok(original.includes('app_private.record_repair_payment('),'Settlement uses non-metering core')
 assert.ok(!read('src/print/print.js').includes('logBillEvent'))
 assert.ok(read('src/print/print.js').includes('queueThermalIntent'))
 assert.equal(shouldLogLegacy({usageDelivery:'bridge'}),false)
 assert.equal(shouldLogLegacy({usageDelivery:'none'}),false)
 assert.equal(shouldLogLegacy({usageDelivery:'legacy',idempotentReplay:true}),false)
})

test('retail cash/credit/mixed carts each call one creation RPC and one route-aware usage logger',async()=>{
 const calls=[],logs=[]
 const ctx=vm.createContext({CFG:{tax_rate:0},dlog(){},logBillEvent:r=>logs.push(r),sb:{async rpc(name,args){calls.push({name,args});return {data:{invoiceNumber:'FIXTURE',usageDelivery:'bridge',usageEventId:'event'}}}}})
 vm.runInContext(executable('src/features/pos/checkout/api.js'),ctx)
 for(const method of ['Cash','Udhar (Credit)','Split Payment']) {
  await ctx.finalizeCheckout({cart:[{name:'Quick',qty:1,originalPrice:10,soldPrice:10,isQuick:true,quickItemId:1},{name:'Inventory',qty:1,originalPrice:10,soldPrice:10,isInventory:true,inventoryId:1}],checkoutPayment:method,cashTendered:20,splitCash:10,splitDigital:10,udharPaidNow:0,requestId:method})
 }
 assert.equal(calls.length,3);assert.equal(logs.length,3)
 assert.ok(calls.every(c=>c.name==='create_retail_sale'&&c.args.p_lines.length===2))
 assert.ok(logs.every(r=>!shouldLogLegacy(r)),'Bridge-owned operations must not dual-send')
})

test('child approval logs only canonical invoices; pending/declined do not; timeout retains decision ID',async()=>{
 const calls=[],logs=[];let fail=false,id=0
 const ctx=vm.createContext({crypto:{randomUUID:()=>`id-${++id}`},logBillEvent:r=>logs.push(r),sb:{async rpc(name,args){
  calls.push({name,args});if(name==='save_additional_work_proposal')return {data:{id:1}}
  if(fail)return {error:{message:'timeout'}}
  return {data:{proposal:{decision:args.p_decision},ticket:args.p_decision==='Approved'?{id:2}:null,usageEventId:args.p_decision==='Approved'?'event':null,usageDelivery:'bridge'}}
 }}})
 vm.runInContext(executable('src/features/repairs/api.js'),ctx)
 for(const decision of ['Pending','Declined','Approved'])await ctx.recordAdditionalWork(1,'Work',[],5,decision,'Phone','')
 assert.equal(logs.length,1)
 fail=true;await ctx.decideAdditionalWork(2,'Approved','Phone','');const retryId=calls.at(-1).args.p_request_id
 fail=false;await ctx.decideAdditionalWork(2,'Approved','Phone','')
 assert.equal(calls.at(-1).args.p_request_id,retryId);assert.equal(logs.length,2)
 // Existing-invoice direct collection no longer calls any usage logger.
 vm.runInContext(executable('src/features/pos/repairs/api.js'),ctx)
 ctx.dlog=()=>{}
 await ctx.collectTicketPayment({id:1},5,'Cash','pay-id')
 assert.equal(logs.length,2)
})
