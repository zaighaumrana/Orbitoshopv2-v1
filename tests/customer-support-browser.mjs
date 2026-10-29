// Actual admin module, Support renderer and client. SDK transport is synthetic;
// all non-loopback traffic is blocked. This is not hosted Auth/Edge acceptance.
import {createServer} from 'vite';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const server=await createServer({configFile:false,envDir:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},
 define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_SUPABASE_ANON':JSON.stringify('synthetic-public')},
 plugins:[{name:'support-browser-fixture',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0support-sdk':null,load:id=>id==='\0support-sdk'?'export const createClient=()=>window.fixtureSDK;':null,
 configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url!=='/__support_fixture')return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"></head><body><div id="app"></div></body></html>');});}}]});
let browser;const external=[],errors=[];
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
 const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():(external.push(r.request().url()),r.abort()));
 await context.addInitScript(()=>{
  const uid='97000000-0000-4000-8000-000000000001',sid='97000000-0000-4000-8000-000000000002';
  const session={user:{id:uid},access_token:'x.'+btoa(JSON.stringify({session_id:sid}))+'.x'};
  window.fixtureCalls=[];window.fixtureTickets=[];window.fixtureUncertain=true;
  window.fixtureSDK={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async name=>({data:name==='get_app_config'?{suspended:false,shop_name:'Synthetic Support Shop',onboarding_version:2}:[]}),functions:{invoke:async(name,{body})=>{
   window.fixtureCalls.push(structuredClone(body));
   if(body.action==='create'){
    const existing=window.fixtureTickets.find(t=>t.request_id===body.request_id);
    if(!existing)window.fixtureTickets.push({...body,ticket_id:body.request_id,status:'Resolved',resolution:'Reconnected <script>text only</script>',created_at:'2026-10-18T00:00:00Z'});
    if(window.fixtureUncertain){window.fixtureUncertain=false;return {error:Error('lost response')};}
    return {data:{accepted:true,ticket_id:body.request_id,status:'Open'}};
   }
   const offset=body.offset||0;
   return {data:body.action==='list'?{tickets:window.fixtureTickets.slice(offset,offset+50),has_more:window.fixtureTickets.length>offset+50}:{ticket:window.fixtureTickets.find(t=>t.ticket_id===body.ticket_id)}};
  }}};
 });
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/__support_fixture',{waitUntil:'domcontentloaded',timeout:60000});
 await page.evaluate(async()=>{history.replaceState(null,'','/admin/customer-support');const {initAdmin}=await import('/src/admin/admin.js');await initAdmin({employee:{name:'Synthetic Owner',role:'Business Owner'},isAdmin:true},'customer-support');});
 await page.getByRole('heading',{name:'Help & Support'}).waitFor();assert.equal(await page.locator('select[data-action="admin-module"] option[value="customer-support"]').count(),1);
 await page.locator('[data-support-field="subject"]').fill('Scanner <img src=x onerror=alert(1)>');await page.locator('[data-support-field="message"]').fill('Disconnects after checkout.');
 await page.getByRole('button',{name:'Submit request',exact:true}).click();await page.getByRole('button',{name:'Retry original request',exact:true}).waitFor();
 assert.equal(await page.locator('[data-support-field="subject"]').getAttribute('readonly'),'');
 await page.getByRole('button',{name:'Retry original request',exact:true}).click();await page.getByRole('status').filter({hasText:'Request received'}).waitFor();
 const creates=await page.evaluate(()=>window.fixtureCalls.filter(c=>c.action==='create'));assert.equal(creates.length,2);assert.deepEqual(creates[0],creates[1]);assert.equal(await page.evaluate(()=>window.fixtureTickets.length),1);
 await page.locator('[data-action="customer-support-detail"]').click();await page.getByText('Reconnected <script>text only</script>',{exact:false}).waitFor();assert.equal(await page.locator('#app script,#app img[src="x"]').count(),0);
 for(const width of [320,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No Support overflow at '+width);}
 // Real existing click handlers and unchanged fifty-row pagination, synthetic data.
 await page.evaluate(()=>{window.fixtureTickets=Array.from({length:51},(_,i)=>({ticket_id:'97000000-0000-4000-8000-'+String(i+10).padStart(12,'0'),subject:'Owner\u2019s printer '+i,status:i%2?'Open':'Resolved',category:'technical',message:'Customer punctuation: \u00b7 \u2019 \u2013',resolution:i%2?null:'Reconnected successfully.',created_at:'2026-10-25T00:00:00Z'}));});
 await page.locator('[data-action="customer-support-refresh"]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-action="customer-support-detail"]').length===50);
 await page.locator('[data-action="customer-support-next"]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-action="customer-support-detail"]').length===1);assert.equal(await page.locator('.support-pagination').innerText().then(t=>t.includes('Page 2')),true);
 await page.locator('[data-action="customer-support-previous"]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-action="customer-support-detail"]').length===50);
 await page.locator('[data-action="customer-support-detail"]').first().focus();await page.keyboard.press('Enter');await page.locator('.support-detail').getByText('Customer punctuation: \u00b7 \u2019 \u2013',{exact:true}).waitFor();assert.equal(await page.locator('[data-action="customer-support-detail"]').first().getAttribute('aria-pressed'),'true');
 assert.ok((await page.evaluate(()=>window.fixtureCalls.filter(c=>c.action==='list').map(c=>c.offset))).includes(50));
 await page.evaluate(async()=>{const {initAdmin}=await import('/src/admin/admin.js');await initAdmin({employee:{name:'Synthetic Manager',role:'Manager'}},'customer-support');});
 assert.equal(await page.locator('select[data-action="admin-module"] option[value="customer-support"]').count(),1);
 assert.equal(await page.locator('[data-form="support-consent"]').count(),0);
 // Presentation fixtures use the real renderer/CSS with no transport or customer data.
 await page.evaluate(async()=>{
  const {supportPage}=await import('/src/admin/pages/support.js');
  const rows=window.fixtureTickets.slice(0,3);rows[1].subject='A long request subject '+('printer-and-scanner-'.repeat(12));
  window.supportFixture={tickets:rows,draft:{subject:'Printer paper',category:'technical',message:'Please check the printer.'},offset:0,has_more:true,detail:{...rows[0],resolved_at:'2026-10-25T00:30:00Z'},access:{approvals:[{id:'97000000-0000-4000-8000-000000000005',ticket_id:rows[0].ticket_id,purpose:'Review the reported printer problem with owner approval.',scope:'shop_operations',approved_by:'97000000-0000-4000-8000-000000000001',approved_at:'2026-10-25T00:00:00Z',expires_at:'2026-10-25T00:30:00Z',used_at:'2026-10-25T00:01:00Z',platform_actor:'97000000-0000-4000-8000-000000000003'}]}};
  window.renderSupportFixture=(change={},owner=true)=>document.querySelector('#app').innerHTML='<main class="content"><div class="admin-header"><h1>Help &amp; Support</h1><p class="muted">Synthetic Shop</p></div>'+supportPage({...window.supportFixture,...change},owner)+'</main>';
  window.renderSupportFixture();
 });
 for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  const layout=await page.evaluate(()=>{const rows=[...document.querySelectorAll('.support-ticket')];const first=rows[0].getBoundingClientRect();const refresh=document.querySelector('[data-action="customer-support-refresh"]').getBoundingClientRect(),heading=document.querySelector('[aria-label="Support history"] h2').getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth+1,aligned:rows.every(r=>getComputedStyle(r).textAlign==='left'),height:first.height,longHeight:rows[1].getBoundingClientRect().height,fullSubject:rows[1].title===rows[1].querySelector('strong').textContent,refreshAligned:Math.abs((refresh.top+refresh.height/2)-(heading.top+heading.height/2))<2,buttonWidth:document.querySelector('[data-form="customer-support"] button').getBoundingClientRect().width,formWidth:document.querySelector('[data-form="customer-support"]').getBoundingClientRect().width,text:document.querySelector('.support-page').innerText};});
  assert.equal(layout.overflow,false,theme+' overflow at '+width);assert.equal(layout.aligned,true);assert.ok(layout.height<110,'Compact short row');assert.ok(layout.buttonWidth<layout.formWidth-25,'Submit uses content width');assert.ok(layout.text.includes('Shop\u2019s requests'));assert.ok(layout.text.includes('access \u00b7 separate'));assert.ok(layout.text.includes('20\u2013400'));assert.doesNotMatch(layout.text,/\u00c2\u00b7|\u00e2\u20ac|\ufffd/);
  assert.ok(layout.longHeight<145,'Long subjects stay compact');assert.equal(layout.fullSubject,true);assert.equal(layout.refreshAligned,true,'History refresh stays beside heading');
  await page.locator('.support-page details summary').click();assert.equal(await page.locator('.support-page details').getAttribute('open'),'');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('.support-page details summary').click();
  if(process.env.SUPPORT_UI_EVIDENCE_DIR&&[1440,390].includes(width))await page.screenshot({path:join(process.env.SUPPORT_UI_EVIDENCE_DIR,`support-${theme}-${width}.png`),fullPage:true});
 }
 for(const state of ['empty','pending','success','error','review','busy']){
  await page.evaluate(s=>window.renderSupportFixture(s==='empty'?{tickets:[],detail:null}:s==='success'?{receipt:'97000000-0000-4000-8000-000000000006'}:s==='error'?{error:'Connection unavailable. Keep the original request.'}:{pending:{request_id:'original'},deliveryState:s==='review'?'review':s==='pending'?'pending':null,busy:s==='busy'}),state);
  if(state==='empty')await page.getByText('No requests on this page.',{exact:true}).waitFor();
  if(['pending','review','busy'].includes(state))assert.equal(await page.locator('[data-support-field="subject"]').getAttribute('readonly'),'');
  if(state==='success')await page.getByRole('status').filter({hasText:'Request received'}).waitFor();
  if(state==='error')await page.getByRole('alert').waitFor();
  if(state==='busy'){assert.equal(await page.getByRole('button',{name:'Please wait\u2026',exact:true}).isDisabled(),true);assert.equal(await page.locator('[data-action="customer-support-refresh"]').isDisabled(),true);}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 // Compare representative unrelated components with/without only the new CSS block.
 const css=readFileSync('src/style.css','utf8'),start=css.indexOf('/* Help & Support only;'),end=css.indexOf('input[type="number"]::-webkit-inner-spin-button,',start);
 assert.ok(start>0&&end>start);
 assert.equal(await page.evaluate(async({css,baseline})=>{
  const sample='<div class="card"><button class="primary-button">Checkout</button><label class="field"><input value="Inventory"></label><div class="list-row">Workshop</div></div>';
  const result=[];for(const style of [baseline,css]){const frame=document.createElement('iframe');frame.srcdoc='<style>'+style+'</style>'+sample;document.body.append(frame);await new Promise(r=>frame.onload=r);result.push([...frame.contentDocument.querySelectorAll('.card,button,input,.list-row')].map(el=>{const c=frame.contentWindow.getComputedStyle(el);return[c.display,c.color,c.backgroundColor,c.padding,c.border,c.borderRadius,c.font,c.minHeight].join('|');}));frame.remove();}return JSON.stringify(result[0])===JSON.stringify(result[1]);
 },{css,baseline:css.slice(0,start)+css.slice(end)}),true,'Support CSS leaves unrelated Shop components unchanged');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('PASS: real Support form/retry/receipt/escaped details, Owner/Manager gates and 50-row pagination; Unicode, history/form/consent/disclosure layout at 1440/768/390/320 in both themes, six message states and unrelated-component CSS isolation; zero page errors/external requests.');
}finally{await browser?.close();await server.close();}
