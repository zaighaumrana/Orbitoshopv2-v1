// Real Shop entry/router/rendering; synthetic Auth and loopback HTTP data service.
// No provider traffic. This is a controlled browser comparison, not hosted speed.
import {createServer} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {findRepairFamilies} from '../src/features/repairs/family.js';
import {buildReceiptRecords,filterReceiptRecords} from '../src/features/admin/checkout/receipts.js';
import {localDateKey} from '../src/datetime.js';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const samples=Number(process.env.PERF_SAMPLES||20),delay=Number(process.env.PERF_RTT||80),cap=Number(process.env.PERF_CAP||1000);
const size=Number(process.env.PERF_HISTORY||10000),products=Number(process.env.PERF_PRODUCTS||1000);
const readContracts=process.env.PERF_READ_CONTRACTS==='1',logoBytes=Number(process.env.PERF_LOGO_BYTES||0);
const logo=logoBytes?'data:image/png;base64,'+Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5p0AAAAASUVORK5CYII=','base64'),Buffer.alloc(logoBytes)]).subarray(0,logoBytes).toString('base64'):null;
const searchEnabled=process.env.PERF_SEARCH==='1',longSession=process.env.PERF_LONG_SESSION==='1';
const fixtureSource=await readFile('tests/shop-entry-browser.mjs','utf8');
const fixture=fixtureSource.slice(fixtureSource.indexOf('function fixture(){'),fixtureSource.indexOf('let browser;'));
const rows={
 inventory:Array.from({length:products},(_,i)=>({id:i+1,name:`Product ${String(i).padStart(6,'0')}`,sku:`SKU-${i}`,category:'Parts',qty:50,price:100,cost:50,min_qty:5})),
 sales:Array.from({length:size},(_,i)=>({id:i+1,invoice_number:`INV-${i+1}`,created_at:'2026-10-25T12:00:00Z',customer_name:'Synthetic customer',total_bill:100,subtotal:100,payment_method:'Cash',items_sold:[{name:'Synthetic item',qty:1,price:100}],employee_name:'Synthetic User'})),
 tickets:Array.from({length:size},(_,i)=>({id:i+1,parent_ticket_id:null,invoice_number:`REP-${i+1}`,created_at:'2026-10-25T12:00:00Z',customer_name:`Synthetic repair ${i}`,customer_phone:'03000000000',device_brand:'Phone',device_model:'Model',status:i<10?'Pending':'Delivered',components_noted:[],estimated_quote:100,final_total:100,amount_paid:i<10?0:100,balance_due:i<10?100:0,is_locked:true})),
 quick_items:Array.from({length:25},(_,i)=>({id:i+1,name:`Quick ${i}`,prices:[{name:'Standard',price:100}],sort_order:i})),
 repair_components:Array.from({length:5},(_,i)=>({id:i+1,name:`Component ${i}`,price:100,sort_order:i})),
 employees:Array.from({length:25},(_,i)=>({id:i+1,name:`Employee ${i}`,role:'Cashier',status:'Active',email:`employee${i}@example.test`})),
 returns:[],attendance:[],leaves:[],salary_config:[],salary_slips:[],
};
const digest=value=>createHash('sha256').update(value).digest('hex');
function like(value,pattern){
 let regex='';const input=String(pattern).replace(/^"|"$/g,'');
 for(let i=0;i<input.length;i++){let c=input[i];if(c==='\\'&&i+1<input.length){c=input[++i];regex+=c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}else regex+=c==='%'||c==='*'?'.*':c==='_'?'.':c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
 return new RegExp('^'+regex+'$','i').test(String(value??''));
}
function orMatch(row,value){
 const parts=String(value).match(/(?:"(?:\\.|[^"])*"|[^,])+/g)||[];
 return parts.some(part=>{const match=/^(.*)\.(ilike|eq|is|gt)\.(.*)$/.exec(part);if(!match)return false;const [,key,op,arg]=match,v=row[key];return op==='ilike'?like(v,arg):op==='is'?arg==='null'?v==null:v===arg:op==='gt'?Number(v)>Number(arg):String(v)===arg});
}
function resultFor({table,ops}){
 const orders=[];let data=rows[table]||[];let count=null,single=false,projection='*',offset=0,limit=cap;
 for(const [op,...a] of ops){
  if(op==='select'){projection=a[0]||'*';if(a[1]?.count)count=data.length;}
  if(op==='eq')data=data.filter(r=>String(r[a[0]])===String(a[1]));
  if(op==='is')data=data.filter(r=>(r[a[0]]??null)===a[1]);
  if(op==='in')data=data.filter(r=>a[1].includes(r[a[0]]));
  if(op==='neq')data=data.filter(r=>r[a[0]]!==a[1]);
  if(op==='not'&&a[1]==='in'){const values=a[2].replace(/[()\"]/g,'').split(',');data=data.filter(r=>!values.includes(r[a[0]]));}
  if(op==='gt')data=data.filter(r=>r[a[0]]>a[1]);
  if(op==='gte')data=data.filter(r=>r[a[0]]>=a[1]);
  if(op==='lt')data=data.filter(r=>r[a[0]]<a[1]);
  if(op==='lte')data=data.filter(r=>r[a[0]]<=a[1]);
  if(op==='ilike')data=data.filter(r=>like(r[a[0]],a[1]));
  if(op==='or')data=data.filter(r=>orMatch(r,a[0]));
  if(op==='order')orders.push(a);
  if(op==='range'){offset=a[0];limit=Math.min(cap,a[1]-a[0]+1);}
  if(op==='limit')limit=Math.min(cap,a[0]);
  if(op==='single'||op==='maybeSingle')single=true;
 }
 data=[...data].sort((x,y)=>{for(const [key,options]of orders){const direction=options?.ascending===false?-1:1;if(x[key]<y[key])return -direction;if(x[key]>y[key])return direction}return 0});
 if(ops.some(([op,a,b])=>op==='select'&&b?.count))count=data.length;
 data=data.slice(offset,offset+limit);
 if(projection!=='*'&&!projection.includes('*')&&!projection.includes('(')){const fields=projection.split(',').map(x=>x.trim());data=data.map(r=>Object.fromEntries(fields.map(k=>[k,r[k]])));}
 return {data:ops.some(([op,a,b])=>op==='select'&&b?.head)?null:single?data[0]||null:data,error:null,count};
}
function rpcResult(body){
 if(['get_app_config','get_public_shop_config'].includes(body.rpc)&&body.result?.data)return {...body.result,data:{...body.result.data,...(logo?{shop_logo:logo}:{}),...(readContracts&&body.rpc==='get_app_config'?{read_contracts:{repair_families:1,receipt_archive:1}}:{})}};
 const a=body.args;
 if(body.rpc==='get_repair_family_page'){
  let families=findRepairFamilies(rows.tickets,a.p_search);
  if(a.p_context==='workshop')families=families.filter(f=>!['Delivered','Declined','Cancelled'].includes(f.root.status));
  const statusCounts={};for(const f of families)statusCounts[f.root.status]=(statusCounts[f.root.status]||0)+1;
  families=families.filter(f=>a.p_status==='all'||f.root.status===a.p_status).sort((x,y)=>new Date(y.root.created_at)-new Date(x.root.created_at)||y.root.id-x.root.id);
  return {data:{contract:1,offset:a.p_offset,size:a.p_limit,count:families.length,statusCounts,rows:families.slice(a.p_offset,a.p_offset+a.p_limit).map(f=>({id:f.root.id,created_at:f.root.created_at,status:f.root.status}))},error:null};
 }
 if(body.rpc==='get_receipt_archive_page'){
  const records=buildReceiptRecords([...rows.sales].reverse(),[...rows.tickets].reverse());
  const filtered=filterReceiptRecords(records,{receiptSearch:a.p_search,receiptType:a.p_type,receiptDateFrom:a.p_from?localDateKey(a.p_from):'',receiptDateTo:a.p_to?localDateKey(new Date(new Date(a.p_to).getTime()-1)):''});
  const exact=records.filter(r=>r.kind==='ticket'&&(a.p_type==='all'||r.type===a.p_type)&&r.invoiceNumber.toLowerCase().trim()===a.p_search.toLowerCase().trim());
  return {data:{contract:1,offset:a.p_offset,size:a.p_limit,count:filtered.length,mode:exact.length?'family':'page',matches:exact.filter(r=>filtered.some(x=>x.key===r.key)).map(r=>({id:r.id,rootTicketId:r.rootTicketId})),rows:exact.length?[]:filtered.slice(a.p_offset,a.p_offset+a.p_limit).map(({raw,parent,...header})=>header)},error:null};
 }
 return body.result;
}
function transport(){
 const sdk=window.fixtureSDK,originalFrom=sdk.from,originalRPC=sdk.rpc,originalInvoke=sdk.functions.invoke;
 window.perfReads=[];window.perfAuth={user:0,session:0};
 for(const [method,key] of [['getUser','user'],['getSession','session']]){const original=sdk.auth[method];sdk.auth[method]=async(...args)=>{window.perfAuth[key]++;return original(...args)};}
 const send=async(body)=>{const start=performance.now();const response=await fetch('/__performance-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const text=await response.text();window.perfReads.push({table:body.table,rpc:body.rpc,fn:body.fn,ops:body.ops,start,end:performance.now(),bytes:new TextEncoder().encode(text).length});return JSON.parse(text);};
 sdk.from=table=>{
  if(table==='app_users')return originalFrom(table);
  const ops=[],builder={then:(yes,no)=>{window.fixtureCalls.push({table});return send({table,ops}).then(yes,no)}};
  for(const name of ['select','eq','is','in','neq','gt','gte','lt','lte','not','order','limit','range','ilike','or','abortSignal'])builder[name]=(...args)=>{ops.push([name,...args]);return builder};
  for(const name of ['single','maybeSingle'])builder[name]=()=>{ops.push([name]);return builder};return builder;
 };
 sdk.rpc=async(name,args)=>{const result=await originalRPC(name,args);return send({rpc:name,args,result});};
 sdk.functions.invoke=async(name,args)=>{const result=await originalInvoke(name,args);return send({fn:name,result});};
}
const sourceRef=process.env.PERF_SOURCE_REF,snapshot=new Map();
const server=await createServer({configFile:false,envDir:false,root:process.cwd(),server:{host:'127.0.0.1',port:0,watch:sourceRef?{ignored:['**/src/**']}:{}},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_SUPABASE_ANON':JSON.stringify('synthetic-public'),'import.meta.env.VITE_TURNSTILE_SITE_KEY':JSON.stringify('synthetic-site')},plugins:[{name:'performance-data',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0performance-sdk':null,load(id){if(id==='\0performance-sdk')return 'export const createClient=()=>window.fixtureSDK;';const path=id.replaceAll('\\','/'),root=process.cwd().replaceAll('\\','/')+'/';if(sourceRef&&path.startsWith(root+'src/')){const relative=path.slice(root.length);if(!snapshot.has(relative))snapshot.set(relative,execFileSync('git',['show',sourceRef+':'+relative],{encoding:'utf8'}));return snapshot.get(relative);}},transform(code,id){if(id.endsWith('/src/router.js'))return code.replace('await match.handler(match.params, query, navigation)', 'await match.handler(match.params, query, navigation);if(navigation.isCurrent())window.perfRouteDone=location.pathname+location.search');},configureServer(server){server.middlewares.use('/__performance-data',async(req,res)=>{let input='';for await(const chunk of req)input+=chunk;const body=JSON.parse(input);const result=body.table?resultFor(body):rpcResult(body);await new Promise(resolve=>setTimeout(resolve,delay));res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));});}}]});
const scenarios=(process.env.PERF_SCREENS||'pos,dashboard,reports,workshop,inventory,catalog,receipts,ems,customer-support').split(',');
const output={source:execFileSync('git',['rev-parse',sourceRef||'HEAD'],{encoding:'utf8'}).trim(),appDiff:sourceRef?'Snapshot loaded from immutable Git ref '+sourceRef:execFileSync('git',['diff','--','src'],{encoding:'utf8'}),started:new Date().toISOString(),environment:{os:os.version(),cpu:os.cpus()[0].model,cores:os.cpus().length,node:process.version,browser:null,build:'Vite development, identical transform cache warmup',network:`loopback HTTP response delay ${delay}ms; uncompressed; no hosted traffic`,cpuThrottle:4,cache:'cold=new browser context; warm=same page after settings route; Vite transform cache warm',auth:'synthetic native Auth, counted separately; table/RPC/functions use real loopback HTTP'},fixture:{history:size,products,activeRoots:10,apiCap:cap,readContracts,logoBytes,logoSha256:logo?digest(logo):null,hash:digest(JSON.stringify(rows)),fixtureCode:digest(fixture),harnessHash:digest(await readFile(import.meta.filename)),searchEnabled,longSession},definitions:{useful:'current route rendered, required state resources ready, and active EMS tab rendered; POS includes verified required inventory/quick selectors; cold intake is checked separately',time:'browser performance.now from route request to useful predicate (ms)',bytes:'UTF-8 decoded JSON response bytes; actual loopback encodedBodySize recorded separately; no compression',classification:'Auth local fixture calls; configuration RPCs; remaining table/RPC/function HTTP route reads',p95:'nearest-rank ceil(0.95*n)-1; all samples retained'},samples:[],searches:[],longSession:[],failures:[]};
let browser;
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});output.environment.browser=browser.version();
 const useful=async(page,screen)=>{await page.evaluate(async()=>{window.perfState=(await import('/src/shared.js')).state});await page.waitForFunction((screen)=>{const state=window.perfState;return window.perfRouteDone===location.pathname+location.search&&document.querySelector('#app .app-shell')&&document.querySelector('#app h1')&&Object.values(state.resources||{}).every(r=>r.status==='ready'||r.status==='disabled')&&!document.querySelector('#app [role="alert"]')&&(screen!=='ems'||!!document.querySelector('[data-ems-tab]'))&&(screen!=='pos'||!!document.querySelector('#custom-item-name'))},screen,{timeout:25000});};
 for(let run=-1;run<samples;run++)for(const screen of scenarios){
  const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.request().url().includes('challenges.cloudflare.com')?r.fulfill({contentType:'application/javascript',body:'/* synthetic */'}):r.abort());await context.addInitScript({content:fixture+';fixture();('+transport.toString()+')();'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.message)});const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const path=screen==='pos'||screen==='workshop'?'/'+screen:'/admin/'+screen;
  try{for(const cache of ['cold','warm']){
   let start;if(cache==='cold'){await page.goto(origin+path+'?fixtureRole=Business%20Owner&fixtureEMS=true');start=0;}else{await page.evaluate(async()=>{(await import('/src/router.js')).navigate('/admin/settings?tab=contact')});await useful(page,'settings');await page.evaluate(()=>{window.perfReads=[];window.perfAuth={user:0,session:0};performance.clearResourceTimings()});start=await page.evaluate(async(path)=>{const start=performance.now();window.perfRouteDone=null;(await import('/src/router.js')).navigate(path);return start},path);}
   await useful(page,screen);const record=await page.evaluate(({start,screen,cache,run})=>({screen,cache,run,usefulMs:performance.now()-start,reads:window.perfReads,auth:window.perfAuth,network:performance.getEntriesByType('resource').filter(r=>r.name.includes('/__performance-data')).map(r=>({start:r.startTime,end:r.responseEnd,transfer:r.transferSize,encoded:r.encodedBodySize,decoded:r.decodedBodySize})),dom:document.getElementsByTagName('*').length,heap:performance.memory?.usedJSHeapSize}),{start,screen,cache,run});if(run>=0)output.samples.push(record);
  }
  if(searchEnabled&&['pos','inventory'].includes(screen)){
   const input=screen==='pos'?'[data-inv-search]':'[data-filter]',all=screen==='pos'?'[data-inv-pos-add]':'[data-inv-edit]',match=screen==='pos'?'[data-inv-pos-add="'+products+'"]':'[data-inv-edit="'+products+'"]';
   const begin=await page.evaluate(()=>({time:performance.now(),index:window.perfReads.length}));
   await page.locator(input).fill('Product '+String(products-1).padStart(6,'0'));
   let status='DISCOVERABLE';
   if(sourceRef==='4186b5181a39679b6c26637db295174346b25e4f'&&products>cap){await page.waitForTimeout(350);status=await page.locator(match).count()?'DISCOVERABLE':'NOT_DISCOVERABLE_CAPPED_BASELINE';}
   else await page.waitForFunction(({match,all})=>{const row=document.querySelector(match);return row&&!row.disabled&&document.querySelectorAll(all).length===1},{match,all},{timeout:25000});
   const search=await page.evaluate(({begin,screen,run,status})=>({screen,run,status,ms:performance.now()-begin.time,reads:window.perfReads.slice(begin.index)}),{begin,screen,run,status});if(run>=0)output.searches.push(search);
  }
  }catch(error){let diagnostic;try{diagnostic=await page.evaluate(()=>({routeDone:window.perfRouteDone,path:location.pathname+location.search,resources:window.perfState?.resources,role:window.perfState?.role,body:document.querySelector('#app')?.textContent?.slice(0,4000),reads:window.perfReads,auth:window.perfAuth,requests:performance.getEntriesByType('resource').filter(x=>x.name.includes('/__performance-data')).map(x=>({name:x.name,start:x.startTime,end:x.responseEnd}))}))}catch(e){diagnostic={error:e.message}}output.failures.push({run,screen,error:error.message,errors,url:page.url(),diagnostic});console.log('FAIL',screen,run,error.message.slice(0,180));}finally{await context.close();}
  if(run>=0)console.log('sample',run+1,screen);
 }
 if(longSession){
  const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.request().url().includes('challenges.cloudflare.com')?r.fulfill({contentType:'application/javascript',body:'/* synthetic */'}):r.abort());await context.addInitScript({content:fixture+';fixture();('+transport.toString()+')();'});
  const page=await context.newPage(),cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Performance.enable');await cdp.send('HeapProfiler.enable');
  try{
   await page.goto(origin+'/pos?fixtureRole=Business%20Owner&fixtureEMS=true');await useful(page,'pos');
   const cycle=['pos','inventory','workshop','customer-support'];
   for(let i=1;i<=100;i++){
    const screen=cycle[i%cycle.length],path=['pos','workshop'].includes(screen)?'/'+screen:'/admin/'+screen;
    await page.evaluate(async path=>{window.perfRouteDone=null;(await import('/src/router.js')).navigate(path)},path);await useful(page,screen);
    // Remove only fixture instrumentation; do not clear application state/caches.
    await page.evaluate(()=>{window.perfReads.length=0;window.fixtureCalls.length=0;performance.clearResourceTimings()});
    if(i%20===0){await cdp.send('HeapProfiler.collectGarbage');const metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value])),dom=await cdp.send('Memory.getDOMCounters');output.longSession.push({transition:i,heapUsed:metrics.JSHeapUsedSize,heapTotal:metrics.JSHeapTotalSize,...dom});console.log('heap transition',i)}
   }
  }finally{await context.close()}
 }
}finally{
 if(browser)await browser.close();await server.close();output.finished=new Date().toISOString();
 const p=(a,q)=>[...a].sort((x,y)=>x-y)[Math.ceil(q*a.length)-1];output.summary=[];
 for(const screen of scenarios)for(const cache of ['cold','warm']){const records=output.samples.filter(r=>r.screen===screen&&r.cache===cache);if(!records.length)continue;const times=records.map(r=>r.usefulMs);output.summary.push({screen,cache,n:records.length,medianMs:p(times,.5),p95Ms:p(times,.95),minMs:Math.min(...times),maxMs:Math.max(...times),requests:p(records.map(r=>r.reads.length),.5),config:p(records.map(r=>r.reads.filter(x=>x.rpc?.includes('config')).length),.5),bytes:p(records.map(r=>r.reads.reduce((s,x)=>s+x.bytes,0)),.5),familySummary:p(records.map(r=>r.reads.filter(x=>x.rpc==='get_repair_family_summary').length),.5)});}
 const median=a=>{const values=[...a].sort((x,y)=>x-y);return (values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2};
 for(const summary of output.summary){const records=output.samples.filter(r=>r.screen===summary.screen&&r.cache===summary.cache);summary.medianMs=median(records.map(r=>r.usefulMs));}
 output.searchSummary=scenarios.filter(screen=>output.searches.some(s=>s.screen===screen)).map(screen=>{const records=output.searches.filter(s=>s.screen===screen);return {screen,n:records.length,statuses:[...new Set(records.map(s=>s.status))],medianMs:median(records.map(s=>s.ms)),p95Ms:p(records.map(s=>s.ms),.95),requests:median(records.map(s=>s.reads.length))}});
 const directory=process.env.PERF_EVIDENCE;if(directory){await mkdir(directory,{recursive:true});await writeFile(directory+'/browser-performance.json',JSON.stringify(output,null,2));}console.log(JSON.stringify({summary:output.summary,failures:output.failures},null,2));if(output.failures.length)process.exitCode=1;
}
