// Independent complete-fixture oracles for the Track B approval decision.
// Passing means the inherited capped-query defect is reproduced, not fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {findRepairFamilies} from '../src/features/repairs/family.js';
import {buildReceiptRecords,filterReceiptRecords} from '../src/features/admin/checkout/receipts.js';

test('member-page matching loses the older root and cannot count distinct matching families',()=>{
 const root={id:1,parent_ticket_id:null,customer_name:'Older root',invoice_number:'ROOT',created_at:'2020-01-01T12:00:00Z'};
 const children=Array.from({length:1001},(_,i)=>({id:i+2,parent_ticket_id:1,customer_name:'Recent child',invoice_number:'CHILD-'+i,created_at:'2026-10-25T12:00:00Z'}));
 const complete=[root,...children];
 assert.equal(findRepairFamilies(complete,'CHILD-1000').length,1);
 assert.equal(findRepairFamilies(children.slice(-1000),'CHILD-1000').length,0);
 assert.equal(new Set(children.slice(0,25).map(r=>r.parent_ticket_id)).size,1);
 assert.equal(children.length,1001,'member count is not the matching family count');
});
test('independent sale/ticket pages cannot provide canonical receipt dedup or cross-date child expansion',()=>{
 const root={id:1,parent_ticket_id:null,invoice_number:'ROOT',created_at:'2020-01-01T12:00:00Z'};
 const child={id:2,parent_ticket_id:1,invoice_number:'CHILD',created_at:'2026-10-25T12:00:00Z'};
 const sale={id:3,ticket_id:1,invoice_number:'ROOT',created_at:'2026-10-25T12:00:00Z'};
 const full=buildReceiptRecords([sale],[root,child]);
 assert.deepEqual(full.map(r=>r.key).sort(),['ticket:1','ticket:2']);
 assert.ok(buildReceiptRecords([sale],[child]).some(r=>r.key==='sale:3'),'missing off-page repair makes a duplicate sale appear valid');
 const selection={receiptSearch:'CHILD',receiptDateFrom:'2026-10-25',receiptDateTo:'2026-10-25'};
 assert.equal(filterReceiptRecords(full,selection).length,2,'exact child invoice expands its complete family across dates');
 assert.equal(filterReceiptRecords(buildReceiptRecords([],[child]),selection).length,1);
});
