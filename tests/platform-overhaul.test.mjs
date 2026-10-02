import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {billingUsagePage} from '../src/admin/pages/billing-usage.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('billing issued-invoice copy follows actual projection rows, including zero',()=>{
 const result={available:true,last_synced_at:new Date().toISOString(),projection:{platform_updated_at:new Date().toISOString(),currency:'PKR',usage:{BILL:0,INVENTORY:0},invoices:[],outstanding_total:0}};
 const empty=billingUsagePage(result);assert.match(empty,/No issued invoices yet\./);assert.doesNotMatch(empty,/latest 25 issued/);
 result.projection.invoices=[{reference:'INV-42',period:'Test',status:'Unpaid',outstanding:10}];
 assert.match(billingUsagePage(result),/Showing up to the latest 25 issued invoices\. Outstanding total includes all issued invoices\./);
});
test('approved server release exactly matches current migrations and all six function gateway settings',()=>{
 const release=JSON.parse(read('../orbito/supabase/functions/_shared/shop-release.json'));
 for(const m of release.migrations){const src=read('supabase/migrations/'+m.version+'_'+m.name+'.sql').replaceAll('\r\n','\n');assert.equal(m.sql,src);assert.equal(m.sha256,createHash('sha256').update(src).digest('hex'));}
 assert.equal(release.functions.length,6);
 for(const f of release.functions){
  const zip=Buffer.from(f.zip,'base64');assert.equal(f.sha256,createHash('sha256').update(zip).digest('hex'));assert.equal(f.verify_jwt,f.name!=='platform-bridge');
  let offset=0,files=0;while(zip.readUInt32LE(offset)===0x04034b50){const size=zip.readUInt32LE(offset+18),nameLength=zip.readUInt16LE(offset+26),extraLength=zip.readUInt16LE(offset+28);assert.equal(zip.readUInt16LE(offset+8),0);const name=zip.subarray(offset+30,offset+30+nameLength).toString();assert.ok(!name.includes('..') && name.endsWith('.ts'));const start=offset+30+nameLength+extraLength;assert.equal(zip.subarray(start,start+size).toString(),read('supabase/functions/'+name));offset=start+size;files++;}assert.ok(files>1);
 }
 assert.doesNotMatch(read('src/main.js'),/shop-release\.json/);
});
test('runtime diagnostics expose only known function/configuration booleans and preserve canonical readiness checks',()=>{
 const source=read('supabase/functions/_shared/runtime-preflight.ts');assert.match(source,/runtime_details/);assert.match(source,/runtime_checks:Object\.fromEntries\(required\.map\(k=>\[k,Boolean/);assert.match(source,/keys\.every\(k=>safeChecks\[k\]\)/);
});
