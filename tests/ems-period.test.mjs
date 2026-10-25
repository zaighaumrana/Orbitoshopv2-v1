import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseAst} from 'rolldown/parseAst';
import {readComplete} from '../src/bounded-read.js';
import {settleRead} from '../src/read-state.js';

function harness(fail=false){
 const source=readFileSync(new URL('../src/features/admin/ems/index.js',import.meta.url),'utf8');
 const nodes=parseAst(source).body.map(n=>n.declaration||n).filter(n=>n.type==='FunctionDeclaration'&&['generateSalarySlip','countWorkingDays'].includes(n.id.name));
 const attendance=Array.from({length:20},(_,i)=>({id:i+1,employee_id:7,date:`2026-10-${String(i+1).padStart(2,'0')}`,clock_out:'2026-10-01T16:00:00Z'})).concat(Array.from({length:1001},(_,i)=>({id:i+21,employee_id:8,date:'2026-10-01',clock_out:'2026-10-01T16:00:00Z'})));
 const leaves=[{id:1,employee_id:7,status:'Approved',from_date:'2026-09-29',to_date:'2026-10-02'},{id:2,employee_id:7,status:'Approved',from_date:'2026-10-21',to_date:'2026-10-22'},{id:3,employee_id:7,status:'Approved',from_date:'2026-09-01',to_date:'2026-09-02'},{id:4,employee_id:7,status:'Rejected',from_date:'2026-10-23',to_date:'2026-10-24'}];
 const reads=[],writes=[];
 const query=table=>{
  const ops=[],q={};for(const op of ['select','eq','gte','lte','order','upsert'])q[op]=(...a)=>{ops.push([op,...a]);return q};
  q.single=async()=>{if(table==='salary_config')return {data:{salary_type:'Monthly',rate:1000}};const values=ops.find(([op])=>op==='upsert')[1];writes.push(values);return {data:{id:1,...values}}};
  q.range=async(from,to)=>{
   reads.push({table,from,to});if(fail&&table==='attendance')return {data:[],count:20};
   let rows=[...(table==='attendance'?attendance:leaves)];
   for(const [op,column,value] of ops){if(op==='eq')rows=rows.filter(r=>r[column]===value);if(op==='gte')rows=rows.filter(r=>r[column]>=value);if(op==='lte')rows=rows.filter(r=>r[column]<=value)}
   return {data:rows.slice(from,Math.min(to+1,from+7)),count:rows.length};
  };return q;
 };
 const ctx=vm.createContext({Date,Math,readComplete,settleRead,captureView:()=>()=>true,ViewExpired:Error,escapeHTML:String,sb:{from:query}});
 vm.runInContext(nodes.map(n=>source.slice(n.start,n.end)).join('\n')+';globalThis.generate=generateSalarySlip',ctx);
 return {ctx,reads,writes};
}
test('actual payroll reads complete selected period beyond API pages, independently of the attendance/directory view',async()=>{
 const f=harness(),result=await f.ctx.generate(7,10,2026,1);assert.equal(result.ok,true);assert.equal(f.writes.length,1);
 const slip=f.writes[0];assert.equal(slip.days_present,20);assert.equal(slip.leaves_approved,4);assert.equal(slip.days_absent,3);assert.ok(Math.abs(slip.net_salary-1000*(24/27))<.000001);
 assert.deepEqual(f.reads.filter(r=>r.table==='attendance').map(r=>r.from),[0,7,14]);
});
test('actual payroll refuses incomplete attendance before any salary write',async()=>{
 const f=harness(true),result=await f.ctx.generate(7,10,2026,1);assert.equal(result.ok,false);assert.match(result.error,/attendance.*unavailable/);assert.equal(f.writes.length,0);
});
