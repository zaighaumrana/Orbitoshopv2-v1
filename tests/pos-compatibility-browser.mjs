import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const shop=path.resolve(import.meta.dirname,'..'),out=process.env.POS_EVIDENCE_DIR;if(!out)throw Error('Set POS_EVIDENCE_DIR.');fs.mkdirSync(out,{recursive:true});
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
  const old=window.fixtureSDK.rpc;window.fixtureSDK.rpc=async(name,args)=>{const r=await old(name,args);if(name==='get_app_config'&&r.data)r.data={...r.data,read_contracts:{...r.data.read_contracts,catalog_icons:1}};return r};
  window.fixtureRows={quick_items:Array.from({length:28},(_,n)=>({id:n+1,name:n===0?'Cable':'Quick '+String(n).padStart(2,'0'),prices:[{name:'Standard',price:100+n}],sort_order:n,icon_id:'accessory.cable'})),inventory:[{id:1,name:'Stock Case',sku:'SKU-42',category:'General',qty:5,price:200,icon_id:'accessory.cover'}],repair_components:[{id:1,name:'Screen',sort_order:1,icon_id:'repair.display'}],device_brands:[{id:'00000000-0000-4000-8000-000000000001',display_name:'Samsung',enabled:true,icon_id:'brand.samsung',sort_order:1},{id:'00000000-0000-4000-8000-000000000002',display_name:'Retired Brand',enabled:false,icon_id:'brand.generic_phone',sort_order:2}],tickets:[{id:1,ticket_number:'OPEN-1',invoice_number:'INV-1',customer_name:'Open Customer',device_brand:'Samsung',device_model:'A',status:'Ready',is_locked:true,created_at:'2026-10-29T10:00:00Z',components_noted:[]},{id:2,ticket_number:'DELIVERED-2',customer_name:'Delivered Customer',device_brand:'Apple',status:'Delivered',is_locked:true,balance_due:999,created_at:'2026-10-29T11:00:00Z'},{id:3,parent_ticket_id:1,ticket_number:'CHILD-3',customer_name:'Child',status:'Pending',created_at:'2026-10-29T12:00:00Z'}],employees:[],sales:[],returns:[]};
 });
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>result.errors.push(e.message));

 await context.addInitScript(()=>{
  const old=window.fixtureSDK.rpc;window.fixtureSDK.rpc=async(name,args)=>{const r=await old(name,args);if(name==='get_app_config'&&r.data){if(location.search.includes('legacy=1')){r.data={...r.data,read_contracts:{}}}if(location.search.includes('inventoryOff=1'))r.data={...r.data,inventory_module_enabled:false}}return r};
  if(location.search.includes('brandFail=1'))window.fixtureReadFailures=['device_brands'];
  if(location.search.includes('zeroStock=1'))window.fixtureRows.inventory=[{id:9,name:'Unsellable stock',sku:'ZERO',qty:0,price:200}];
  if(location.search.includes('stockHold=1'))window.fixtureHoldTable='inventory';
  if(location.search.includes('stockFailure=1'))window.fixtureReadFailures=['inventory'];
 });
 await page.goto(origin+'/pos?fixtureAuth=signed&fixtureRole=Cashier&legacy=1&inventoryOff=1');await page.locator('.rs-catalog-panel .rs-product-item').first().waitFor();
 assert.equal(await page.locator('.rs-inventory-panel').count(),0);assert.equal(await page.locator('.rs-catalog-expanded').count(),1);assert.equal(await page.evaluate(()=>window.resourceCalls.filter(c=>c.table==='inventory').length),0);
 await page.locator('[data-modal="repair"]').click();await page.locator('[name="deviceBrand"]').waitFor();await page.locator('[name="deviceBrand"]').fill('Legacy Custom Brand');assert.equal(await page.locator('[name="deviceBrand"]').inputValue(),'Legacy Custom Brand');assert.ok(await page.locator('#rs-device-brands option').count()>10);result.checks.push('Older backend retains repair intake and no new icon-column reads; disabled Inventory expands Catalog with no inventory load');
 await page.goto(origin+'/pos?fixtureRole=Cashier&brandFail=1');await page.locator('[data-modal="repair"]').click();await page.locator('[name="deviceBrand"]').waitFor();assert.match(await page.locator('#rs-brand-help').innerText(),/unavailable/);await page.locator('[name="deviceBrand"]').fill('Brand During Outage');assert.equal(await page.locator('#rs-device-brands option').count(),0);assert.equal(await page.locator('[name="deviceBrand"]').inputValue(),'Brand During Outage');result.checks.push('Failed configured-brand read leaves repair manual entry available with explicit guidance');
 await page.goto(origin+'/pos?fixtureRole=Business%20Owner');await page.locator('.rs-catalog-panel .rs-product-item').first().waitFor();await page.locator('[data-inv-search]').fill('nothing-matches-stock');await page.waitForFunction(()=>document.querySelector('[data-stock-search-status]')?.textContent.includes('No sellable'));assert.equal(await page.locator('.rs-inventory-panel').count(),1);result.checks.push('Filtered-empty stock does not hide Inventory');
 await page.evaluate(()=>window.fixtureHoldTable='tickets');const toggle=page.locator('[data-action="toggle-open-repairs"]');await toggle.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>window.fixtureReleases.length===1);assert.equal(await toggle.getAttribute('aria-expanded'),'true');await page.keyboard.press('Enter');await page.evaluate(()=>window.fixtureReleases.shift()());await page.waitForTimeout(100);assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#rs-open-queue').count(),0);result.checks.push('Native keyboard queue toggle and collapsed in-flight response fence');
 await page.locator('[data-qitem-id="1"]').click();await page.locator('[data-inv-search]').fill('');await page.locator('[data-inv-pos-add="1"]').waitFor();await page.locator('[data-inv-pos-add="1"]').click();await page.locator('[data-action="theme"]').click();await page.screenshot({path:path.join(out,'pos-dark-populated-cart.png'),fullPage:true});result.checks.push('Dark theme populated Cart visual capture');
 // Owner UI corrections through the actual entrypoint, existing SDK fixture only.
 await page.goto(origin+'/pos?fixtureRole=Cashier');await page.locator('[data-inv-pos-add="1"]').waitFor();
 const catalogSearch=page.getByRole('textbox',{name:'Search catalog',exact:true});
 assert.equal(await catalogSearch.count(),1);assert.equal((await catalogSearch.locator('..').innerText()).trim(),'');
 assert.equal(await page.locator('details.rs-custom-item').count(),0);
 assert.equal(await page.getByRole('heading',{name:'Custom / one-off item',exact:true}).isVisible(),true);
 for(const selector of ['#custom-item-name','#custom-item-price','[data-action="add-custom-item"]'])assert.equal(await page.locator(selector).isVisible(),true);
 const customTop=(await page.locator('.rs-custom-item').boundingBox()).y,pages=await page.locator('.rs-catalog-panel .rs-pagination').boundingBox();assert.ok(customTop>=pages.y+pages.height);
 result.checks.push('Search keeps its accessible name without a visible label; custom form is open below Catalog pagination');
 await page.locator('[data-qitem-id="1"]').click();
 await page.locator('[data-action="toggle-open-repairs"]').click();await page.locator('.rs-repair-card').waitFor();
 await page.locator('#custom-item-name').fill('Partial custom draft');await page.locator('#custom-item-price').fill('123.45');
 await catalogSearch.fill('Quick');await page.locator('[data-qitem-id="2"]').waitFor();await catalogSearch.focus();
 await page.evaluate(()=>{const search=document.querySelector('[data-quick-search]');search.setSelectionRange(2,2);window.uiStable={search,custom:document.querySelector('#custom-item-name'),cart:document.querySelector('.rs-cart-line'),queue:document.querySelector('#rs-open-queue')};document.querySelector('[data-qty][data-delta="1"]').click()});
 assert.deepEqual(await page.evaluate(()=>({search:window.uiStable.search===document.querySelector('[data-quick-search]'),custom:window.uiStable.custom===document.querySelector('#custom-item-name'),cart:window.uiStable.cart===document.querySelector('.rs-cart-line'),queue:window.uiStable.queue===document.querySelector('#rs-open-queue'),focus:document.activeElement===window.uiStable.search,caret:window.uiStable.search.selectionStart})),{search:true,custom:true,cart:true,queue:true,focus:true,caret:2});
 assert.equal(await page.locator('#custom-item-name').inputValue(),'Partial custom draft');assert.equal(await page.locator('#custom-item-price').inputValue(),'123.45');
 result.checks.push('Cart rerender preserves Catalog search node/focus/caret, partial custom draft, Cart node and open queue');
 // A current unfiltered exact zero (including unsellable rows) is the only collapse proof.
 await page.evaluate(()=>window.fixtureRows.inventory=[{id:9,name:'Unsellable stock',sku:'ZERO',qty:0,price:200}]);
 await page.locator('[data-inv-search]').fill(' ');await page.locator('.rs-catalog-expanded').waitFor();
 assert.equal(await page.locator('.rs-inventory-panel').count(),0);
 assert.deepEqual(await page.evaluate(()=>({search:window.uiStable.search===document.querySelector('[data-quick-search]'),custom:window.uiStable.custom===document.querySelector('#custom-item-name'),cart:window.uiStable.cart===document.querySelector('.rs-cart-line'),queue:window.uiStable.queue===document.querySelector('#rs-open-queue')})),{search:true,custom:true,cart:true,queue:true});
 assert.equal(await page.locator('#custom-item-name').inputValue(),'Partial custom draft');assert.equal(await page.locator('#custom-item-price').inputValue(),'123.45');
 result.checks.push('Current unfiltered zero sellable count expands Catalog without rebuilding custom draft, Cart or queue');
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
  for(const width of [320,390,768,1024,1280,1440]){
   await page.setViewportSize({width,height:1000});
   const g=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,bottom:r.bottom,y:r.y}};const input=document.querySelector('#custom-item-name'),style=getComputedStyle(input);return {width:innerWidth,theme:document.documentElement.dataset.theme,scroll:document.documentElement.scrollWidth,catalog:box('.rs-catalog-panel'),products:box('.rs-product-panels'),cart:box('.cart'),queue:box('.rs-open-repairs'),form:box('.rs-custom-form'),fields:['#custom-item-name','#custom-item-price','[data-action="add-custom-item"]'].map(box),foreground:style.color,background:style.backgroundColor}});
   assert.ok(g.scroll<=width+1,JSON.stringify(g));assert.ok(Math.abs(g.catalog.width-g.products.width)<2);assert.ok(g.queue.y>=g.catalog.bottom-1);if(width>=1280)assert.ok(g.cart.x>=g.catalog.right);
   for(const f of g.fields)assert.ok(f.x>=g.form.x-1&&f.right<=g.form.right+1&&f.width>30,JSON.stringify(g));assert.notEqual(g.foreground,g.background);result.geometry.push(g);
   if((theme==='light'&&width===1440)||(theme==='dark'&&width===320))await page.screenshot({path:path.join(out,'pos-ui-zero-'+theme+'-'+width+'.png'),fullPage:true});
  }
 }
 await page.setViewportSize({width:1440,height:1000});
 // Invoke the existing read-retry handler locally to model an authoritative stock update.
 // The fixture-only button is removed immediately; no production affordance is added.
 await page.evaluate(()=>{window.fixtureRows.inventory=[{id:1,name:'Stock Case',sku:'SKU-42',category:'General',qty:5,price:200,icon_id:'accessory.cover'}];const retry=document.createElement('button');retry.dataset.action='retry-resources';document.getElementById('app').append(retry);retry.click();retry.remove()});
 await page.locator('[data-inv-pos-add="1"]').waitFor();assert.equal(await page.locator('.rs-catalog-expanded').count(),0);assert.equal(await page.locator('.rs-cart-line').count(),1);assert.equal(await page.evaluate(()=>window.uiStable.cart===document.querySelector('.rs-cart-line')),true);
 assert.equal(await page.locator('#custom-item-name').inputValue(),'Partial custom draft');assert.equal(await catalogSearch.inputValue(),'Quick');
 // Existing valid custom item handler still adds locally and clears only the submitted draft.
 await page.locator('[data-action="add-custom-item"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.rs-cart-line').count(),2);assert.match(await page.locator('.cart').innerText(),/Partial custom draft/);assert.equal(await page.locator('#custom-item-name').inputValue(),'');assert.equal(await page.locator('#custom-item-price').inputValue(),'');
 result.checks.push('Authoritative stock repopulation restores dual panels through existing read retry; keyboard custom Add keeps existing local Cart semantics');
 // An entry read that captured zero cannot override a newer accepted stock search.
 await page.evaluate(()=>{window.fixtureRows.inventory=[];window.fixtureHoldTable='inventory';const retry=document.createElement('button');retry.dataset.action='retry-resources';document.getElementById('app').append(retry);retry.click();retry.remove()});
 await page.waitForFunction(()=>window.fixtureReleases.length===1);assert.equal(await page.locator('.rs-catalog-expanded').count(),0);
 await page.evaluate(()=>window.fixtureRows.inventory=[{id:1,name:'Stock Case',sku:'SKU-42',qty:5,price:200}]);
 await page.locator('[data-inv-search]').fill('Stock');await page.waitForFunction(()=>!document.querySelector('[data-inv-pos-add="1"]')?.disabled);
 await page.evaluate(()=>window.fixtureReleases.shift()());await page.waitForTimeout(80);
 assert.equal(await page.locator('.rs-catalog-expanded').count(),0);assert.equal(await page.locator('[data-inv-pos-add="1"]').count(),1);assert.equal(await page.locator('[data-inv-search]').inputValue(),'Stock');
 result.checks.push('Stale unfiltered entry-zero response cannot replace newer accepted nonempty search results');
 await page.goto(origin+'/pos?fixtureRole=Cashier&zeroStock=1&stockHold=1');await page.waitForFunction(()=>window.fixtureReleases.length===1);
 assert.equal(await page.locator('.rs-catalog-expanded').count(),0);await page.getByRole('heading',{name:'Inventory loading'}).waitFor();
 await page.evaluate(()=>window.fixtureReleases.shift()());await page.locator('.rs-catalog-expanded').waitFor();
 assert.equal(await page.evaluate(()=>window.resourceCalls.filter(c=>c.table==='inventory').length),1);
 const stockRead=await page.evaluate(()=>window.resourceCalls.find(c=>c.table==='inventory').ops);assert.ok(stockRead.some(x=>x[0]==='range'&&x[2]===23));assert.ok(stockRead.some(x=>x[0]==='select'&&x[2]?.count==='exact'));assert.ok(stockRead.some(x=>x[0]==='gt'&&x[1]==='qty'&&x[2]===0));
 await page.goto(origin+'/pos?fixtureRole=Cashier&stockFailure=1');await page.getByRole('heading',{name:'Inventory unavailable'}).waitFor();assert.equal(await page.locator('.rs-catalog-expanded').count(),0);
 await page.evaluate(()=>{window.fixtureReadFailures=[];window.fixtureRows.inventory=[]});await page.getByRole('button',{name:'Retry reads',exact:true}).click();await page.locator('.rs-catalog-expanded').waitFor();
 assert.equal(await page.evaluate(()=>window.fixtureWrites.length),0);
 result.checks.push('Loading and failed stock stay explicit; successful retry alone proves zero; count stays bounded with no extra inventory query or business write');
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);result.result='PASS';console.log(JSON.stringify(result.checks,null,2));
}catch(error){result.result='FAIL';result.error=error.stack;throw error}
finally{if(browser)await browser.close();await server.close();fs.writeFileSync(path.join(out,'browser-compatibility-results.json'),JSON.stringify(result,null,2));}
