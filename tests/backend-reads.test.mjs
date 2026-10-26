import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {readComplete} from '../src/bounded-read.js'
import {buildReceiptRecords,filterReceiptRecords} from '../src/features/admin/checkout/receipts.js'
const source=readFileSync(new URL('../src/backend-reads.js',import.meta.url),'utf8')
function harness(){
  const CFG={read_contracts:{}},calls=[],rows=[{id:1,invoice_number:'ROOT',created_at:'2025-01-01T10:00:00Z',status:'Pending'},...Array.from({length:1001},(_,i)=>({id:i+2,parent_ticket_id:1,invoice_number:'CHILD-'+i,created_at:'2026-10-25T10:00:00Z',status:'Ready'}))]
  let reply={contract:1,offset:0,size:25,count:1,rows:[{id:1}],statusCounts:{Pending:1}}
  const sb={rpc:async(name,args)=>{calls.push({name,args});return typeof reply==='function'?reply():{data:reply}},from:table=>{
    let data=rows;const q={select(){return q},in(key,ids){data=data.filter(r=>ids.includes(r[key]));return q},is(key,value){data=data.filter(r=>(r[key]??null)===value);return q},order(){return q},async range(a,b){calls.push({table,a,b});return {data:data.slice(a,Math.min(b+1,a+7)),count:data.length}}};return q
  }}
  const ctx=vm.createContext({CFG,sb,readComplete,buildReceiptRecords,filterReceiptRecords,Date})
  vm.runInContext(source.replace(/^import .*$/gm,'').replace(/^export /gm,'')+';globalThis.api={repairFamilyPage,receiptArchivePage,receiptPeriod,decodeReadPage};',ctx)
  return {...ctx.api,CFG,calls,rows,setReply:value=>reply=value}
}
test('new reads require advertised capability and selected families remain complete below the API cap',async()=>{
  const f=harness();await assert.rejects(f.repairFamilyPage(),/unavailable/);assert.equal(f.calls.length,0)
  f.CFG.read_contracts={repair_families:1};const page=await f.repairFamilyPage({search:'CHILD-1000'})
  assert.equal(page.count,1);assert.equal(page.nextOffset,1);assert.equal(page.data.length,1002)
  assert.deepEqual(Array.from(page.rootIds),[1]);assert.equal(new Set(page.data.map(r=>r.id)).size,1002)
  assert.equal(f.calls[0].args.p_search,'CHILD-1000');assert.ok(f.calls.filter(c=>c.table).every(c=>c.b-c.a<100))
})
test('exact child invoice uses complete cross-date family and inherited ordering; normal archive stays a header page',async()=>{
  const f=harness();f.CFG.read_contracts={receipt_archive:1}
  f.setReply({contract:1,offset:0,size:25,count:1002,mode:'family',matches:[{id:1002,rootTicketId:1}],rows:[]})
  const page=await f.receiptArchivePage({receiptSearch:'CHILD-1000',receiptType:'all'})
  assert.equal(page.mode,'family');assert.equal(page.data[0].id,1002);assert.equal(page.data[1].id,1);assert.equal(page.data.length,1002);assert.equal(page.hasMore,false)
  f.calls.length=0;f.setReply({contract:1,offset:0,size:25,count:10001,mode:'page',matches:[],rows:[{key:'sale:3',id:3}]})
  const headers=await f.receiptArchivePage({});assert.equal(headers.count,10001);assert.equal(headers.data.length,1);assert.equal(f.calls.length,1,'No full-history/detail read for an ordinary archive page')
})
test('stale RPCs, wrong root selection and ambiguous response counts cannot publish a complete result',async()=>{
  const f=harness();f.CFG.read_contracts={repair_families:1,receipt_archive:1};let current=true
  f.setReply(async()=>{current=false;return {data:{}}});await assert.rejects(f.repairFamilyPage({current:()=>current}),/expired/)
  f.setReply({contract:1,offset:0,size:25,count:1,rows:[{id:99}]});await assert.rejects(f.repairFamilyPage(),/roots changed/)
  f.setReply({contract:1,offset:0,size:25,count:2,mode:'family',matches:[{rootTicketId:1}],rows:[]});await assert.rejects(f.receiptArchivePage({receiptSearch:'CHILD-1000'}),/family changed/)
  assert.throws(()=>f.decodeReadPage({contract:1,offset:0,size:25,count:2,rows:[{id:1},{id:1}]}),/duplicate/)
  assert.throws(()=>f.decodeReadPage({contract:1,offset:0,size:25,count:1,rows:[{id:Number.MAX_SAFE_INTEGER+1}]}),/numeric bound/)
})
test('receipt bounds preserve browser-local days and DST rather than inventing a database timezone policy',()=>{
  const previous=process.env.TZ
  try{
    process.env.TZ='Asia/Karachi';assert.deepEqual(JSON.parse(JSON.stringify(harness().receiptPeriod({receiptDateFrom:'2026-10-25',receiptDateTo:'2026-10-25'}))),{p_from:'2026-10-24T19:00:00.000Z',p_to:'2026-10-25T19:00:00.000Z'})
    process.env.TZ='America/New_York';assert.deepEqual(JSON.parse(JSON.stringify(harness().receiptPeriod({receiptDateFrom:'2026-11-01',receiptDateTo:'2026-11-01'}))),{p_from:'2026-11-01T04:00:00.000Z',p_to:'2026-11-02T05:00:00.000Z'})
  }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
})
