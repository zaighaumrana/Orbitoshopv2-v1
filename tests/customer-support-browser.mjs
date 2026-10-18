// Actual admin module, Support renderer and client. SDK transport is synthetic;
// all non-loopback traffic is blocked. This is not hosted Auth/Edge acceptance.
import {createServer} from 'vite';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},
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
   return {data:body.action==='list'?{tickets:window.fixtureTickets,has_more:false}:{ticket:window.fixtureTickets.find(t=>t.ticket_id===body.ticket_id)}};
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
 await page.evaluate(async()=>{const {initAdmin}=await import('/src/admin/admin.js');await initAdmin({employee:{name:'Synthetic Manager',role:'Manager'}},'customer-support');});
 assert.equal(await page.locator('select[data-action="admin-module"] option[value="customer-support"]').count(),1);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('PASS: actual Shop admin Support form, lost-commit retry, one receipt, escaped details/resolution, Owner/Manager navigation, 320/768/1440px; zero page errors/external requests.');
}finally{await browser?.close();await server.close();}
