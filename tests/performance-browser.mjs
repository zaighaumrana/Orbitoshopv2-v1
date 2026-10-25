// Real Shop entry/router/rendering; synthetic Auth and loopback HTTP data service.
// No provider traffic. This is a controlled browser comparison, not hosted speed.
import {createServer} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const samples=Number(process.env.PERF_SAMPLES||20),delay=Number(process.env.PERF_RTT||80),cap=Number(process.env.PERF_CAP||1000);
const size=Number(process.env.PERF_HISTORY||10000),products=Number(process.env.PERF_PRODUCTS||1000);
const fixtureSource=await readFile('tests/shop-entry-browser.mjs','utf8');
const fixture=fixtureSource.slice(fixtureSource.indexOf('function fixture(){'),fixtureSource.indexOf('let browser;'));
const rows={
 inventory:Array.from({length:products},(_,i)=>({id:i+1,name:`Product ${String(i).padStart(6,'0')}`,sku:`SKU-${i}`,category:'Parts',qty:50,price:100,cost_price:50,low_stock_threshold:5})),
 sales:Array.from({length:size},(_,i)=>({id:i+1,invoice_number:`INV-${i+1}`,created_at:'2026-10-25T12:00:00Z',customer_name:'Synthetic customer',total_bill:100,subtotal:100,payment_method:'Cash',items_sold:[{name:'Synthetic item',qty:1,price:100}],employee_name:'Synthetic User'})),
 tickets:Array.from({length:size},(_,i)=>({id:i+1,parent_ticket_id:null,invoice_number:`REP-${i+1}`,created_at:'2026-10-25T12:00:00Z',customer_name:`Synthetic repair ${i}`,customer_phone:'03000000000',device:'Phone',status:i<10?'Pending':'Delivered',components_noted:[],total:100,paid:0})),
 quick_items:Array.from({length:25},(_,i)=>({id:i+1,name:`Quick ${i}`,price:100,sort_order:i,variants:[]})),
 repair_components:Array.from({length:5},(_,i)=>({id:i+1,name:`Component ${i}`,price:100,sort_order:i})),
 employees:Array.from({length:25},(_,i)=>({id:i+1,name:`Employee ${i}`,role:'Cashier',status:'Active',email:`employee${i}@example.test`})),
 returns:[],attendance:[],leaves:[],salary_config:[],salary_slips:[],
};
const digest=value=>createHash('sha256').update(value).digest('hex');
function resultFor({table,ops}){
 let data=rows[table]||[];let count=null,single=false,projection='*',offset=0,limit=cap;
 for(const [op,...a] of ops){
  if(op==='select'){projection=a[0]||'*';if(a[1]?.count)count=data.length;}
  if(op==='eq')data=data.filter(r=>String(r[a[0]])===String(a[1]));
  if(op==='is')data=data.filter(r=>(r[a[0]]??null)===a[1]);
  if(op==='in')data=data.filter(r=>a[1].includes(r[a[0]]));
  if(op==='neq')data=data.filter(r=>r[a[0]]!==a[1]);
  if(op==='not'&&a[1]==='in'){const values=a[2].replace(/[()\"]/g,'').split(',');data=data.filter(r=>!values.includes(r[a[0]]));}
  if(op==='gte')data=data.filter(r=>r[a[0]]>=a[1]);
  if(op==='lt')data=data.filter(r=>r[a[0]]<a[1]);
  if(op==='lte')data=data.filter(r=>r[a[0]]<=a[1]);
  if(op==='ilike'){const value=String(a[1]).replace(/%/g,'').toLowerCase();data=data.filter(r=>String(r[a[0]]||'').toLowerCase().includes(value));}
  if(op==='order'){const direction=a[1]?.ascending===false?-1:1;data=[...data].sort((x,y)=>direction*(x[a[0]]<y[a[0]]?-1:x[a[0]]>y[a[0]]?1:0));}
  if(op==='range'){offset=a[0];limit=Math.min(cap,a[1]-a[0]+1);}
  if(op==='limit')limit=Math.min(cap,a[0]);
  if(op==='single'||op==='maybeSingle')single=true;
 }
 if(ops.some(([op,a,b])=>op==='select'&&b?.count))count=data.length;
 data=data.slice(offset,offset+limit);
 if(projection!=='*'&&!projection.includes('*')&&!projection.includes('(')){const fields=projection.split(',').map(x=>x.trim());data=data.map(r=>Object.fromEntries(fields.map(k=>[k,r[k]])));}
 return {data:ops.some(([op,a,b])=>op==='select'&&b?.head)?null:single?data[0]||null:data,error:null,count};
}
function transport(){
 const sdk=window.fixtureSDK,originalFrom=sdk.from,originalRPC=sdk.rpc,originalInvoke=sdk.functions.invoke;
 window.perfReads=[];window.perfAuth={user:0,session:0};
 for(const [method,key] of [['getUser','user'],['getSession','session']]){const original=sdk.auth[method];sdk.auth[method]=async(...args)=>{window.perfAuth[key]++;return original(...args)};}
 const send=async(body)=>{const start=performance.now();const response=await fetch('/__performance-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const text=await response.text();window.perfReads.push({table:body.table,rpc:body.rpc,fn:body.fn,ops:body.ops,start,end:performance.now(),bytes:new TextEncoder().encode(text).length});return JSON.parse(text);};
 sdk.from=table=>{
  if(table==='app_users')return originalFrom(table);
  const ops=[],builder={then:(yes,no)=>{window.fixtureCalls.push({table});return send({table,ops}).then(yes,no)}};
  for(const name of ['select','eq','is','in','neq','gte','lt','lte','not','order','limit','range','ilike','or','abortSignal'])builder[name]=(...args)=>{ops.push([name,...args]);return builder};
  for(const name of ['single','maybeSingle'])builder[name]=()=>{ops.push([name]);return builder};return builder;
 };
 sdk.rpc=async(name,args)=>{const result=await originalRPC(name,args);return send({rpc:name,args,result});};
 sdk.functions.invoke=async(name,args)=>{const result=await originalInvoke(name,args);return send({fn:name,result});};
}
const server=await createServer({configFile:false,envFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:0},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://synthetic.invalid'),'import.meta.env.VITE_SUPABASE_ANON':JSON.stringify('synthetic-public'),'import.meta.env.VITE_TURNSTILE_SITE_KEY':JSON.stringify('synthetic-site')},plugins:[{name:'performance-data',enforce:'pre',resolveId:id=>id==='@supabase/supabase-js'?'\0performance-sdk':null,load:id=>id==='\0performance-sdk'?'export const createClient=()=>window.fixtureSDK;':null,transform(code,id){if(id.endsWith('/src/router.js'))return code.replace('await match.handler(match.params, query, navigation)', 'await match.handler(match.params, query, navigation);if(navigation.isCurrent())window.perfRouteDone=location.pathname+location.search');},configureServer(server){server.middlewares.use('/__performance-data',async(req,res)=>{let input='';for await(const chunk of req)input+=chunk;const body=JSON.parse(input);const result=body.table?resultFor(body):body.result;await new Promise(resolve=>setTimeout(resolve,delay));res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));});}}]});
const scenarios=(process.env.PERF_SCREENS||'pos,dashboard,reports,workshop,inventory,catalog,receipts,ems,customer-support').split(',');
const output={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),appDiff:execFileSync('git',['diff','--','src'],{encoding:'utf8'}),started:new Date().toISOString(),environment:{os:os.version(),cpu:os.cpus()[0].model,cores:os.cpus().length,node:process.version,browser:null,build:'Vite development, identical transform cache warmup',network:`loopback HTTP response delay ${delay}ms; uncompressed; no hosted traffic`,cpuThrottle:4,cache:'cold=new browser context; warm=same page after settings route; Vite transform cache warm',auth:'synthetic native Auth, counted separately; table/RPC/functions use real loopback HTTP'},fixture:{history:size,products,activeRoots:10,apiCap:cap,hash:digest(JSON.stringify(rows)),fixtureCode:digest(fixture),harnessHash:digest(await readFile(import.meta.filename))},definitions:{useful:'current route rendered, required state resources ready, and active EMS tab rendered; POS includes verified inventory/quick/intake resources',time:'browser performance.now from route request to useful predicate (ms)',bytes:'UTF-8 decoded JSON response bytes; actual loopback encodedBodySize recorded separately; no compression',classification:'Auth local fixture calls; configuration RPCs; remaining table/RPC/function HTTP route reads',p95:'nearest-rank ceil(0.95*n)-1; all samples retained'},samples:[],failures:[]};
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
  }}catch(error){output.failures.push({run,screen,error:error.message,errors,url:page.url()});console.log('FAIL',screen,run,error.message.slice(0,180));}finally{await context.close();}
  if(run>=0)console.log('sample',run+1,screen);
 }
}finally{
 if(browser)await browser.close();await server.close();output.finished=new Date().toISOString();
 const p=(a,q)=>[...a].sort((x,y)=>x-y)[Math.ceil(q*a.length)-1];output.summary=[];
 for(const screen of scenarios)for(const cache of ['cold','warm']){const records=output.samples.filter(r=>r.screen===screen&&r.cache===cache);if(!records.length)continue;const times=records.map(r=>r.usefulMs);output.summary.push({screen,cache,n:records.length,medianMs:p(times,.5),p95Ms:p(times,.95),minMs:Math.min(...times),maxMs:Math.max(...times),requests:p(records.map(r=>r.reads.length),.5),config:p(records.map(r=>r.reads.filter(x=>x.rpc?.includes('config')).length),.5),bytes:p(records.map(r=>r.reads.reduce((s,x)=>s+x.bytes,0)),.5),familySummary:p(records.map(r=>r.reads.filter(x=>x.rpc==='get_repair_family_summary').length),.5)});}
 const directory=process.env.PERF_EVIDENCE;if(directory){await mkdir(directory,{recursive:true});await writeFile(directory+'/browser-performance.json',JSON.stringify(output,null,2));}console.log(JSON.stringify({summary:output.summary,failures:output.failures},null,2));if(output.failures.length)process.exitCode=1;
}
