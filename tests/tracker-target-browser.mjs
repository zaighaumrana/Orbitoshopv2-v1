// Two independent synthetic builds, actual SDK transport, no hosted requests.
import assert from 'node:assert/strict';
import {build,preview} from 'vite';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const root=process.cwd(),out=process.env.M1_BUILD_EVIDENCE||mkdtempSync(join(tmpdir(),'m1-target-'));
const original={...process.env},records=[];
const sdk=await build({configFile:false,envDir:false,logLevel:'error',build:{write:false,lib:{entry:resolve('node_modules/@supabase/supabase-js/dist/index.mjs'),formats:['es']}}});
const sdkCode=(Array.isArray(sdk)?sdk[0]:sdk).output.find(o=>o.type==='chunk').code;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
try{
 for(const ref of ['aaaaaaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbb']){
  for(const k of Object.keys(process.env))if(k.startsWith('VITE_'))delete process.env[k];
  const url=`https://${ref}.supabase.co`,key='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:'anon',ref,exp:4102444800})).toString('base64url')+'.synthetic';
  Object.assign(process.env,{RETRASELL_CLEAN_PUBLIC_BUILD:'1',VITE_SUPABASE_URL:url,VITE_SUPABASE_ANON:key,VITE_TURNSTILE_SITE_KEY:'synthetic_site_0123456789'});
  const outDir=join(out,ref);
  await build({root,envDir:false,configFile:resolve('vite.config.js'),logLevel:'warn',build:{outDir,emptyOutDir:false}});
  const config=readFileSync(join(outDir,'shop-public-config.js'),'utf8');assert.ok(config.includes(url)&&config.includes(key));
  const assets=readdirSync(join(outDir,'assets')).filter(f=>f.endsWith('.js')).map(f=>readFileSync(join(outDir,'assets',f),'utf8')).join('\n');
  assert.ok(assets.includes(url)&&assets.includes(key),'compiled main uses exact input');assert.ok(!assets.includes(ref==='aaaaaaaaaaaaaaaaaaaa'?'bbbbbbbbbbbbbbbbbbbb.supabase.co':'aaaaaaaaaaaaaaaaaaaa.supabase.co'));
  assert.ok(!readFileSync(join(outDir,'track.html'),'utf8').includes('kxmovywgshyltwusghhj'));
  const server=await preview({configFile:false,root,build:{outDir},preview:{host:'127.0.0.1',port:0}}),origin='http://127.0.0.1:'+server.httpServer.address().port;
  const context=await browser.newContext(),calls=[],escaped=[],errors=[];
  await context.route('**/*',async r=>{
   const q=r.request(),u=q.url();if(u.startsWith(origin+'/'))return r.continue();
   if(u.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js'))return r.fulfill({contentType:'application/javascript',body:sdkCode});
   if(u==='https://challenges.cloudflare.com/turnstile/v0/api.js')return r.fulfill({contentType:'application/javascript',body:'/* blocked synthetic CAPTCHA */'});
   if(!u.startsWith(url+'/')){escaped.push(u);return r.abort();}
   assert.equal(q.headers().apikey,key);calls.push({url:u,method:q.method(),body:q.postData()});
   return r.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(u.endsWith('/public-track')?{ok:true,ticket:{status:'Pending',invoice_number:'SYN-1',customer_name:'Synthetic',created_at:'2026-10-25',components_noted:[]}}:{shop_name:'Synthetic',live_tracking_enabled:true})});
  });
  try{
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/');await page.locator('#login-form').waitFor();assert.ok(calls.some(c=>c.url.endsWith('/get_public_shop_config')),'actual main SDK requests reviewed project');
   await page.goto(origin+'/track.html?t=SYN-1&project_ref=foreign&supabase_url=https://foreign.invalid');await page.waitForFunction(()=>document.querySelector('#search-input').value==='SYN-1');
   await page.locator('#phone-input').fill('03000000000');await page.locator('#track-btn').click();await page.waitForFunction(()=>document.querySelector('#track-btn').disabled===false);
   const lookup=calls.find(c=>c.url.endsWith('/public-track'));assert.ok(lookup);assert.deepEqual(JSON.parse(lookup.body),{identifier:'SYN-1',phone:'03000000000'});
   assert.deepEqual(escaped,[]);assert.deepEqual(errors,[]);records.push({ref,main:true,tracker:true,calls,escaped,errors});
  }finally{await context.close();await new Promise(r=>server.httpServer.close(r));}
 }
 const ref='bbbbbbbbbbbbbbbbbbbb',publicInput=Object.fromEntries(['VITE_SUPABASE_URL','VITE_SUPABASE_ANON','VITE_TURNSTILE_SITE_KEY'].map(k=>[k,process.env[k]]));
 const input=join(out,'explicit-byo-public.json');writeFileSync(input,JSON.stringify(publicInput));
 const command=['scripts/build-verified.mjs','--config',input,'--project-ref',ref];
 writeFileSync(join(out,'explicit-byo-build.txt'),execFileSync(process.execPath,command,{cwd:root,encoding:'utf8'}));
 writeFileSync(join(out,'explicit-byo-verify.txt'),execFileSync(process.execPath,[...command,'--verify-dist'],{cwd:root,encoding:'utf8'}));
 writeFileSync(join(out,'target-results.json'),JSON.stringify(records,null,2));
 console.log('PASS two independent compiled builds: real main/tracker SDK exact public targets, ticket/phone lookup, hostile URL target ignored, all foreign transport blocked. Evidence: '+out);
}finally{await browser.close();for(const k of Object.keys(process.env))if(!(k in original))delete process.env[k];Object.assign(process.env,original);}
