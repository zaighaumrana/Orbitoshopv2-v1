// Actual admin events/renderer/bridge with isolated SDK transport; no hosted I/O.
import {createServer} from 'vite';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_SUPABASE_ANON':JSON.stringify('synthetic-public')},plugins:[{name:'paper-fixture',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0fixture-sdk':null,load:id=>id==='\0fixture-sdk'?'export const createClient=()=>window.fixtureSDK;':null,configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url!=='/__paper_fixture')return next();res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"></head><body><div id="app"></div></body></html>');});}}]});
let browser;const external=[],errors=[];
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});const context=await browser.newContext();
 await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():(external.push(r.request().url()),r.abort()));
 await context.addInitScript(()=>{
  const uid='97000000-0000-4000-8000-000000000001';window.paperRows=JSON.parse(sessionStorage.getItem('fixture-paper-rows')||'[]');window.paperCalls=JSON.parse(sessionStorage.getItem('fixture-paper-calls')||'[]');window.paperReadFailure=false;window.paperLost=true;window.paperHold=false;
  window.fixtureSDK={auth:{getSession:async()=>({data:{session:{user:{id:uid}}}}),getUser:async()=>({data:{user:{id:uid}}}),signOut:async()=>({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name,args)=>{
   if(name==='get_app_config')return {data:{suspended:false,shop_name:'Paper Fixture',onboarding_version:2}};
   if(name==='get_platform_billing'){
    if(window.paperHold)await new Promise(resolve=>window.releasePaperRead=resolve);
    if(window.paperReadFailure)return {error:Error('offline')};
    return {data:{available:true,last_synced_at:'2026-10-21T08:00:00Z',projection:{currency:'PKR',paper_resupply_enabled:true,platform_updated_at:'2026-10-21T08:00:00Z'},paper_requests:structuredClone(window.paperRows)}};
   }
   if(name==='request_paper_resupply'){
    window.paperCalls.push(args.p_request_id);let row=window.paperRows.find(r=>r.request_id===args.p_request_id)||window.paperRows.find(r=>['requested','approved','dispatched'].includes(r.status));
    if(!row){row={request_id:args.p_request_id,status:'requested',requested_at:'2026-10-21T08:05:00Z',sync_version:0,platform_updated_at:null,communication:[]};window.paperRows.unshift(row);}
    sessionStorage.setItem('fixture-paper-rows',JSON.stringify(window.paperRows));sessionStorage.setItem('fixture-paper-calls',JSON.stringify(window.paperCalls));
    if(window.paperLost){window.paperLost=false;return {error:Error('lost response after commit')}};
    return {data:{accepted:true,request_id:row.request_id}};
   }
   return {data:[]};
  },functions:{invoke:async()=>({data:{tickets:[],has_more:false}})},from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,maybeSingle:async()=>({data:{auth_user_id:uid,role:'Business Owner',status:'Active',display_name:'Synthetic Owner'}}),single:async()=>({data:{auth_user_id:uid,role:'Business Owner',status:'Active',display_name:'Synthetic Owner'}}),then:resolve=>resolve({data:[]})};return q}};
 });
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/__paper_fixture');
 const open=()=>page.evaluate(async()=>{history.replaceState(null,'','/admin/billing-usage');const {initAdmin}=await import('/src/admin/admin.js');await initAdmin({user:{id:'97000000-0000-4000-8000-000000000001'},employee:{name:'Synthetic Owner',role:'Business Owner'},isAdmin:true},'billing-usage')});
 await open();const request=()=>page.locator('[data-action="paper-resupply"]'),refresh=()=>page.locator('[data-action="paper-refresh"]');
 await request().evaluate(e=>{e.click();document.querySelector('[data-action="paper-resupply"]')?.click()});await page.getByText('Request outcome is unconfirmed.',{exact:false}).waitFor();
 assert.equal(await page.evaluate(()=>window.paperCalls.length),1);
 // Same browser identity survives a real reload after the lost committed response.
 await page.evaluate(()=>history.replaceState(null,'','/__paper_fixture'));await page.reload();await page.evaluate(()=>{window.paperReadFailure=true;window.paperLost=false});await open();
 // Offline initial read cannot offer a new request. Restore and read the server.
 assert.equal(await request().count(),0);
 // Simulate a second lost-ack attempt in the same operation through actual bridge.
 await page.evaluate(async()=>{const {createPlatformBridge}=await import('/src/platform/bridge.js');const b=createPlatformBridge(window.fixtureSDK);await b.requestResupply('97000000-0000-4000-8000-000000000001')});
 assert.ok(await page.evaluate(()=>window.paperCalls.length===2&&window.paperCalls[0]===window.paperCalls[1]));
 await page.evaluate(()=>window.paperReadFailure=false);
 await refresh().click();assert.equal(await page.evaluate(()=>window.paperRows.length),1);assert.ok(await request().isDisabled());await page.getByText('Saved locally · awaiting Platform sync.',{exact:false}).waitFor();
 const update=async(status,message='',expectation='')=>{await page.evaluate(({status,message,expectation})=>{const r=window.paperRows[0];r.status=status;r.sync_version++;r.platform_updated_at='2026-10-21T09:00:00Z';r.communication.push({status,message,expectation,at:r.platform_updated_at})},{status,message,expectation});await refresh().click();};
 await update('approved','Approved <script>text only</script>','3–5 working days');await page.getByText('Expected delivery: 3–5 working days',{exact:false}).waitFor();assert.ok(await request().isDisabled());await page.getByText('Confirmed by Platform',{exact:false}).waitFor();
 await update('dispatched','Courier collected');assert.ok(await request().isDisabled());
 await page.evaluate(()=>window.paperReadFailure=true);await refresh().click();await page.getByText('Could not refresh.',{exact:false}).waitFor();await page.getByRole('heading',{name:'Dispatched',exact:true}).waitFor();
 await page.evaluate(()=>window.paperReadFailure=false);await update('fulfilled','Delivered');assert.ok(await request().isEnabled());
 // A successful RPC followed by a failed read remains blocked and recoverable.
 await page.evaluate(()=>window.paperReadFailure=true);await request().click();await page.getByText('Submission acknowledged locally.',{exact:false}).waitFor();assert.ok(await request().isDisabled());
 await page.evaluate(()=>window.paperReadFailure=false);await refresh().click();await update('rejected','Outside delivery area');await page.getByText('Outside delivery area',{exact:false}).waitFor();assert.ok(await request().isEnabled());
 await request().click();assert.equal(await page.evaluate(()=>window.paperRows.length),3);assert.ok(await request().isDisabled());
 assert.equal(await page.locator('#app script,#app img[src="x"]').count(),0);
 if(process.env.SUPPORT_VISUAL_DIR){mkdirSync(process.env.SUPPORT_VISUAL_DIR,{recursive:true});for(const width of [320,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:join(process.env.SUPPORT_VISUAL_DIR,`shop-paper-status-${width}.png`),fullPage:true});}}
 // A departing owner's delayed read must not repopulate the next account.
 await page.evaluate(()=>window.paperHold=true);await refresh().click();await page.waitForFunction(()=>typeof window.releasePaperRead==='function');
 await page.evaluate(async()=>{window.paperHold=false;window.paperReadFailure=true;const {initAdmin}=await import('/src/admin/admin.js');await initAdmin({authUserId:'another-owner',employee:{name:'Other Owner',role:'Business Owner'}},'billing-usage');window.paperReadFailure=false;window.releasePaperRead();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
 assert.equal(await request().count(),0);assert.equal(await page.locator('article').count(),0);
 await page.evaluate(async()=>{const {initAdmin}=await import('/src/admin/admin.js');await initAdmin({authUserId:'another-user',employee:{name:'Manager',role:'Manager'}},'customer-support')});assert.equal(await request().count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: actual Shop admin paper submission/reload/retry, active blocking, local vs Platform evidence, notes/ETA, offline recovery, dispatch/fulfillment/rejection/new requests, role change, mobile/desktop. SDK transport only; hosted acceptance pending.');
}finally{await browser?.close();await server.close();}
