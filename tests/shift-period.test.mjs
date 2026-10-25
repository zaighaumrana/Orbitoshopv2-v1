import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {parseAst} from 'rolldown/parseAst';
import {localReportPeriod,actorPeriodRows} from '../src/datetime.js';

test('existing financial local-midnight period and canonical UUID fix reproduced UTC/name counter mismatch',()=>{
 const previous=process.env.TZ;process.env.TZ='Asia/Karachi';
 try {
  const now='2026-10-25T21:30:00Z',period=localReportPeriod(new Date(now));
  assert.deepEqual(period,{from:'2026-10-25T19:00:00.000Z',to:'2026-10-26T19:00:00.000Z',label:'2026-10-26'});
  const rows=[
   {id:1,created_at:'2026-10-25T20:30:00Z',created_by_auth_user_id:'actor-A',employee_name:'Former name',items_sold:[{qty:2}]},
   {id:2,created_at:'2026-10-25T18:00:00Z',created_by_auth_user_id:'actor-A',employee_name:'Current name',items_sold:[{qty:9}]},
   {id:3,created_at:'2026-10-25T21:00:00Z',created_by_auth_user_id:'actor-B',employee_name:'Current name',items_sold:[{qty:100}]},
   {id:4,created_at:'2026-10-25T21:00:00Z',created_by_auth_user_id:null,employee_name:'Current name',items_sold:[{qty:1000}]},
  ];
  const source=execFileSync('git',['show','4186b5181a39679b6c26637db295174346b25e4f:src/pos/pos.js'],{encoding:'utf8'});
  const node=parseAst(source).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='buildShiftStats');
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}}
  const ctx=vm.createContext({Date:Clock,currentTenant:()=>({name:'Synthetic'}),SESSION:{employee:{name:'Current name'}},state:{data:{sales:rows,tickets:[],shiftFinancial:{}}},resourceReady:()=>true,CFG:{},escapeHTML:String,moneyHTML:String});
  const html=vm.runInContext(source.slice(node.start,node.end)+';buildShiftStats()',ctx);
  assert.match(html,/Products sold<\/span><span>1109<\/span>/,'actual M1 renderer includes prior local day, same-name B and unmapped legacy row');
  assert.deepEqual(actorPeriodRows(rows,period,'actor-A').map(r=>r.id),[1]);
  assert.equal(actorPeriodRows(rows,period,'actor-A')[0].items_sold[0].qty,2);
  assert.deepEqual(actorPeriodRows([{id:5,created_at:period.to,created_by_auth_user_id:'actor-A'}],period,'actor-A'),[],'end is exclusive');
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
});
