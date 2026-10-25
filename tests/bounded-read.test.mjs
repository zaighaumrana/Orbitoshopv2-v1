import test from 'node:test';
import assert from 'node:assert/strict';
import {readPage,readComplete,searchColumns} from '../src/bounded-read.js';

function fixture(length,cap=1000){
 const rows=Array.from({length},(_,id)=>({id,name:'same timestamp/name'}));const calls=[];
 return {rows,calls,query:()=>({range:async(from,to)=>{calls.push([from,to]);return {data:rows.slice(from,Math.min(to+1,from+cap)),count:rows.length,error:null}}})};
}
test('existing-query paging reaches cap boundaries and old selected rows without gaps/duplicates',async()=>{
 for(const count of [999,1000,1001,10000]){
  const f=fixture(count),all=await readComplete(f.query,{size:100,maxRows:10000});assert.equal(all.data.length,count);assert.equal(all.data.at(-1).id,count-1);assert.ok(f.calls.every(([a,b])=>b-a<100));
 }
 const f=fixture(57,7),rows=[];let offset=0;
 do{const page=await readPage(f.query,{offset,size:25});rows.push(...page.data);offset=page.nextOffset;if(!page.hasMore)break;}while(true);
 assert.deepEqual(rows,f.rows,'short API pages are not treated as the complete list');
});
test('count drift, duplicate pages, failed pages and departed owners never yield complete detail',async()=>{
 const f=fixture(101);let n=0;
 await assert.rejects(readComplete(()=>({range:async(a,b)=>{const r=await f.query().range(a,b);if(n++)r.count++;return r}})),/changed/);
 await assert.rejects(readComplete(()=>({range:async()=>({data:[{id:1}],count:2})})),/changed/);
 await assert.rejects(readPage(()=>({range:async()=>({error:Error('denied')})})),/denied/);
 let current=true;await assert.rejects(readPage(()=>({range:async()=>{current=false;return {data:[],count:0}}}),{current:()=>current}),/expired/);
});
test('remote search covers authorized columns and quotes filter punctuation literally',()=>{
 let filter;searchColumns({or:value=>{filter=value}},['name','sku'],'older,item%_"');
 assert.equal(filter,'name.ilike."%older,item\\%\\_\\"%",sku.ilike."%older,item\\%\\_\\"%"');
});
