// Real thermal renderer, local exact dependency bytes, synthetic metering sink.
// No printer or hosted service is contacted. Run --baseline BEFORE CDN edits.
import {createServer} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const baseline=process.argv.includes('--baseline'),out=process.env.M3_EVIDENCE_DIR;
if(!out)throw Error('M3_EVIDENCE_DIR required');
await mkdir(out,{recursive:true});
const original=execFileSync('git',['show','2dffa1ea:src/print/print.js'],{encoding:'utf8'});
const asset=await readFile(process.env.M3_BARCODE_FILE);
const result={baseline,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dependencySHA256:createHash('sha256').update(asset).digest('hex'),provenance:'author-run real renderer; exact version bytes fulfilled locally; synthetic metering sink; headless print capture; no physical print',scenarios:[]};
const server=await createServer({configFile:false,envDir:false,server:{host:'127.0.0.1',port:0},plugins:[{name:'print-fixture',enforce:'pre',configureServer(server){server.middlewares.use('/m3-print-fixture',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><body></body>');});},resolveId:id=>id.startsWith('virtual:m3-')?'\0'+id:null,load:id=>id==='\0virtual:m3-shared'?'export const CFG=window.printCFG;export const money=x=>"PKR "+Number(x).toFixed(2);':id==='\0virtual:m3-debug'?'export const dlog=()=>{};export const dstack=()=>{};':id==='\0virtual:m3-thermal'?`export {measureThermal} from '/src/platform/thermal.js';export const queueThermalIntent=async intent=>{window.printIntents.push(intent);};`:null,transform(code,id){if(!id.replaceAll('\\','/').endsWith('/src/print/print.js'))return null;return (baseline?original:code).replaceAll("'../shared.js'","'virtual:m3-shared'").replaceAll("'../debuglog.js'","'virtual:m3-debug'").replaceAll("'../platform/thermal.js'","'virtual:m3-thermal'");}}]});
let browser;
try{
 await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,args:['--disable-gpu'],executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});result.browser=browser.version();
 for(const mode of ['normal','blocked','slow']){
  const context=await browser.newContext();
  await context.route('**/*',async route=>{
   const url=route.request().url();
   if(url.startsWith('https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/')){
    if(mode==='blocked')return route.abort();
    if(mode==='slow')await new Promise(resolve=>setTimeout(resolve,650));
    return route.fulfill({contentType:'application/javascript',body:asset});
   }
   return url.startsWith(origin+'/')?route.continue():route.abort();
  });
  const page=await context.newPage();await page.goto(origin+'/m3-print-fixture');
  await page.evaluate(()=>{
   document.body.replaceChildren();window.printIntents=[];window.printed=[];window.printCFG={shop_name:'Synthetic Merchant',shop_address:'Address',shop_phone:'123',currency:'PKR',terms_text:'Merchant terms'};
   const append=Node.prototype.appendChild;
   Node.prototype.appendChild=function(node){const value=append.call(this,node);if(node.tagName==='IFRAME'){node.contentWindow.focus=()=>{};node.contentWindow.print=()=>window.printed.push({at:performance.now(),text:node.contentDocument.body.textContent,barcodes:[...node.contentDocument.querySelectorAll('.bc')].map(x=>({value:x.dataset.val,bars:x.querySelectorAll('rect').length})),height:node.contentDocument.body.getBoundingClientRect().height,copies:node.contentDocument.querySelectorAll('section').length||1});}return value;};
  });
  const observation=await page.evaluate(async baseline=>{
   const p=await import('/src/print/print.js'),start=performance.now();
   const sale={receiptNo:'INV-SYNTHETIC-1',items:[{name:'Synthetic item',qty:2,soldPrice:100}],total:200,subtotal:200,tax:0,payment:'Cash',date:'2026-10-28T09:00:00Z'};
   const first=p.printThermal(p.buildReceiptSlip(sale,true),{copies:2});
   const second=p.printThermal(p.buildTicketSlip({ticket_number:'TK-SYNTHETIC-2',invoice_number:'INV-SYNTHETIC-2',customer_name:'Customer',final_total:125,created_at:'2026-10-28T09:00:00Z',components_noted:[]}));
   await Promise.all([first,second]);
   let attribution=null;
   if(!baseline){
    const before=window.printIntents.length;
    await p.printThermal(p.buildReceiptSlip(sale,true),{copies:2,attribution:true});
    attribution={intent:window.printIntents[before],printed:window.printed.at(-1)};
   }
   return {elapsed:performance.now()-start,intents:window.printIntents.slice(0,2),printed:window.printed.slice(0,2),attribution};
  },baseline);
  assert.equal(observation.intents.length,2);assert.equal(observation.printed.length,2);
  assert.deepEqual(observation.intents.map(x=>x.document_reference),['INV-SYNTHETIC-1','INV-SYNTHETIC-2']);
  assert.equal(observation.intents[0].copies,2);assert.equal(observation.printed[0].copies,2);
  if(mode!=='blocked'||!baseline){assert.ok(observation.printed.every(x=>x.barcodes.every(b=>b.bars>0)));assert.ok(observation.intents.every(x=>x.measurement_status==='estimated'));}
  else assert.ok(observation.intents.every(x=>x.measurement_status==='unavailable'));
  if(!baseline){assert.ok(observation.attribution.printed.text.includes('Powered by RetraSell'));assert.ok(observation.attribution.intent.estimated_mm>observation.intents[0].estimated_mm);}
  result.scenarios.push({mode,...observation});await context.close();
 }
}catch(error){result.failure=error.message;process.exitCode=1;}
finally{await browser?.close();await server.close();await writeFile(join(out,baseline?'print-dependency-baseline.json':'print-candidate.json'),JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({baseline,scenarios:result.scenarios.map(x=>({mode:x.mode,elapsed:Math.round(x.elapsed),status:x.intents.map(i=>i.measurement_status)})),failure:result.failure||null}));
