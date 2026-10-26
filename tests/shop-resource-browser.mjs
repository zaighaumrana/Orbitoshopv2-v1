import {createServer} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {resourceFixture} from './helpers/resource-fixture.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const entry=await readFile('tests/shop-entry-browser.mjs','utf8');
const fixture=entry.slice(entry.indexOf('function fixture(){'),entry.indexOf('let browser;'));
function dataFixture(){
 const q=new URL(location.href).searchParams,roots=Number(q.get('roots')??10),sales=Number(q.get('sales')??1001);
 window.fixtureCap=7;window.fixturePrints=[];
 window.fixtureRows={
  inventory:Array.from({length:1001},(_,i)=>({id:i+1,name:i===1000?'Zzz rare stock':'Stock '+String(i).padStart(4,'0'),sku:'SKU-'+i,category:'Parts',qty:50,price:100,cost:60,min_qty:5})),
  employees:Array.from({length:1001},(_,i)=>({id:i+1,name:i===1000?'Zzz older employee':'Employee '+String(i).padStart(4,'0'),role:'Cashier',status:'Active',email:`employee${i}@example.test`})),
  quick_items:Array.from({length:31},(_,i)=>({id:i+1,name:'Quick '+String(i).padStart(3,'0'),prices:[{name:'Standard',price:100}],sort_order:i})),
  repair_components:Array.from({length:31},(_,i)=>({id:i+1,name:'Component '+String(i).padStart(3,'0'),sort_order:i})),
  tickets:Array.from({length:roots},(_,i)=>({id:i+1,parent_ticket_id:null,invoice_number:'ROOT'+i,ticket_number:'T'+i,created_at:'2020-01-01T12:00:00Z',customer_name:'Repair '+i,customer_phone:'03000000000',device_brand:'Phone',device_model:'Model',status:'Pending',components_noted:[],is_locked:true})),
  sales:Array.from({length:sales},(_,i)=>({id:i+1,invoice_number:'INV202610250'+i,created_at:'2026-10-25T12:00:00Z',customer_name:'Synthetic customer',total_bill:100,payment_method:'Cash',items_sold:[{name:'Persisted exact line',qty:1,sold_price:100}],tax:0,discount:0})),
  attendance:Array.from({length:1001},(_,i)=>({id:i+1,employee_id:i+1,date:'2026-10-01',clock_in:'2026-10-01T08:00:00Z',clock_out:'2026-10-01T16:00:00Z',employees:{name:i===1000?'Zzz old attendance':'Employee '+String(i).padStart(4,'0'),role:'Cashier'}})),
  leaves:[],salary_config:[],salary_slips:[],returns:[],
 };
 if(roots)window.fixtureRows.tickets.push({id:2001,parent_ticket_id:1,invoice_number:'CHILD',created_at:'2026-10-25T12:00:00Z',customer_name:'Recent child',status:'Cancelled',components_noted:[]});
}
const server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_SUPABASE_ANON':JSON.stringify('synthetic-public'),'import.meta.env.VITE_TURNSTILE_SITE_KEY':JSON.stringify('synthetic-site')},plugins:[{name:'owned-resource-fixture',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0resource-sdk':null,load:id=>id==='\0resource-sdk'?'export const createClient=()=>window.fixtureSDK;':id.replaceAll('\\','/').endsWith('/src/print/print.js')?'export const buildReceiptSlip=(sale)=>sale;export const printThermal=(sale)=>window.fixturePrints.push(sale);':null,transform(code,id){if(id.endsWith('/src/router.js'))return code.replace('await match.handler(match.params, query, navigation)','await match.handler(match.params, query, navigation);if(navigation.isCurrent())window.resourceRouteDone=location.pathname+location.search')}}]});
let browser;const errors=[],external=[],results=[];
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
 const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.request().url().includes('challenges.cloudflare.com')?r.fulfill({contentType:'application/javascript',body:'/* synthetic */'}):(external.push(r.request().url()),r.abort()));
 await context.addInitScript({content:fixture+';fixture();('+dataFixture.toString()+')();('+resourceFixture.toString()+')();'});
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
 const ready=()=>page.waitForFunction(()=>window.resourceRouteDone===location.pathname+location.search&&document.querySelector('#app .app-shell'));
 const go=async(path)=>{await page.goto(origin+path);await ready()};
 const navigate=async(path)=>{await page.evaluate(async path=>{window.resourceRouteDone=null;await(await import('/src/router.js')).navigate(path)},path);await ready()};
 const tables=()=>page.evaluate(()=>window.resourceCalls.filter(c=>c.table).map(c=>c.table));
 const clear=()=>page.evaluate(()=>{window.resourceCalls=[]});
 await go('/pos?fixtureRole=Business%20Owner');
 assert.deepEqual(await tables(),['inventory','quick_items']);assert.equal(await page.locator('[data-inv-pos-add]').count(),7);
 assert.equal(await page.evaluate(()=>window.resourceCalls.filter(c=>c.rpc==='get_app_config').length),1,'verified initial config is handed off once');
 await clear();await page.locator('#custom-item-name').fill('Independent custom work');await page.locator('#custom-item-price').fill('50');await page.locator('[data-action="add-custom-item"]').click();await page.locator('[data-qty]').first().click();assert.deepEqual(await tables(),[],'cart changes have no unrelated reads');
 await page.locator('[data-inv-search]').fill('Zzz rare stock');await page.locator('[data-inv-pos-add="1001"]').waitFor();
 await page.locator('[data-inv-pos-add="1001"]').click();await page.getByText('Zzz rare stock',{exact:true}).first().waitFor();
 await page.evaluate(()=>window.fixtureHoldTable='inventory');await page.locator('[data-inv-search]').fill('Stock 0000');await page.waitForFunction(()=>window.fixtureReleases.length===1);
 await page.locator('[data-inv-search]').fill('Zzz rare stock');await page.locator('[data-inv-pos-add="1001"]:enabled').waitFor();await page.evaluate(()=>window.fixtureReleases.shift()());await page.waitForTimeout(30);assert.equal(await page.locator('[data-inv-pos-add="1001"]').count(),1,'old search cannot replace current query');
 await clear();await page.locator('[data-modal="repair"]').click();await page.locator('[data-form="repair"]').waitFor();assert.equal(await page.evaluate(async()=>(await import('/src/shared.js')).state.data.repairComponents.length),31,'cold intake loads complete choices across API caps');assert.deepEqual([...new Set(await tables())],['repair_components']);await page.locator('[data-close]').last().click();
 await page.locator('[data-action="open-udhar"]').click();await page.getByRole('heading',{name:'Outstanding Credits'}).waitFor();await page.locator('[data-close]').last().click();
 await page.locator('[data-action="open-return"]').click();await page.locator('[name="receiptNo"]').fill('2026102500');await clear();await page.locator('[data-form="return-lookup"]').evaluate(form=>form.requestSubmit());await page.waitForFunction(()=>window.resourceCalls.some(c=>c.rpc==='get_retail_return_context'));assert.ok((await tables()).every(table=>table==='sales'));await page.locator('[data-close]').last().click();
 results.push('POS bounded entrance, one-use config, cart independence, old inventory discovery, reverse search ownership, complete cold intake, deferred Udhar and targeted return context');
 await go('/admin/dashboard?fixtureRole=Business%20Owner');assert.equal(await page.locator('[data-kpi-target="employees"] .value').innerText(),'1001');
 assert.equal(await page.evaluate(async()=>(await import('/src/shared.js')).state.data.sales.length),8);assert.ok(!(await tables()).includes('returns'));assert.equal(await page.evaluate(()=>window.resourceCalls.filter(c=>c.rpc==='get_unified_udhar_accounts').length),0);
 await go('/admin/reports?fixtureRole=Business%20Owner');assert.deepEqual([...new Set(await tables())],['sales']);
 const reports=await page.evaluate(()=>window.resourceCalls.filter(c=>c.rpc==='get_financial_report'));assert.equal(reports.length,1);assert.equal(reports[0].args.p_from,null);assert.equal(reports[0].args.p_to,null);
 assert.equal(await page.evaluate(async()=>(await import('/src/shared.js')).state.data.sales.length),15);
 await clear();await page.locator('[data-action="reprint-receipt"]').first().click();await page.waitForFunction(()=>window.fixturePrints.length===1);assert.equal((await page.evaluate(()=>window.fixturePrints[0].items))[0].name,'Persisted exact line');assert.ok((await page.evaluate(()=>window.resourceCalls.find(c=>c.table==='sales').ops)).some(([op,columns])=>op==='select'&&columns==='*'));
 results.push('Dashboard exact counts independent of seven-row API cap; Reports canonical global scope and fifteen bounded previews; reprint fetches complete selected sale');
 await go('/admin/inventory?fixtureRole=Business%20Owner');await page.locator('[data-filter]').fill('Zzz rare stock');await page.locator('[data-inv-edit="1001"]').waitFor();await page.locator('[data-inv-edit="1001"]').click();await page.locator('[data-form="inv-edit"]').waitFor();assert.equal(await page.locator('[name="cost"]').inputValue(),'60');await page.locator('[data-close]').last().click();
 await go('/admin/employees?fixtureRole=Business%20Owner');await page.locator('[data-filter]').fill('Zzz older employee');await page.locator('[data-emp-id="1001"]').first().waitFor();
 await go('/admin/catalog?fixtureRole=Business%20Owner');assert.deepEqual([...new Set(await tables())],['quick_items']);await clear();await page.locator('[data-catalog-tab="components"]').click();await page.locator('[data-catalog-tab="components"].active').waitFor();await ready();assert.deepEqual([...new Set(await tables())],['repair_components']);
 await page.locator('[data-filter]').fill('Component 030');await page.getByText('Component 030',{exact:true}).waitFor();
 await go('/admin/settings?fixtureRole=Business%20Owner&tab=contact');const legal=await page.evaluate(()=>window.resourceCalls.filter(c=>c.rpc==='get_legal_status').length);await page.evaluate(()=>window.resourceRouteDone=null);await page.locator('[data-settings-tab="legal"]').click();await ready();assert.equal(await page.evaluate(()=>window.resourceCalls.filter(c=>c.rpc==='get_legal_status').length),legal+1);await clear();await page.evaluate(()=>window.resourceRouteDone=null);await page.locator('[data-settings-tab="contact"]').click();await ready();assert.equal(await page.evaluate(()=>window.resourceCalls.filter(c=>c.rpc==='get_legal_status').length),0);
 results.push('Server inventory/directory/catalog search reaches old rows; exact editor detail; active catalog tab only; Legal read only in owner Legal context');
 for(const roots of [0,10,100]){
  await go('/workshop?fixtureRole=Business%20Owner&roots='+roots);assert.equal(await page.evaluate(()=>window.resourceCalls.filter(c=>c.rpc==='get_repair_family_summary').length),0);assert.ok(!(await tables()).includes('repair_components'));
  if(roots===100){const seen=[];while(true){seen.push(...await page.locator('[data-family-finance]').evaluateAll(nodes=>nodes.map(n=>n.dataset.familyFinance)));const next=page.locator('[data-workshop-page="next"]');if(await next.isDisabled())break;const old=await page.locator('[data-family-finance]').first().getAttribute('data-family-finance');await next.click();await page.waitForFunction(old=>document.querySelector('[data-family-finance]')?.dataset.familyFinance!==old,old);}assert.equal(new Set(seen).size,100);assert.equal(seen.length,100);await page.locator('[data-workshop-page="previous"]').click();await page.locator('[data-family-finance="9"]').waitFor();}
 }
 await go('/workshop?fixtureRole=Business%20Owner&roots=10');await page.locator('[data-family-finance]').first().click();await page.getByText('Outstanding:',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.resourceCalls.filter(c=>c.rpc==='get_repair_family_summary').length),1);
 await page.evaluate(()=>window.fixtureHoldRPC='get_repair_family_summary');await page.locator('[data-family-finance]').nth(1).click();await page.waitForFunction(()=>window.fixtureRPCReleases.length===1);await navigate('/pos');await page.evaluate(()=>window.fixtureRPCReleases.shift()());assert.equal(await page.locator('[data-family-finance]').count(),0);
 await go('/workshop?fixtureRole=Orbito%20Support&roots=10');await page.evaluate(()=>window.fixtureRevokeConsent=true);await page.locator('[data-family-finance]').first().click();await page.getByText('Selected family totals unavailable.',{exact:true}).waitFor();assert.equal(await page.getByText('Outstanding:',{exact:false}).count(),0);
 await go('/workshop?fixtureRole=Technician&roots=10');assert.equal(await page.locator('[data-family-finance]').count(),0);assert.equal(await page.evaluate(()=>window.resourceCalls.filter(c=>c.rpc==='get_repair_family_summary').length),0);
 await go('/workshop?fixtureRole=Manager&roots=10');await page.waitForURL('**/admin/dashboard');assert.equal(await page.evaluate(()=>window.resourceCalls.filter(c=>c.rpc==='get_repair_family_summary').length),0);
 results.push('Workshop 0/10/100 roots have zero startup summary RPCs; all 100 roots reachable without gaps; selected summary only, departed result ignored, revoked Support error and Technician/Manager denial');
 await go('/admin/ems?fixtureRole=Business%20Owner&fixtureEMS=true');assert.deepEqual([...new Set(await tables())],['attendance']);
 await clear();await page.locator('[data-ems-attendance-filter]').fill('Employee');assert.deepEqual(await tables(),[],'local presentation does not fetch');await page.locator('[data-ems-attendance-filter]').fill('');
 await page.locator('[data-ems-server-search]').fill('Zzz old attendance');await page.locator('[data-ems-run-search]').click();await page.getByText('Zzz old attendance',{exact:true}).waitFor();assert.deepEqual([...new Set(await tables())],['attendance']);
 await clear();await page.locator('[data-ems-tab="leaves"]').click();await page.locator('[data-ems-tab="leaves"].active').waitFor();assert.ok((await tables()).includes('leaves'));assert.ok(!(await tables()).includes('salary_slips'));await clear();await page.locator('[data-ems-leave-filter="Approved"]').click();assert.deepEqual(await tables(),[]);
 await clear();await page.locator('[data-ems-tab="salary"]').click();await page.locator('[data-ems-tab="salary"].active').waitFor();assert.deepEqual(new Set(await tables()),new Set(['employees','salary_config','attendance']));
 results.push('EMS attendance loads no payroll/leave history, local filters have zero reads, remote historical search finds older row, and each tab owns only its dependencies plus live banner');
 await go('/admin/receipts?fixtureRole=Business%20Owner');await page.getByRole('heading',{name:'Current receipts data unavailable'}).waitFor();assert.equal(await page.locator('[data-action="open-receipt-modal"]').count(),0);
 await go('/admin/receipts?fixtureRole=Business%20Owner&roots=2&sales=5');await page.locator('[data-receipt-search]').fill('CHILD');assert.equal(await page.locator('[data-action="open-receipt-modal"]').count(),2);
 results.push('Large legacy archive is explicitly unavailable rather than truncated; small complete archive retains exact child/family search');
 await go('/admin/repairs?fixtureRole=Business%20Owner&boundedReads=1&roots=1001&sales=5');
 assert.equal(await page.locator('[data-view-ticket]').count(),25);await page.getByText('1–25 of 1001 matching records',{exact:true}).waitFor();
 await page.locator('[data-filter]').fill('CHILD');await page.locator('[data-view-ticket="1"]').waitFor();assert.equal(await page.locator('[data-view-ticket]').count(),1);await page.getByText('Matched child: CHILD',{exact:false}).waitFor();
 assert.equal(await page.evaluate(()=>window.resourceCalls.filter(c=>c.rpc==='get_repair_family_summary').length),0);
 await go('/workshop?fixtureRole=Business%20Owner&boundedReads=1&roots=1001&sales=5');
 await page.locator('[data-ws-filter]').fill('CHILD');await page.locator('[data-family-finance="1"]').waitFor();assert.equal(await page.locator('[data-family-finance]').count(),1);assert.equal(await page.evaluate(()=>window.resourceCalls.filter(c=>c.rpc==='get_repair_family_summary').length),0);
 await go('/admin/receipts?fixtureRole=Business%20Owner&boundedReads=1&roots=2');
 assert.equal(await page.locator('[data-action="open-receipt-modal"]').count(),25);await page.getByText('1–25 of 1004 matching records',{exact:true}).waitFor();
 await clear();await page.locator('[data-action="open-receipt-modal"]').first().click();await page.getByText('Persisted exact line',{exact:false}).first().waitFor();
 assert.equal(await page.evaluate(()=>window.resourceCalls.filter(c=>c.table==='sales').length),1,'Header opening fetches only the selected complete sale');await page.locator('[data-close]').last().click();
 await page.locator('[data-receipt-search]').fill('CHILD');await page.getByText('2 on this complete family selection · 2 matching receipts / invoices',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-action="open-receipt-modal"]').count(),2);assert.match(await page.locator('[data-action="open-receipt-modal"]').first().innerText(),/CHILD/);
 await page.locator('[data-receipt-from]').fill('2026-10-25');await page.locator('[data-receipt-to]').fill('2026-10-25');await page.getByText('2 on this complete family selection · 2 matching receipts / invoices',{exact:true}).waitFor();
 await page.locator('[data-receipt-type]').selectOption('retail');await page.getByText('0 on this page · 0 matching receipts / invoices',{exact:true}).waitFor();
 await page.locator('[data-action="clear-receipt-filter"]').click();await page.getByText('1–25 of 1004 matching records',{exact:true}).waitFor();
 results.push('Advertised M2 reads: global child search reaches off-page roots in Admin and Workshop; 25-row unified archive, selected full detail, cross-date exact family and type/date/clear filters; no monetary startup calls');
 await go('/pos?fixtureRole=Business%20Owner&boundedReads=1&roots=1001&sales=5');
 await page.evaluate(()=>window.fixtureRows.tickets.find(t=>t.id===1).is_locked=false);
 await page.locator('[data-action="open-repair-collection"]').first().click();await page.locator('[data-repair-search]').waitFor();
 await page.getByText('1–25 of 1001 matching records',{exact:true}).waitFor();await page.locator('[data-repair-search]').fill('CHILD');
 await page.locator('.modal [data-collect-ticket="1"]').waitFor();assert.equal(await page.locator('.modal [data-collect-ticket]').count(),1);
 assert.equal(await page.evaluate(async()=>(await import('/src/shared.js')).state.data.tickets.length),2,'Collection loads the complete selected family, not capped member matches');
 results.push('POS collection is deferred and uses bounded global family search only on an advertised backend; off-page root/child selection stays complete');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(await page.evaluate(()=>window.fixtureWrites.length),0);
 console.log(JSON.stringify({result:'PASS',results,errors,external,scope:'Actual browser/application; synthetic SDK data and print capture; no hosted RLS/SQL or physical printing claim'},null,2));
 if(process.env.M2_BROWSER_EVIDENCE){await mkdir(process.env.M2_BROWSER_EVIDENCE,{recursive:true});await writeFile(process.env.M2_BROWSER_EVIDENCE+'/resource-browser.json',JSON.stringify({result:'PASS',results,errors,external},null,2));}
}catch(error){
 const failedPage=browser?.contexts()?.[0]?.pages()?.[0];
 const view=await failedPage?.evaluate(()=>({url:location.href,text:document.getElementById('app')?.innerText?.slice(0,1800),calls:window.resourceCalls})).catch(()=>null);
 if(process.env.M2_BROWSER_EVIDENCE){await mkdir(process.env.M2_BROWSER_EVIDENCE,{recursive:true});await writeFile(process.env.M2_BROWSER_EVIDENCE+'/resource-browser-failure.json',JSON.stringify({error:error.stack,errors,external,results,view},null,2));}
 throw error;
}finally{await browser?.close();await server.close();}
