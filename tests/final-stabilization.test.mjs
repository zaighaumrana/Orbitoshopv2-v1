import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {validatePublicConfig} from '../scripts/byo-public-config.mjs';
import {diagnosticFor} from '../scripts/byo-diagnostics.mjs';
import {upgradePlan,upgradeStep} from '../scripts/upgrade-backend.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('S-01 missing Turnstile stays disabled; ordinary and verified builds share public validation',()=>{
 const nodes={app:{},'cf-turnstile-wrap':{},'login-btn':{}},ctx={ENV:{},document:{getElementById:id=>nodes[id]||null},window:{},CFG:{},escapeHTML:v=>String(v||''),safeImageURL:v=>v,PRODUCT_NAME:'Fixture',SHORT_BRAND_NAME:'Fixture',PROJECT_ATTRIBUTION:{},dstack:()=>{}};
 vm.createContext(ctx);const source=read('src/auth.js').replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?$/gm,'').replace(/^import ['"][^'"]+['"]\r?$/gm,'').replace(/^export /gm,'').replaceAll('import.meta.env','ENV');vm.runInContext(source,ctx);ctx.renderLogin(()=>{});
 assert.equal(nodes['login-btn'].disabled,true);assert.match(nodes['cf-turnstile-wrap'].textContent,/not configured/);assert.doesNotMatch(read('src/auth.js'),/0x4AAAAAADl87EDGnxcg5eJZ/);
 assert.match(read('vite.config.js'),/validatePublicConfig\(config,ref\)/);assert.throws(()=>validatePublicConfig({VITE_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',VITE_SUPABASE_ANON:'invalid',VITE_TURNSTILE_SITE_KEY:'missing'},'abcdefghijklmnopqrst'));
});
test('S-03 leave → return → newer Paper response → older response cannot alter data or successor busy state',async()=>{
 const source=read('src/admin/admin.js'),start=source.indexOf("    if (['paper-resupply','paper-refresh'].includes"),end=source.indexOf("    if (el.dataset.action === 'print-ticket-slip')",start),block=source.slice(start,end);
 let epoch=1;const pending=[],ctx={SESSION:{authUserId:'owner'},state:{role:'Business Owner'},adminState:{adminModule:'billing-usage'},window:{location:{pathname:'/admin/billing-usage'}},el:{dataset:{action:'paper-refresh'}},can:()=>true,resupplyBusy:false,billingResult:{},paperObservation:{},render:()=>{},adminNavigationIsCurrent:()=>epoch===1,platformBridge:{readBilling:()=>new Promise(r=>pending.push(r))},Date};vm.createContext(ctx);
 const first=vm.runInContext('(async()=>{'+block+'})()',ctx);epoch=2;ctx.adminNavigationIsCurrent=()=>epoch===2;ctx.resupplyBusy=false;
 const second=vm.runInContext('(async()=>{'+block+'})()',ctx);pending[1]({marker:'new',paper_requests:[]});await second;const observation=ctx.paperObservation;ctx.resupplyBusy=true;
 pending[0]({marker:'old',paper_requests:[]});await first;assert.equal(ctx.billingResult.marker,'new');assert.equal(ctx.paperObservation,observation);assert.equal(ctx.resupplyBusy,true);
});
test('S-02 maps remaining local/provider boundaries without interpolating private errors',()=>{
 assert.equal(diagnosticFor(Error('CLI failed or outcome is uncertain.'),{writes:'possible'}).category,'unknown_write');
 assert.match(diagnosticFor(Error('Existing Shop requires the dedicated additive upgrade workflow')).next_action,/Existing-shop-upgrade/);
 assert.doesNotMatch(JSON.stringify(diagnosticFor(Error('private-value-from-provider'))),/private-value-from-provider/);
});
test('additive upgrade preserves exact prefix checks and fences unknown function writes',async()=>{
 const sha=v=>createHash('sha256').update(v).digest('hex'),migrations=Array.from({length:33},(_,i)=>({version:String(i).padStart(14,'0'),name:'m'+i,sql:'select '+i+';',sha256:sha('select '+i+';')}));
 const history=migrations.slice(0,32).map(m=>({version:m.version,name:m.name,statements:[m.sql]}));assert.equal(upgradePlan(history,{migrations},{migrations:32},1).length,1);history[0].statements=['changed'];assert.throws(()=>upgradePlan(history,{migrations},{migrations:32},1),/conflict/);
 const journal={steps:{}},save=()=>{};let writes=0;await assert.rejects(()=>upgradeStep(journal,save,'function:login',()=>{writes++;throw Error('lost')}),/unknown/);await assert.rejects(()=>upgradeStep(journal,save,'function:login',()=>writes++),/attestation/);assert.equal(writes,1);
});
