import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {searchPattern} from '../src/bounded-read.js';
const source=readFileSync(new URL('./performance-browser.mjs',import.meta.url),'utf8');
function model(){const rows={inventory:[{id:7,name:'Zeta',qty:10},{id:3,name:'Alpha',qty:2},{id:8,name:'Alpha',qty:3},{id:9,name:'Part,%_"',qty:1},{id:10,name:'Alpha extra',qty:0}]};const ctx=vm.createContext({rows,cap:2});vm.runInContext(source.slice(source.indexOf('function like('),source.indexOf('function rpcResult('))+';globalThis.model={resultFor,like,orMatch};',ctx);return ctx.model;}
test('controlled benchmark models literal search, counts and stable multi-column pages before recording timings',()=>{
 const m=model();assert.equal(m.like('Alpha','Alpha'),true);assert.equal(m.like('Alpha extra','Alpha'),false);
 assert.equal(m.orMatch({name:'Part,%_"'},'name.ilike.'+searchPattern('Part,%_"')),true);
 const result=m.resultFor({table:'inventory',ops:[['select','id,name',{count:'exact'}],['gt','qty',0],['order','name'],['order','id'],['range',0,1]]});
 assert.equal(result.count,4);assert.deepEqual(Array.from(result.data,r=>r.id),[3,8]);
 const found=m.resultFor({table:'inventory',ops:[['select','id,name',{count:'exact'}],['or','name.ilike.'+searchPattern('Part,%_"')],['range',0,24]]});
 assert.equal(found.count,1);assert.equal(found.data[0].id,9);
});
