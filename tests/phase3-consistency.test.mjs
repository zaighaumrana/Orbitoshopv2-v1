import test from 'node:test'
import assert from 'node:assert/strict'
import {databaseDate, localDateKey, localDateTime} from '../src/datetime.js'
import {buildReceiptRecords,filterReceiptRecords} from '../src/features/admin/checkout/receipts.js'

process.env.TZ = 'Asia/Karachi'
test('UTC legacy placed_at equals offset timestamp and displays next local day',()=>{
  assert.equal(databaseDate('2026-09-15T20:38:00').getTime(),databaseDate('2026-09-15T20:38:00Z').getTime())
  assert.equal(localDateKey('2026-09-15T20:38:00'),'2026-09-16')
  assert.equal(databaseDate('2026-09-15T20:38:00').getHours(),1)
  assert.match(localDateTime('2026-09-15T20:38:00'),/1:38/)
  assert.equal(databaseDate('2026-09-16T01:38:00+05:00').getTime(),databaseDate('2026-09-15T20:38:00Z').getTime())
})
test('receipt local-day filtering retains family order and separate retail receipts',()=>{
  const tickets=[{id:1,invoice_number:'PARENT',placed_at:'2026-09-15T20:38:00'},
    {id:2,parent_ticket_id:1,invoice_number:'CHILD-A',created_at:'2026-09-16T00:00:00Z'},
    {id:3,parent_ticket_id:1,invoice_number:'CHILD-B',created_at:'2026-09-16T01:00:00Z'}]
  const records=buildReceiptRecords([{id:4,invoice_number:'RETAIL',created_at:'2026-09-16T01:00:00Z'}],tickets)
  for(const [search,expected] of [['PARENT',['PARENT','CHILD-A','CHILD-B']],['CHILD-B',['CHILD-B','PARENT','CHILD-A']]]){
    assert.deepEqual(filterReceiptRecords(records,{receiptSearch:search,receiptDateFrom:'2026-09-16',receiptDateTo:'2026-09-16'}).map(r=>r.invoiceNumber),expected)
  }
  assert.equal(filterReceiptRecords(records,{receiptSearch:'RETAIL'}).length,1)
  assert.equal(filterReceiptRecords(records,{receiptType:'retail'}).length,1)
})
