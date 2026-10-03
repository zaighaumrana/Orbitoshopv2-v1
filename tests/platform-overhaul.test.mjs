import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,cpSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildRelease} from '../scripts/build-platform-release.mjs';
import {billingUsagePage} from '../src/admin/pages/billing-usage.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
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
  assert.equal(Object.hasOwn(f,'zip'),false);assert.equal(f.verify_jwt,f.name!=='platform-bridge');
  assert.ok(f.files.length>1);const paths=f.files.map(file=>file.path);
  assert.deepEqual(paths,[...paths].sort());assert.equal(new Set(paths).size,paths.length);
  assert.ok(paths.includes(f.entrypoint));
  for(const file of f.files){assert.ok(!file.path.includes('\\') && !file.path.includes('..') && file.path.endsWith('.ts'));assert.equal(file.content,read('supabase/functions/'+file.path));assert.equal(file.sha256,sha(file.content));}
  assert.equal(f.sha256,sha(JSON.stringify({name:f.name,entrypoint:f.entrypoint,verify_jwt:f.verify_jwt,files:f.files})));
 }
 assert.deepEqual(release.functions.find(f=>f.name==='account-admin').files.map(f=>f.path),['_shared/runtime-preflight.ts','account-admin/index.ts']);
 const {sha256,...contents}=release;assert.equal(sha256,sha(JSON.stringify(contents)));
 assert.deepEqual(release,buildRelease());assert.deepEqual(buildRelease(),buildRelease());
 assert.doesNotMatch(read('src/main.js'),/shop-release\.json/);
});

test('source-file release preserves shipped stage checksums only for unchanged approved inputs',()=>{
 const release=buildRelease(),legacy=JSON.parse(read('scripts/managed-release-v1-checksums.json'));
 assert.equal(release.stage_checksums.migrations,legacy.release_sha256);assert.equal(release.stage_checksums.functions,legacy.release_sha256);
 for(const f of release.functions)assert.equal(f.stage_sha256,legacy.functions.find(old=>old.name===f.name).stage_sha256);
 assert.notEqual(release.sha256,legacy.release_sha256);
});

test('changed source or JWT metadata cannot reuse an old successful function checksum',()=>{
 const fixture=mkdtempSync(join(tmpdir(),'orbito-release-'));
 assert.ok(resolve(fixture).startsWith(resolve(tmpdir())+'\\orbito-release-') || resolve(fixture).startsWith(resolve(tmpdir())+'/orbito-release-'));
 try {
  const root=resolve(import.meta.dirname,'..');
  for(const path of ['supabase/functions','supabase/migrations','supabase/config.toml'])cpSync(resolve(root,path),resolve(fixture,path),{recursive:true});
  const before=buildRelease(fixture),path=resolve(fixture,'supabase/functions/account-admin/index.ts');
  writeFileSync(path,readFileSync(path,'utf8')+'\n// Source change fixture.\n');
  const after=buildRelease(fixture),changed=after.functions.find(f=>f.name==='account-admin');
  assert.notEqual(after.sha256,before.sha256);assert.equal(after.stage_checksums.migrations,before.stage_checksums.migrations);
  assert.notEqual(after.stage_checksums.functions,before.stage_checksums.functions);assert.equal(changed.stage_sha256,changed.sha256);
  assert.equal(after.functions.find(f=>f.name==='login').stage_sha256,before.functions.find(f=>f.name==='login').stage_sha256);
  const config=resolve(fixture,'supabase/config.toml');writeFileSync(config,readFileSync(config,'utf8').replace(/(\[functions.platform-bridge\][\s\S]*?verify_jwt\s*=\s*)false/,'$1true'));
  const bridge=buildRelease(fixture).functions.find(f=>f.name==='platform-bridge');
  assert.equal(bridge.verify_jwt,true);assert.equal(bridge.stage_sha256,bridge.sha256);assert.notEqual(bridge.sha256,before.functions.find(f=>f.name==='platform-bridge').sha256);
 } finally {rmSync(fixture,{recursive:true,force:true});}
});
test('runtime diagnostics expose only known function/configuration booleans and preserve canonical readiness checks',()=>{
 const source=read('supabase/functions/_shared/runtime-preflight.ts');assert.match(source,/runtime_details/);assert.match(source,/runtime_checks:Object\.fromEntries\(required\.map\(k=>\[k,Boolean/);assert.match(source,/keys\.every\(k=>safeChecks\[k\]\)/);
});
