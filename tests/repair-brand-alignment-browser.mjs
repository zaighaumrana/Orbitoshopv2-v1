import {execFileSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
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
 if(process.env.REPAIR_STALE_BRAND_CSS)await context.route('**/brand/retrasell-shop.css',r=>r.fulfill({contentType:'text/css',body:execFileSync('git',['show',process.env.REPAIR_STALE_BRAND_CSS+':public/brand/retrasell-shop.css'],{cwd:shop,encoding:'utf8'})}));
 await context.addInitScript({content:fixture+';fixture();'});await context.addInitScript(resourceFixture);
 await context.addInitScript(()=>{
  const old=window.fixtureSDK.rpc;window.fixtureSDK.rpc=async(name,args)=>{const r=await old(name,args);if(name==='get_app_config'&&r.data)r.data={...r.data,read_contracts:{...r.data.read_contracts,catalog_icons:1}};return r};
  window.fixtureRows={quick_items:Array.from({length:28},(_,n)=>({id:n+1,name:n===0?'Cable':'Quick '+String(n).padStart(2,'0'),prices:[{name:'Standard',price:100+n}],sort_order:n,icon_id:'accessory.cable'})),inventory:[{id:1,name:'Stock Case',sku:'SKU-42',category:'General',qty:5,price:200,icon_id:'accessory.cover'}],repair_components:[{id:1,name:'Screen',sort_order:1,icon_id:'repair.display'}],device_brands:[{id:'00000000-0000-4000-8000-000000000001',display_name:'Samsung',enabled:true,icon_id:'brand.samsung',sort_order:1},{id:'00000000-0000-4000-8000-000000000002',display_name:'Retired Brand',enabled:false,icon_id:'brand.generic_phone',sort_order:2}],tickets:[{id:1,ticket_number:'OPEN-1',invoice_number:'INV-1',customer_name:'Open Customer',device_brand:'Samsung',device_model:'A',status:'Ready',is_locked:true,created_at:'2026-10-29T10:00:00Z',components_noted:[]},{id:2,ticket_number:'DELIVERED-2',customer_name:'Delivered Customer',device_brand:'Apple',status:'Delivered',is_locked:true,balance_due:999,created_at:'2026-10-29T11:00:00Z'},{id:3,parent_ticket_id:1,ticket_number:'CHILD-3',customer_name:'Child',status:'Pending',created_at:'2026-10-29T12:00:00Z'}],employees:[],sales:[],returns:[]};
 });
 await context.addInitScript(()=>{if(location.search.includes('brandFail=1'))window.fixtureReadFailures=['device_brands']});
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>result.errors.push(e.message));

 const geometry=async(mode,variant,width,theme)=>{
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.evaluate(()=>document.fonts.ready);
  const g=await page.evaluate(()=>{
   const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,cy:r.y+r.height/2}};
   const form=document.querySelector('[data-form="repair"]'),field=n=>form.querySelector('[name="'+n+'"]'),help=form.querySelector('#rs-brand-help'),input=field('deviceBrand');
   return {brand:box(input),helper:box(help),label:box(input.closest('label').querySelector('span')),name:box(field('customerName')),phone:box(field('customerPhone')),model:box(field('deviceModel')),imei:box(field('imei')),note:box(field('technicianNote')),panel:box(input.closest('.rs-repair-panel')),modal:box(form),body:box(form.querySelector('.rs-repair-workspace')),helperText:help.textContent,font:getComputedStyle(help).fontSize,parentFont:getComputedStyle(help.parentElement).fontSize,color:getComputedStyle(help).color,expectedColor:getComputedStyle(help).getPropertyValue('--muted').trim(),scroll:document.documentElement.scrollWidth,width:innerWidth,described:input.getAttribute('aria-describedby'),list:input.getAttribute('list'),required:input.required,helpBorder:getComputedStyle(help).borderWidth};
  });
  result.geometry.push({mode,variant,width,theme,...g});
  assert.equal(g.described,'rs-brand-help');assert.equal(g.list,'rs-device-brands');assert.equal(g.required,true);assert.equal(g.helpBorder,'0px');assert.equal(g.font,g.parentFont,'Keep original helper text size');
  assert.equal(g.helperText,variant==='unavailable'?'Brand choices unavailable. Type the brand manually; retry choices by reopening the form.':'Search a brand or type your own. Custom text is retained.');
  assert.ok(g.scroll<=width+1&&g.modal.x>=-1&&g.modal.right<=width+1,JSON.stringify(g));
  assert.ok(g.helper.x>=g.panel.x&&g.helper.right<=g.panel.right+1&&g.model.y>=Math.max(g.brand.bottom,g.helper.bottom)-1&&g.imei.y>=g.model.bottom&&g.note.y>=g.imei.bottom,JSON.stringify(g));
  if(width>820){assert.ok(g.helper.x>=g.brand.right+8,JSON.stringify(g));assert.ok(Math.abs(g.helper.cy-g.brand.cy)<=1,'Helper center must match input center: '+JSON.stringify(g));assert.ok(Math.abs(g.name.y-g.phone.y)<=1&&Math.abs(g.model.x-g.brand.x)<=1,JSON.stringify(g))}
  else{assert.ok(g.helper.y>=g.brand.bottom&&Math.abs(g.helper.x-g.brand.x)<=1&&g.phone.y>=g.name.bottom,JSON.stringify(g))}
  assert.notEqual(g.color,'rgba(0, 0, 0, 0)');
  if(width===1440||mode==='New')await page.screenshot({path:path.join(out,`${mode}-${variant}-${theme}-${width}.png`)});
 };
 for(const variant of ['normal','unavailable']){
  await page.goto(origin+'/pos?fixtureAuth=signed&fixtureRole=Business%20Owner&boundedReads=1'+(variant==='unavailable'?'&brandFail=1':''));await page.locator('[data-modal="repair"]').click();await page.locator('[name="deviceBrand"]').waitFor();
  assert.equal(await page.locator('#rs-device-brands option').count(),variant==='normal'?1:0);
  await geometry('New',variant,1440,'light');await geometry('New',variant,320,'dark');
  for(const [name,value] of Object.entries({customerName:'Alignment fixture',customerPhone:'03001234567',deviceBrand:'My Custom Brand',deviceModel:'Draft Model',imei:'SERIAL-A1',technicianNote:'Retain this note'}))await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('[name="deviceBrand"]').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('[name="deviceModel"]').evaluate(el=>document.activeElement===el),true);
  await page.locator('[data-pick-comp="Screen"]').click();await page.locator('[data-tag-pick]').first().click();assert.equal(await page.locator('[name="deviceBrand"]').inputValue(),'My Custom Brand');
  await page.locator('[data-form="repair"] button.primary-button').click();await page.locator('[data-action="edit-cart-repair"]').click();await page.getByRole('heading',{name:'Modify Repair Ticket',exact:true}).waitFor();
  for(const [name,value] of Object.entries({customerName:'Alignment fixture',customerPhone:'03001234567',deviceBrand:'My Custom Brand',deviceModel:'Draft Model',imei:'SERIAL-A1',technicianNote:'Retain this note'}))assert.equal(await page.locator(`[name="${name}"]`).inputValue(),value);
  await geometry('Modify',variant,1440,'dark');await geometry('Modify',variant,320,'light');
  assert.equal(await page.locator('[data-draft-comp-price]').count(),1);assert.equal(await page.evaluate(()=>window.fixtureWrites.length),0);
 }
 result.checks=['Measured side-by-side desktop input/helper centers within 1px for both helper messages, New/Modify and light/dark','320px stacked helper follows the field with no clipping; surrounding customer/model/IMEI/note order retained','Native brand datalist, custom text, validation, aria description and Tab order preserved','Draft fields/components survive component choice and actual local Cart Modify Ticket journey; zero database writes'];
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);result.result='PASS';console.log(JSON.stringify({result:result.result,checks:result.checks,geometry:result.geometry.map(g=>({mode:g.mode,variant:g.variant,width:g.width,theme:g.theme,centerDelta:g.helper.cy-g.brand.cy}))},null,2));
}catch(error){result.result='FAIL';result.error=error.stack;throw error}
finally{if(browser)await browser.close();await server.close();fs.writeFileSync(path.join(out,'repair-brand-alignment-results.json'),JSON.stringify(result,null,2));}
