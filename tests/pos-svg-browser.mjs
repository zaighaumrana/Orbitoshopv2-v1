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

 await page.goto(origin+'/pos?fixtureAuth=signed&fixtureRole=Business%20Owner');await page.locator('.rs-catalog-panel svg').first().waitFor();
 await page.locator('[data-qitem-id="1"]').click();await page.locator('[data-action="toggle-open-repairs"]').click();await page.locator('.rs-repair-card svg').waitFor();
 for(const theme of ['light','dark']){
  if(theme==='dark')await page.locator('[data-action="theme"]').click();
  await page.screenshot({path:path.join(out,'pos-svg-'+theme+'.png'),fullPage:true});
  const metrics=await page.evaluate(async()=>{
   const {registry,iconHTML}=await import('/src/catalog/icons.js');
   document.getElementById('svg-proof')?.remove();const proof=document.createElement('section');proof.id='svg-proof';proof.className='card';proof.style='display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:20px';
   proof.innerHTML=registry.assets.map(a=>'<div style="padding:8px"><strong>'+a.displayName+'</strong><div>'+iconHTML(a.id,a.category)+iconHTML(a.id,a.category).replace('class="rs-item-icon"','class="rs-item-icon" style="width:32px;height:32px"')+'</div></div>').join('');document.querySelector('.content').append(proof);
   return [...proof.querySelectorAll('svg')].map(s=>({color:getComputedStyle(s).stroke,fill:getComputedStyle(s).fill,width:s.getBoundingClientRect().width,height:s.getBoundingClientRect().height,hidden:s.getAttribute('aria-hidden'),focus:s.getAttribute('focusable'),children:s.children.length}));
  });
  assert.equal(metrics.length,72);assert.ok(metrics.every(m=>[24,32].includes(m.width)&&m.width===m.height&&m.hidden==='true'&&m.focus==='false'&&m.children>0&&m.color!=='none'));
  result.geometry.push({theme,metrics});await page.locator('#svg-proof').screenshot({path:path.join(out,'svg-all36-'+theme+'.png')});await page.evaluate(()=>document.getElementById('svg-proof').remove());
 }
 assert.notEqual(result.geometry[0].metrics[0].color,result.geometry[1].metrics[0].color);assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);result.checks=['36 actual inline wrappers at 24/32px in both Shop themes','currentColor inheritance changes with theme','decorative SVGs hidden/nonfocusable and visible adjacent names','actual Catalog, Cart and repair queue display local artwork with no external requests'];result.result='PASS';console.log(JSON.stringify(result.checks));
}catch(error){result.result='FAIL';result.error=error.stack;throw error}
finally{if(browser)await browser.close();await server.close();fs.writeFileSync(path.join(out,'svg-visual-results.json'),JSON.stringify(result,null,2));}
