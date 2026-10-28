import {runOwnerAcceptance} from './helpers/m3-owner-acceptance.mjs';
// One loopback-only M3 harness. Real Shop entry/renderers; synthetic SDK/Turnstile.
// Baseline login is captured BEFORE changes; no hosted identity or business writes.
import {createServer} from 'vite';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {resourceFixture} from './helpers/resource-fixture.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const rootOutput=process.env.M3_EVIDENCE_DIR;
if(!rootOutput)throw Error('Set M3_EVIDENCE_DIR to the owned evidence run directory.');
const source=await readFile('tests/shop-entry-browser.mjs','utf8');
const fixtureEnd=source.indexOf('\nlet browser;');
assert.ok(fixtureEnd>source.indexOf('function fixture(){'),'Existing fixture extraction boundary');
const fixture=source.slice(source.indexOf('function fixture(){'),fixtureEnd);
const baseline=process.argv.includes('--baseline');
const sourceBaseline=process.argv.includes('--source-baseline');
const renderOnly=process.argv.includes('--render-only');
const measureOnly=process.argv.includes('--measure-only');
const surfaceOnly=process.argv.includes('--surface-only');
const zoom=process.argv.includes('--zoom-only');
const ownerAcceptance=process.argv.includes('--owner-acceptance');
const output=baseline?rootOutput:join(rootOutput,process.env.M3_RUN_LABEL||new Date().toISOString().replaceAll(/[:.]/g,'-'));
await mkdir(output,{recursive:true});
const result={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),provenance:'author-run loopback Chrome; synthetic SDK/Turnstile; external requests blocked',login:[],geometry:[],screens:[],errors:[],external:[]};
const baselineRef='2dffa1eaf0ddd63d0e8369ccf6f889e4d31e028d';
const original=path=>execFileSync('git',['show',baselineRef+':'+path],{encoding:'utf8'});
if(sourceBaseline)result.source=baselineRef;
const server=await createServer({configFile:false,envDir:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_SUPABASE_ANON':JSON.stringify('synthetic-public'),'import.meta.env.VITE_TURNSTILE_SITE_KEY':JSON.stringify('synthetic-site')},plugins:[{name:'m3-sdk',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0m3-sdk':null,load:id=>id==='\0m3-sdk'?'export const createClient=()=>window.fixtureSDK;':sourceBaseline&&id.replaceAll('\\','/').startsWith(process.cwd().replaceAll('\\','/')+'/src/')?original(id.replaceAll('\\','/').slice(process.cwd().length+1).split('?')[0]):null,...(sourceBaseline?{transformIndexHtml:{order:'pre',handler:()=>original('index.html')}}:{})}]});
let browser,page;
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 let context;
 if(zoom){
  const profile=await mkdtemp(join(tmpdir(),'m3-zoom-'));await mkdir(join(profile,'Default'));
  // Chromium's default storage-partition key is x (hex of an empty relative path).
  // This is browser page zoom, verified below by CSS width/DPR/visual viewport.
  await writeFile(join(profile,'Default','Preferences'),JSON.stringify({partition:{default_zoom_level:{x:Math.log(2)/Math.log(1.2)}}}));
  context=await chromium.launchPersistentContext(profile,{headless:true,viewport:null,args:['--disable-gpu','--window-size=1280,900'],executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});browser=context.browser();
 }else{browser=await chromium.launch({headless:true,args:['--disable-gpu'],executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});context=await browser.newContext();}
 result.browser=browser.version();
 await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.request().url()==='https://challenges.cloudflare.com/turnstile/v0/api.js'?route.fulfill({contentType:'application/javascript',body:'/* synthetic */'}):(result.external.push(new URL(route.request().url()).origin),route.abort()));
 await context.addInitScript({content:fixture+'\nfixture();'});await context.addInitScript(resourceFixture);
 await context.addInitScript(()=>{
  window.fixtureRows={inventory:[{id:1,name:'First stock',qty:50,price:100,cost:60,category:'Parts'},{id:2,name:'Second stock',qty:50,price:50,cost:20,category:'Parts'}],quick_items:[],repair_components:[{id:1,name:'Screen',sort_order:1}],employees:[{id:1,name:'Employee',role:'Cashier',status:'Active'}],tickets:[{id:1,invoice_number:'ROOT1',ticket_number:'TK1',created_at:'2026-10-20T12:00:00Z',customer_name:'Repair Customer',customer_phone:'03000000000',device_brand:'Phone',device_model:'Model',status:'Pending',components_noted:[],is_locked:false},{id:2,parent_ticket_id:1,invoice_number:'CHILD2',ticket_number:'TK2',created_at:'2026-10-21T12:00:00Z',customer_name:'Child Customer',status:'Pending',components_noted:[]}],sales:[{id:1,invoice_number:'INV-1',created_at:'2026-10-25T12:00:00Z',customer_name:'Long customer '.repeat(8),total_bill:100,payment_method:'Cash',items_sold:[{name:'Persisted exact line',qty:1,sold_price:100}],tax:0,discount:0}],attendance:[],leaves:[],salary_config:[],salary_slips:[],returns:[]};
 });
 await context.addInitScript(()=>{
  // Keep real animation running, but use a fixed shader time for matched pixels.
  // Observe its natural submitted time separately; no application source is patched.
  const proto=globalThis.WebGL2RenderingContext?.prototype;if(!proto)return;
  const names=new WeakMap(),get=proto.getUniformLocation,set=proto.uniform1f;
  globalThis.m3Motion={frames:0,parameters:{},first:null,last:null};
  proto.getUniformLocation=function(program,name){const location=get.call(this,program,name);if(location)names.set(location,name);return location;};
  proto.uniform1f=function(location,value){const name=names.get(location);if(name==='uTime'){globalThis.m3Motion.frames++;globalThis.m3Motion.first??=value;globalThis.m3Motion.last=value;return set.call(this,location,1);}if(name)globalThis.m3Motion.parameters[name]=value;return set.call(this,location,value);};
 });
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>result.errors.push(error.message));
 const properties=['fontFamily','fontSize','fontWeight','lineHeight','color','backgroundColor','backgroundImage','borderColor','borderRadius','padding','margin','width','height','display','gap','position','transform','boxShadow','animationName','animationDuration','animationDelay','transitionProperty','transitionDuration'];
 const cases=(zoom||ownerAcceptance)?[{width:1280,height:900,theme:'light',motion:'no-preference'}]:[...['light','dark'].flatMap(theme=>[320,390,768,1280,1440].map(width=>({width,height:900,theme,motion:'no-preference'}))),{width:1280,height:500,theme:'light',motion:'no-preference'},{width:390,height:700,theme:'dark',motion:'reduce'}];
 for(const entry of renderOnly||measureOnly?[]:cases){
  if(!zoom)await page.setViewportSize({width:entry.width,height:entry.height});await page.emulateMedia({reducedMotion:entry.motion});
  await page.addInitScript(theme=>localStorage.setItem('retailos-theme',theme),entry.theme);
  await page.goto(origin+'/login?fixtureAuth=none');await page.locator('#login-form').waitFor();await page.evaluate(()=>document.fonts.ready);
  if(zoom){result.zoom=await page.evaluate(()=>({outer:outerWidth,inner:innerWidth,dpr:devicePixelRatio,visualScale:visualViewport.scale}));assert.equal(result.zoom.dpr,2);assert.equal(result.zoom.visualScale,1);assert.ok(result.zoom.outer/result.zoom.inner>1.98);}
  await page.waitForTimeout(250);
  if(entry.motion!=='reduce'&&await page.locator('.login-fibers canvas').count())await page.waitForFunction(()=>globalThis.m3Motion.frames>=4&&globalThis.m3Motion.last>globalThis.m3Motion.first,{timeout:5000});
  const observation=await page.evaluate(properties=>{
   for(const animation of document.getAnimations()){animation.currentTime=1000;animation.pause();}
   const selectors=['.orbito-login','.login-card','.login-logo','#login-title','#login-subtitle','#login-form','.field','#login-email','#login-password','#login-btn','#forgot-btn','#support-access-btn'];
   return {nodes:selectors.map(selector=>{const element=document.querySelector(selector),style=getComputedStyle(element),rect=element.getBoundingClientRect();return {selector,style:Object.fromEntries(properties.map(p=>[p,style[p]])),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};}),motion:globalThis.m3Motion,canvas:document.querySelector('.login-fibers canvas')!==null};
  },properties);
  const key=`login-${entry.width}x${entry.height}-${entry.theme}-${entry.motion}`;
  await page.screenshot({path:join(output,key+'.png'),fullPage:true});
  result.login.push({key,...entry,...observation});
 }
 if(!baseline&&!renderOnly&&!measureOnly){
  const previous=JSON.parse(await readFile(process.env.M3_BASELINE_FILE,'utf8'));
  assert.equal(result.browser,previous.browser,'Matched browser required');
  for(let i=0;i<result.login.length;i++){
   assert.deepEqual(result.login[i].nodes,previous.login[i].nodes,'Protected login computed style/layout: '+result.login[i].key);
   assert.deepEqual(result.login[i].motion?.parameters,previous.login[i].motion?.parameters,'Protected shader parameters');
   if(result.login[i].motion?.frames)assert.ok(result.login[i].motion.last>result.login[i].motion.first,'Animation keeps advancing naturally');
   assert.equal(result.login[i].canvas,previous.login[i].canvas,'Reduced-motion/graphics availability unchanged');
  }
  result.loginResult='PASS: matched computed appearance, layout, shader settings and advancing motion; deterministic shader screenshot checkpoint';
 }
 // A small matched local patch measurement, independent of network/printing.
 const measureCart=async()=>{
  await page.setViewportSize({width:1280,height:900});await page.goto(origin+'/pos?fixtureAuth=signed&fixtureRole=Business%20Owner');
  await page.locator('[data-inv-pos-add="1"]:enabled').click();
  return page.evaluate(()=>{
   const durations=[];for(let i=0;i<24;i++){const start=performance.now();document.querySelector('[data-qty][data-delta="1"]').click();document.querySelector('.total-row.grand').getBoundingClientRect();durations.push(performance.now()-start);}
   durations.sort((a,b)=>a-b);return {samples:durations.length,median:durations[12],p95:durations[22],scope:'synchronous delegated quantity update through layout flush; 24 local actions; no network or printing; same synthetic fixture and browser'};
  });
 };
 if(measureOnly){result.cartTiming=await measureCart();}
 if(zoom&&!baseline){
  await page.goto(origin+'/admin/catalog?fixtureAuth=signed&fixtureRole=Business%20Owner');await page.getByRole('button',{name:'+ Add Quick Item',exact:true}).click();await page.evaluate(()=>document.fonts.ready);
  const modal=page.locator('.modal');assert.ok(await modal.evaluate(x=>x.scrollWidth<=x.clientWidth+1));
  await page.evaluate(()=>{window.zoomControls=[...document.querySelector('.modal').querySelectorAll('button,input,select,textarea')].filter(x=>!x.disabled&&x.getClientRects().length);window.zoomControls.at(-1).focus();});
  await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement===window.zoomControls[0]));await page.keyboard.press('Shift+Tab');assert.ok(await page.evaluate(()=>document.activeElement===window.zoomControls.at(-1)));
  await page.screenshot({path:join(output,'actual-200-percent-quick.png'),fullPage:true});await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});
  await page.goto(origin+'/pos?fixtureAuth=signed&fixtureRole=Business%20Owner');await page.locator('[data-inv-pos-add="1"]:enabled').click();await page.locator('[data-cash-tendered]').fill('200');await page.locator('[data-qty][data-delta="1"]').click();assert.equal(await page.locator('[data-cash-tendered]').inputValue(),'200');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  result.zoomResult='PASS: actual Chrome 200% page zoom, unchanged login, bounded Quick Item, Tab/Shift+Tab wrap, Escape policy and POS tender/cart reflow';
 }
 if(!baseline&&!measureOnly&&!zoom&&!ownerAcceptance){
  const setTheme=async theme=>page.evaluate(async theme=>{const {state,applyBranding}=await import('/src/shared.js');state.theme=theme;applyBranding();},theme);
  if(!surfaceOnly){
  await page.setViewportSize({width:1280,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(origin+'/admin/catalog?fixtureAuth=signed&fixtureRole=Business%20Owner');
  const quick=page.getByRole('button',{name:'Quick Items',exact:true});if(await quick.count())await quick.click();
  await page.getByRole('button',{name:'+ Add Quick Item',exact:true}).click();
  await page.evaluate(()=>{window.m3Nodes={shell:document.querySelector('.app-shell'),header:document.querySelector('.topbar'),modal:document.querySelector('.feature-modal-host .modal')};});
  await page.locator('[name="itemName"]').fill('Long synthetic variant item');
  await page.locator('[name="variantName[]"]').fill('First retained variant');
  await page.locator('[name="variantPrice[]"]').fill('100');
  await page.getByRole('button',{name:'+ Add Another Variant',exact:true}).click();
  await page.getByRole('button',{name:'+ Add Another Variant',exact:true}).click();
  await page.locator('[name="variantName[]"]').nth(2).fill('Last retained variant');
  await page.locator('[data-variant-row]').nth(1).getByRole('button',{name:'Remove this variant'}).click();
  await page.evaluate(()=>document.querySelector('[data-action="theme"]').click());
  assert.equal(await page.locator('[name="itemName"]').inputValue(),'Long synthetic variant item');
  assert.equal(await page.locator('[name="variantName[]"]').count(),2);
  assert.equal(await page.locator('[name="variantName[]"]').nth(1).inputValue(),'Last retained variant');
  assert.ok(await page.evaluate(()=>Object.entries(window.m3Nodes).every(([key,node])=>node===document.querySelector(key==='shell'?'.app-shell':key==='header'?'.topbar':'.feature-modal-host .modal'))));
  assert.ok(await page.locator('.app-shell').evaluate(node=>node.inert),'Feature dialog makes underlying shell inert');
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.locator('[data-draft-warning]').waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.locator('[name="itemName"]').count(),1);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.locator('[name="itemName"]').waitFor({state:'detached'});
  await page.waitForFunction(()=>document.activeElement?.textContent.includes('Add Quick Item'));
  result.renderResult='PASS: real Catalog same-shell/header/modal identity, dynamic-row drafts, unrelated theme patch, inert background and explicit dirty-close protection';
  const geometry=async(name)=>{
   await page.evaluate(()=>document.fonts.ready);
   const observed=await page.locator('.feature-modal-host .modal').evaluate(modal=>{
    const r=modal.getBoundingClientRect(),children=[...modal.querySelectorAll('input,select,textarea,button')].filter(x=>x.getClientRects().length).map(x=>({tag:x.tagName,label:x.getAttribute('aria-label')||x.name||x.textContent.trim(),rect:x.getBoundingClientRect().toJSON()}));
    return {client:modal.clientWidth,scroll:modal.scrollWidth,height:r.height,top:r.top,bottom:r.bottom,viewport:innerHeight,outerWidth:innerWidth,pageOverflow:document.documentElement.scrollWidth-innerWidth,label:document.getElementById(modal.getAttribute('aria-labelledby'))?.textContent,childrenOutside:children.filter(x=>x.rect.left<r.left-1||x.rect.right>r.right+1).map(x=>x.label),last:children.at(-1)?.label};
   });
   assert.ok(observed.scroll<=observed.client+1,name+' dialog horizontal overflow '+JSON.stringify(observed));assert.deepEqual(observed.childrenOutside,[],name+' controls fit');assert.ok(observed.top>=-1&&observed.bottom<=observed.viewport+1,name+' viewport bounds');assert.ok(observed.label,name+' accessible name');
   result.geometry.push({name,...observed});
  };
  const close=async()=>{const button=page.locator('.feature-modal-host [data-modal-close]');await button.click();if(await page.locator('[data-draft-warning]').count())await button.click();await page.locator('.feature-modal-host .modal').waitFor({state:'detached'});};
  for(const theme of ['light','dark'])for(const width of [320,390,768,1280,1440]){
   await page.setViewportSize({width,height:900});await setTheme(theme);
   await page.getByRole('button',{name:'+ Add Quick Item',exact:true}).click();
   await page.locator('[name="itemName"]').fill('Long synthetic item '.repeat(12));
   await page.getByRole('button',{name:'+ Add Another Variant',exact:true}).click();await page.getByRole('button',{name:'+ Add Another Variant',exact:true}).click();
   await page.locator('[name="variantName[]"]').nth(2).fill('Last variant retained');await page.locator('[data-variant-row]').nth(1).getByRole('button',{name:'Remove this variant'}).click();
   await geometry('quick-'+width+'-'+theme);
   const modal=page.locator('.feature-modal-host .modal');await modal.evaluate(node=>node.scrollTop=node.scrollHeight);
   if((theme==='light')===(width===320||width===768||width===1440)){await page.waitForTimeout(150);await page.screenshot({path:join(output,'quick-'+width+'-'+theme+'.png'),fullPage:true});}
   await page.locator('[data-action="theme"]').evaluate(node=>node.click());
   assert.equal(await page.locator('[name="variantName[]"]').nth(1).inputValue(),'Last variant retained');
   await geometry('quick-patched-'+width+'-'+theme);
   await close();
  }
  await page.setViewportSize({width:1280,height:500});await page.getByRole('button',{name:'+ Add Quick Item',exact:true}).click();await geometry('quick-short-height');await close();
  await page.setViewportSize({width:390,height:700});await page.getByRole('button',{name:'+ Add Quick Item',exact:true}).click();
  await page.evaluate(()=>{Object.defineProperties(window.visualViewport,{height:{configurable:true,value:320},offsetTop:{configurable:true,value:100}});window.visualViewport.dispatchEvent(new Event('resize'));});
  const keyboard=await page.locator('.modal').evaluate(modal=>{const r=modal.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,scroll:modal.scrollHeight,client:modal.clientHeight};});assert.ok(keyboard.top>=100&&keyboard.bottom<=420);await page.locator('.modal button.primary-button').scrollIntoViewIfNeeded();assert.ok(await page.locator('.modal button.primary-button').evaluate(button=>{const r=button.getBoundingClientRect();return r.top>=100&&r.bottom<=420;}));
  result.visualViewport={...keyboard,provenance:'controlled visualViewport height=320/offsetTop=100 event in Chrome; real mobile keyboard still requires owner observation'};
  await page.evaluate(()=>{delete window.visualViewport.height;delete window.visualViewport.offsetTop;window.visualViewport.dispatchEvent(new Event('resize'));});await close();
  await page.goto(origin+'/admin/employees?fixtureAuth=signed&fixtureRole=Business%20Owner');await page.locator('[data-modal="employee"]').click();
  for(const width of [390,1280]){await page.setViewportSize({width,height:700});await geometry('employee-'+width);}
  await page.locator('[data-action="gen-employee-password"]').click();assert.ok((await page.locator('[name="password"]').inputValue()).length>=8);await close();
  await page.goto(origin+'/admin/inventory?fixtureAuth=signed&fixtureRole=Business%20Owner');await page.locator('[data-modal="inv-add"]').click();await page.setViewportSize({width:320,height:700});await geometry('inventory-add');await close();
  result.cartTiming=await measureCart();
  await page.locator('[data-inv-pos-add="2"]:enabled').click();
  await page.locator('[data-cash-tendered]').fill('3000');
  await page.evaluate(()=>{window.m3CartNodes={shell:document.querySelector('.app-shell'),tender:document.querySelector('[data-cash-tendered]'),first:document.querySelector('.cart-line')};});
  await page.locator('[data-qty="inv-1"][data-delta="-1"]').click();
  assert.ok(await page.evaluate(()=>window.m3CartNodes.shell===document.querySelector('.app-shell')&&window.m3CartNodes.tender===document.querySelector('[data-cash-tendered]')&&window.m3CartNodes.first===document.querySelector('.cart-line')));
  assert.equal(await page.locator('[data-cash-tendered]').inputValue(),'3000');assert.equal(await page.locator('#change-display').count(),1);
  assert.match(await page.locator('.total-row.grand').innerText(),/2,450/);
  await page.locator('[data-qty="inv-2"][data-delta="-1"]').click();assert.equal(await page.locator('[data-ui-key="cart:inv-2"]').count(),0);
  const search=page.locator('[data-inv-search]');await search.focus();await search.fill('First');
  await search.evaluate(node=>{window.m3Search=node;node.setSelectionRange(2,4);node.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));});
  await page.waitForTimeout(240);assert.ok(await search.evaluate(node=>node===window.m3Search&&document.activeElement===node&&node.selectionStart===2&&node.selectionEnd===4));
  await search.evaluate(node=>node.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
  await page.evaluate(()=>window.fixtureHoldTable='inventory');await search.fill('First');await page.waitForFunction(()=>window.fixtureReleases.length===1);
  await search.fill('Second');await page.locator('[data-inv-pos-add="2"]:enabled').waitFor();await page.evaluate(()=>window.fixtureReleases.shift()());await page.waitForTimeout(25);assert.equal(await page.locator('[data-inv-pos-add="1"]').count(),0);
  result.cartResult='PASS: exact total, row removal, retained tender and keyed cart/shell, stable search node/caret/composition and reversed stale request rejection';
  await page.locator('[data-modal="repair"]').click();await page.locator('[name="customerName"]').fill('Draft customer');await page.locator('[name="deviceBrand"]').fill('Phone');
  await page.evaluate(async()=>{const {replaceDraft}=await import('/src/features/pos/repairs/state.js');replaceDraft({components:[{name:'Long component '.repeat(15),price:125,tag:'Custom'}],labour:25,payments:[],overridePrice:null});document.querySelector('[data-action="theme"]').click();});
  assert.equal(await page.locator('[name="customerName"]').inputValue(),'Draft customer');
  for(const size of [{width:320,height:700},{width:768,height:700},{width:1280,height:500}]){await page.setViewportSize(size);await geometry('repair-'+size.width+'x'+size.height);}
  await close();
  // Actual PIN helper, synthetic verification only. Nested app confirmation owns keys.
  await page.evaluate(async()=>{
   const shared=await import('/src/shared.js');window.pinCallbacks=0;window.pinChecks=0;
   const render=()=>document.querySelector('[data-action="theme"]').click();
   shared.openPinPrompt('discount',()=>{window.pinCallbacks++;},render,()=>{window.pinChecks++;return new Promise(resolve=>window.pinRelease=()=>resolve({ok:true}));});
  });
  await page.setViewportSize({width:390,height:700});await geometry('PIN');
  await page.evaluate(async()=>{const {confirmAction}=await import('/src/shared.js');window.nested=confirmAction({title:'Synthetic confirmation',message:'Verify topmost keyboard ownership',confirmLabel:'Continue'});});
  await page.getByRole('dialog',{name:'Synthetic confirmation'}).waitFor();await page.keyboard.type('1234');assert.equal(await page.locator('#pp-input').inputValue(),'');
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.locator('.app-dialog-backdrop').waitFor({state:'detached'});
  await page.keyboard.type('1234');await page.keyboard.press('Enter');await page.waitForFunction(()=>window.pinChecks===1);
  await page.keyboard.press('Enter');await page.locator('.pin-prompt [data-modal-close]').click();assert.equal(await page.locator('.pin-prompt').count(),1,'Busy PIN cannot close');
  await page.evaluate(()=>window.pinRelease());await page.locator('.pin-prompt').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.pinCallbacks),1);
  assert.ok(await page.evaluate(()=>!document.querySelector('.app-shell').inert));
  result.dialogResult='PASS: real representative families, nested confirmation/PIN topmost keys, busy-close block and callback once';
  await page.goto(origin+'/admin/receipts?fixtureAuth=signed&fixtureRole=Business%20Owner&boundedReads=1');
  await page.locator('[data-action="open-receipt-modal"]').filter({hasText:'INV-1'}).click();await page.getByText('Persisted exact line',{exact:true}).waitFor();
  for(const width of [320,768,1440]){await page.setViewportSize({width,height:700});await geometry('receipt-'+width);}
  assert.equal(await page.locator('[data-print-attribution]').count(),0);
  await close();
  await page.evaluate(async()=>{const {state}=await import('/src/shared.js');state.data.udharAccounts=[{kind:'retail',sourceId:1,customerName:'Long credit customer '.repeat(10),customerPhone:'03000000000',reference:'INV-1',createdAt:'2026-10-20',outstanding:125,effectiveObligation:125,status:'Outstanding'}];state.modal={type:'udharList',readStatus:'ready'};document.querySelector('[data-action="theme"]').click();});
  for(const width of [390,1280]){await page.setViewportSize({width,height:700});await geometry('credit-compound-'+width);}
  await close();
  await page.goto(origin+'/workshop?fixtureAuth=signed&fixtureRole=Business%20Owner&boundedReads=1');await page.locator('[data-ws-filter]').fill('CHILD2');await page.locator('[data-family-finance="1"]').waitFor();assert.equal(await page.evaluate(()=>window.resourceCalls.filter(x=>x.rpc==='get_repair_family_summary').length),0);
  await page.locator('[data-family-finance="1"]').click();await page.waitForFunction(()=>window.resourceCalls.some(x=>x.rpc==='get_repair_family_summary'));
  await page.evaluate(async()=>{const {state}=await import('/src/shared.js');state.modal={type:'create-sub-invoice',parentId:1,draftComponents:[{name:'Long additional component '.repeat(12),price:125,tag:'Custom'}],draftLabour:25};document.querySelector('[data-action="theme"]').click();});
  await page.setViewportSize({width:320,height:700});await geometry('Workshop-additional-work');await close();
  }
  for(const [path,width,theme]of [['/admin/dashboard',1440,'light'],['/pos',390,'dark'],['/workshop',768,'light'],['/admin/settings',390,'dark'],['/admin/customer-support',1280,'light'],['/admin/billing-usage',390,'light'],['/admin/billing-usage',1280,'dark'],['/admin/reports',390,'light'],['/admin/ems',1280,'dark']]){
   await page.setViewportSize({width,height:900});await page.goto(origin+path+'?fixtureAuth=signed&fixtureRole=Business%20Owner&fixtureEMS=true&boundedReads=1');await page.locator('.app-shell.rs-shop').waitFor();await setTheme(theme);
   await page.evaluate(async({path,theme})=>{const {CFG,state,applyBranding}=await import('/src/shared.js');CFG.primary_color='#ffff00';CFG.secondary_color='#ffffff';CFG.shop_name='Very long merchant name '.repeat(5);CFG.shop_logo=path==='/pos'?'/brand/app/maskable-512.png':path==='/workshop'?'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=':'';state.theme=theme==='dark'?'light':'dark';applyBranding();document.querySelector('[data-action="theme"]').click();},{path,theme});
   await page.waitForTimeout(150); // Observe the settled theme, not its 120ms control transition.
   const screen=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth-innerWidth,font:getComputedStyle(document.querySelector('.app-shell')).fontFamily,product:!!document.querySelector('.rs-product img'),text:document.querySelector('.content').textContent.slice(0,120)}));
   assert.ok(screen.overflow<=1,path+' page overflow '+screen.overflow);assert.ok(screen.font.includes('RetraSell Inter'));assert.ok(screen.product);result.screens.push({path,width,theme,...screen});
   if(['/admin/dashboard','/pos','/workshop','/admin/customer-support'].includes(path))await page.screenshot({path:join(output,path.replaceAll('/','-').slice(1)+'.png'),fullPage:true});
  }
  // Logout returns to the protected surface and removes operational scoping.
  await page.locator('[data-action="logout"]').click();await page.getByRole('button',{name:'Log out',exact:true}).click();await page.locator('#login-form').waitFor();assert.equal(await page.locator('.rs-shop').count(),0);
  result.sessionResult='PASS: local logout clears operational shell, modal and authority-owned state';
  await page.goto(origin+'/admin/dashboard?fixtureAuth=signed&fixtureRole=Manager');await page.locator('.app-shell').waitFor();assert.equal(await page.locator('[data-action="go-pos"],[data-action="go-workshop"]').count(),0);assert.equal(await page.locator('[data-action="admin-module"] option[value="settings"]').count(),0);
  result.managerResult='PASS: Manager keeps Admin and receives no POS, Workshop or branding entry';
  await page.goto(origin+'/admin/dashboard?fixtureAuth=signed&fixtureRole=Business%20Owner');await page.locator('.app-shell').waitFor();
  const cdp=await context.newCDPSession(page);const manifest=await cdp.send('Page.getAppManifest');result.browserManifest={url:manifest.url,errors:manifest.errors,data:JSON.parse(manifest.data)};assert.equal(result.browserManifest.data.name,'RetraSell POS');await cdp.detach();
  await page.evaluate(async()=>{const {renderOnboarding}=await import('/src/onboarding.js');renderOnboarding({employee:{email:'owner@example.test',role:'Business Owner'}},()=>{});});
  await page.setViewportSize({width:390,height:700});await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:join(output,'onboarding.png'),fullPage:true});result.onboardingResult='PASS: actual synthetic-owner onboarding renderer; no form submission or settings write';
  await context.route(origin+'/shop-public-config.js',route=>route.fulfill({contentType:'application/javascript',body:'export const SUPABASE_URL="https://synthetic.invalid";export const SUPABASE_ANON="synthetic-public";'}));
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.108.2/+esm',route=>route.fulfill({contentType:'application/javascript',body:'export const createClient=(url,key)=>{window.trackerTarget={url,key};return {rpc:async()=>({data:{shop_name:"Synthetic Merchant",primary_color:"#ffff00",live_tracking_enabled:true}})};}'}));
  const tracking=[];await context.route('https://synthetic.invalid/functions/v1/public-track',route=>{tracking.push({url:route.request().url(),body:route.request().postDataJSON()});return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,ticket:{status:'Pending',invoice_number:'INV-TRACK',ticket_number:'TK-TRACK',customer_name:'Customer',device_brand:'Phone',device_model:'Model',created_at:'2026-10-20',components_noted:[]}})});});
  await page.goto(origin+'/track.html?t=INV-TRACK&project_ref=foreign&supabase_url=https://foreign.invalid');await page.getByText('Synthetic Merchant',{exact:true}).waitFor();await page.locator('#phone-input').fill('03000000000');await page.locator('#track-btn').click();await page.locator('#result-card').waitFor({state:'visible'});assert.deepEqual(tracking[0],{url:'https://synthetic.invalid/functions/v1/public-track',body:{identifier:'INV-TRACK',phone:'03000000000'}});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:join(output,'merchant-tracking.png'),fullPage:true});result.trackerResult='PASS: actual standalone tracker, merchant first, safe yellow accent; exact configured public target and request unaffected by foreign URL parameters';
 }
 if(ownerAcceptance&&!baseline)result.ownerAcceptance=await runOwnerAcceptance({page,origin,output});
 assert.deepEqual(result.errors,[]);await context.close();
}catch(error){result.failure={message:error.message,stack:error.stack};if(page){await page.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});result.failure.layout=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(x=>x.getBoundingClientRect().right>innerWidth+2&&getComputedStyle(x).position!=='fixed').slice(0,14).map(x=>({tag:x.tagName,class:x.className,id:x.id,width:x.getBoundingClientRect().width,style:x.getAttribute('style')}))).catch(()=>null);}process.exitCode=1;}
finally{await browser?.close();await server.close();await writeFile(join(output,baseline?'login-baseline.json':'m3-browser-result.json'),JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({baseline,browser:result.browser,loginCases:result.login.length,failure:result.failure?.message||null}));
