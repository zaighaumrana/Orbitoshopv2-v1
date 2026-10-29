import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const shop=path.resolve(import.meta.dirname,'..'),out=process.env.POS_EVIDENCE_DIR;if(!out)throw Error('Set POS_EVIDENCE_DIR to an owned external evidence directory.');fs.mkdirSync(out,{recursive:true});
const {createServer}=await import(pathToFileURL(path.join(shop,'node_modules/vite/dist/node/index.js')));
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const {resourceFixture}=await import(pathToFileURL(path.join(shop,'tests/helpers/resource-fixture.mjs')));
const source=fs.readFileSync(path.join(shop,'tests/shop-entry-browser.mjs'),'utf8'),fixture=source.slice(source.indexOf('function fixture(){'),source.indexOf('\nlet browser;'));
const result={kind:'author loopback actual Shop entry + synthetic SDK; external requests blocked',checks:[],geometry:[],errors:[],external:[]};
const server=await createServer({configFile:false,envDir:false,root:shop,server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_SUPABASE_ANON':JSON.stringify('synthetic-public'),'import.meta.env.VITE_TURNSTILE_SITE_KEY':JSON.stringify('synthetic-site')},plugins:[{name:'pos-sdk',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0pos-sdk':null,load:id=>id==='\0pos-sdk'?'export const createClient=()=>window.fixtureSDK;':null}]});
let browser;
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.request().url()==='https://challenges.cloudflare.com/turnstile/v0/api.js'?r.fulfill({contentType:'application/javascript',body:'/* fixture */'}):(result.external.push(r.request().url()),r.abort()));
 await context.addInitScript({content:fixture+';fixture();'});await context.addInitScript(resourceFixture);

 await context.addInitScript(()=>{
  const rpc=window.fixtureSDK.rpc;window.fixtureSDK.rpc=async(name,args)=>{const r=await rpc(name,args);if(name==='get_app_config'&&r.data)r.data={...r.data,read_contracts:{catalog_icons:1}};return r};
  if(location.search.includes('entryHold=1'))window.fixtureHoldTable='inventory'
  window.fixtureRows={quick_items:[
   {id:1,name:'Legacy numeric',prices:[100],icon_id:'accessory.cable'},
   {id:2,name:'Mixed legacy',prices:[null,100],icon_id:'accessory.cover'},
   {id:3,name:'Variant Cable',prices:[{name:'A',price:125},{name:'B',price:200}],icon_id:'accessory.cable'},
   {id:4,name:'Invalid prices',prices:[null,'',false,{},[],{price:'10'},{price:-1}]},
   {id:5,name:'Empty prices',prices:[]},{id:6,name:'Malformed prices',prices:{price:20}},
   {id:7,name:'No icon variants',prices:[10,20]},
   {id:8,name:'Future icon variants',prices:[{price:30},{name:'Named',price:40}],icon_id:'accessory.future'}
  ].map((r,i)=>({...r,sort_order:i})),inventory:[],tickets:[],employees:[],sales:[],returns:[]};
 });
 const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>result.errors.push(e.message));
 const open=async()=>{await page.goto(origin+'/pos?fixtureAuth=signed&fixtureRole=Business%20Owner');await page.locator('[data-qitem-id="1"]').waitFor()};
 const rows=()=>page.locator('.rs-cart-line');const total=()=>page.locator('.cart .total-row.grand strong').innerText();
 const search=page.locator('[data-quick-search]');
 const forged=async id=>page.evaluate(id=>{const b=document.createElement('button');b.dataset.qitemId=id;b.dataset.qitemName='Forged outgoing row';document.querySelector('.rs-catalog-panel').append(b);b.click();b.remove()},String(id));
 const iconMatches=async(index,id)=>page.locator('.rs-cart-line .rs-item-icon').nth(index).evaluate(async(el,id)=>{const {artwork}=await import('/src/catalog/artwork.js');const t=document.createElement('template');t.innerHTML=artwork[id];return el.innerHTML===t.content.firstChild.innerHTML},id);
 await open();assert.equal(await page.locator('[data-qitem-id]').count(),8);
 for(const id of [4,5,6]){assert.equal(await page.locator('[data-qitem-id="'+id+'"]').isDisabled(),true);await forged(id)}assert.equal(await rows().count(),0);
 await page.locator('[data-qitem-id="2"]').click();assert.equal(await rows().count(),1);assert.match(await total(),/100/);await page.locator('[data-qty][data-delta="-1"]').click();assert.equal(await rows().count(),0);
 await page.locator('[data-qitem-id="1"]').click();assert.equal(await iconMatches(0,'accessory.cable'),true);assert.match(await total(),/100/);
 result.checks.push('POS-AUD-01: raw [null,100], malformed/non-array/empty and invalid-only entries render safely; invalid entries cannot add; valid legacy 100 unchanged');
 // Audit reproduction: input then Cart update in the same event-loop turn, BEFORE debounce.
 await page.evaluate(()=>{window.fixtureHoldTable='quick_items';const input=document.querySelector('[data-quick-search]');input.focus();input.value='Variant';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-qty][data-delta="1"]').click()});
 await forged(1);assert.equal(await rows().count(),1);assert.match(await total(),/200/);await page.waitForFunction(()=>window.fixtureReleases.length===1);
 // Pending network response must also survive Cart removal without outgoing actionability.
 await page.locator('[data-qty][data-delta="-1"]').click();await page.locator('[data-qty][data-delta="-1"]').click();await forged(1);assert.equal(await rows().count(),0);
 await page.evaluate(()=>window.fixtureReleases.shift()());await page.locator('[data-qitem-id="3"]').waitFor();assert.equal(await page.locator('[data-qitem-id]').count(),3);await forged(1);assert.equal(await rows().count(),0);
 await page.locator('[data-qitem-id="3"]').click();await page.locator('[data-pick-price="1"]').waitFor();
 // Existing modal context must survive a normal render and a changed accepted Catalog page.
 await page.evaluate(()=>document.querySelector('[data-action="theme"]').click());
 await page.locator('[data-pick-price="1"]').click();assert.equal(await iconMatches(0,'accessory.cable'),true);assert.match(await rows().first().innerText(),/B/);assert.match(await total(),/200/);
 await page.locator('[data-qty][data-delta="1"]').click();assert.match(await total(),/400/);assert.equal(await iconMatches(0,'accessory.cable'),true);
 result.checks.push('Integrated journey/POS-AUD-02/03: held search plus quantity/removal cannot add stale rows; current named variant retains assigned cable, B price 200 and qty2 total400 after rerenders');
 // Old response after new accepted response.
 await page.evaluate(()=>window.fixtureHoldTable='quick_items');await search.fill('Legacy');await page.waitForFunction(()=>window.fixtureReleases.length===1);await search.fill('Variant');await page.locator('[data-qitem-id="3"]').waitFor();await page.evaluate(()=>window.fixtureReleases.shift()());await page.waitForTimeout(50);assert.equal(await search.inputValue(),'Variant');assert.equal(await page.locator('[data-qitem-id="1"]').count(),0);await forged(1);assert.equal(await rows().count(),1);
 await page.evaluate(()=>window.fixtureReadFailures=['quick_items']);await search.fill('failed-current');await page.getByRole('heading',{name:'Catalog unavailable'}).waitFor();await forged(3);assert.equal(await rows().count(),1);
 await page.evaluate(()=>window.fixtureReadFailures=[]);await search.fill('');await page.locator('[data-qitem-id="1"]').waitFor();
 const count=await page.evaluate(()=>window.resourceCalls.filter(c=>c.table==='quick_items').length);
 await page.evaluate(()=>{const i=document.querySelector('[data-quick-search]');for(const q of ['V','Va','Variant']){i.value=q;i.dispatchEvent(new Event('input',{bubbles:true}))}i.focus();i.setSelectionRange(3,3);window.searchNode=i;i.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));document.querySelector('[data-qty][data-delta="1"]').click()});
 assert.equal(await page.evaluate(()=>document.activeElement===window.searchNode&&document.querySelector('[data-quick-search]')===window.searchNode&&window.searchNode.selectionStart===3),true);await page.evaluate(()=>window.searchNode.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await page.locator('[data-qitem-id="3"]').waitFor();assert.equal(await page.evaluate(()=>window.resourceCalls.filter(c=>c.table==='quick_items').length)-count,1);
 result.checks.push('POS-AUD-02: older response rejected, failed search stays nonactionable, clear succeeds, rapid inputs yield one request, focus/caret/composition node retained through Cart render');
 await page.locator('[data-qitem-id="7"]').click();await page.evaluate(()=>{document.querySelector('[data-qty][data-delta="1"]').click();document.querySelector('[data-qty][data-delta="-1"]').click()});await page.locator('[data-pick-price="1"]').click();assert.equal(await iconMatches(1,'generic.item'),true);
 await page.locator('[data-qitem-id="8"]').click();await page.locator('[data-pick-price="1"]').click();assert.equal(await iconMatches(2,'generic.item'),true);assert.match(await rows().nth(2).innerText(),/Named/);assert.match(await total(),/660/);
 result.checks.push('POS-AUD-03: unassigned and future icon variants use terminal fallback without changing selected prices or totals');
 await page.evaluate(()=>window.fixtureHoldTable='quick_items');await search.fill('Legacy');await page.waitForFunction(()=>window.fixtureReleases.length===1);await page.evaluate(async()=>{(await import('/src/router.js')).navigate('/admin/catalog')});await page.waitForURL('**/admin/catalog');await page.evaluate(()=>window.fixtureReleases.shift()());await page.waitForTimeout(50);assert.equal(await page.locator('.rs-catalog-panel').count(),0);
 // Admin formatting uses the same validity boundary and keeps original removal indices.
 await page.locator('[data-action="open-add-quick-item"]').waitFor();assert.match(await page.locator('#app').innerText(),/Price unavailable/);
 await page.goto(origin+'/pos?fixtureAuth=signed&fixtureRole=Business%20Owner&entryHold=1');await search.waitFor();await search.fill('Variant');await page.locator('[data-qitem-id="3"]').waitFor();await page.evaluate(()=>window.fixtureReleases.shift()());await page.waitForTimeout(50);assert.equal(await page.locator('[data-qitem-id="1"]').count(),0);result.checks.push('Entry load completing after newer search cannot replace accepted current results');
 await open();await page.evaluate(()=>window.fixtureHoldTable='quick_items');await search.fill('Variant');await page.waitForFunction(()=>window.fixtureReleases.length===1);await page.evaluate(()=>window.fixtureSDK.auth.signOut());await page.waitForURL('**/login');await page.evaluate(()=>window.fixtureReleases.shift()());await page.waitForTimeout(50);assert.equal(await page.locator('.rs-cart-line').count(),0);
 result.rpcNames=await page.evaluate(()=>window.resourceCalls.filter(c=>c.rpc).map(c=>c.rpc));assert.ok(result.rpcNames.every(name=>name.startsWith('get_')),'Only read RPCs may occur');
 assert.deepEqual(await page.evaluate(()=>window.fixtureWrites),[]);assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);
 result.checks.push('View/session departure rejects pending results; Admin malformed labels safe; no business writes, checkout or receipt commands');result.result='PASS';console.log(JSON.stringify(result.checks,null,2));
}catch(error){result.result='FAIL';result.error=error.stack;throw error}
finally{if(browser)await browser.close();await server.close();fs.writeFileSync(path.join(out,'audit-corrections-browser-results.json'),JSON.stringify(result,null,2));}
