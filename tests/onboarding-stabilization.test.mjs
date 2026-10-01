import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
import {runSetup,parseEnv,validateInputs} from '../scripts/byo-setup.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const keys=['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','owner_reservation','bridge_mode','config_projection','database_reachable','bridge_configuration','edge_functions','runtime_configuration','authentication'];
function runtimeFixture({missingSecret=false,missingFunction=false,dbError=false,missingPrivilege=false,authError=false}={}){
 const env={SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_ANON_KEY:'public-anon',SUPABASE_SERVICE_ROLE_KEY:'private-service',TURNSTILE_SECRET:missingSecret?'':'private-turnstile',PLATFORM_BRIDGE_CALL_SECRET:'call-credential',PLATFORM_BRIDGE_SOURCE_SECRET:'source-credential',PLATFORM_BRIDGE_ENDPOINT:'https://zyxwvutsrqponmlkjihg.supabase.co/functions/v1/platform-bridge'};
 const ctx={Response,URL,TextEncoder,Uint8Array,crypto,AbortSignal,Deno:{env:{get:k=>env[k]}},fetch:async(url,init)=>{
  assert.equal(init.redirect,'error');assert.equal(init.headers['x-orbito-preflight'],'call-credential');assert.doesNotMatch(JSON.stringify(init),/private-service|private-turnstile/);
  const name=url.split('/').at(-1);return Response.json({contract:'orbito-onboarding-runtime-v1',function:missingFunction && name==='account-admin'?'old':name,configured:!(missingSecret&&['login','password-reset-request'].includes(name))});
 }};vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(read('supabase/functions/_shared/runtime-preflight.ts').replace(/^export /gm,'')),ctx);
 const admin={auth:{admin:{listUsers:async()=>{if(authError)throw Error('private-auth-detail');return {data:{users:[]}}}}},rpc:async()=>({data:{checks:Object.fromEntries(keys.map(k=>[k,!(missingPrivilege&&k==='database_privileges')])),owner_account:'missing'}}),from:()=>({select(){return this},eq(){return this},single:async()=>({data:dbError?null:{id:1},error:dbError?{}:null})})};
 return {ctx,env,run:()=>ctx.checkRuntime(admin,{owner_setup:'owner_setup_pending'})};
}
test('runtime preflight rejects wrong caller, keeps normal requests unchanged and never exposes secret values',async()=>{
 const f=runtimeFixture();assert.equal(await f.ctx.runtimeProbe(new Request('https://shop.test'),'login',['TURNSTILE_SECRET']),null);
 const bad=await f.ctx.runtimeProbe(new Request('https://shop.test',{method:'POST',headers:{'x-orbito-preflight':'wrong'}}),'login',['TURNSTILE_SECRET']);assert.equal(bad.status,401);
 const good=await f.ctx.runtimeProbe(new Request('https://shop.test',{method:'POST',headers:{'x-orbito-preflight':'call-credential'}}),'login',['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','TURNSTILE_SECRET']);assert.equal((await good.json()).configured,true);
 assert.equal(good.headers.get('Cache-Control'),'no-store');
 f.env.TURNSTILE_SECRET='';const missing=await f.ctx.runtimeProbe(new Request('https://shop.test',{method:'POST',headers:{'x-orbito-preflight':'call-credential'}}),'login',['TURNSTILE_SECRET']);assert.equal((await missing.json()).configured,false);
});
test('bridge-ready alone cannot mask missing function, Turnstile, service permissions or failed real database read',async()=>{
 assert.equal((await runtimeFixture().run()).infrastructure,'ready');
 for(const options of [{missingSecret:true},{missingFunction:true},{dbError:true},{missingPrivilege:true},{authError:true}]){const r=await runtimeFixture(options).run();assert.equal(r.infrastructure,'pending');assert.doesNotMatch(JSON.stringify(r),/private-|credential/);}
});
function loginFixture({turnstile=true,support=false,mapped=false}={}){
 let handler,claims=0;const profile={auth_user_id:'owner-id',employee_id:null,email:'owner@example.test',display_name:'Owner',role:'Business Owner',status:'Active'};
 const env={SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_ANON_KEY:'public-anon',SUPABASE_SERVICE_ROLE_KEY:'private-service',TURNSTILE_SECRET:turnstile?'private-turnstile':''};
 const admin={from:table=>({select(){return this},eq(){return this},delete(){return this},maybeSingle:async()=>({data:table==='app_users'&&mapped?profile:null}),single:async()=>({data:{onboarding_version:2,onboarding_completed_at:mapped?'complete':null,suspended:false}})})};
 const auth={auth:{signInWithPassword:async()=>({data:{user:{id:'owner-id'},session:{access_token:'auth-session',refresh_token:'auth-refresh'}}}),getUser:async()=>({data:{user:{id:'owner-id',email:profile.email}}}),signOut:async()=>{}},rpc:async name=>{assert.equal(name,'activate_reserved_owner');claims++;return {data:profile}}};
 const ctx={Response,URL,URLSearchParams,TextEncoder,Uint8Array,crypto,AbortSignal,Deno:{serve:fn=>handler=fn,env:{get:k=>env[k]}},createClient:(_url,key)=>key==='private-service'?admin:auth,fetch:async()=>Response.json({success:true}),console:{error(){assert.fail('unexpected login exception')}}};
 vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes([read('supabase/functions/_shared/runtime-preflight.ts'),read('supabase/functions/login/index.ts')].join('\n').replace(/^import .*$/gm,'').replace(/^export /gm,'')),ctx);
 return {get claims(){return claims},send:()=>handler(new Request('https://shop.test/login',{method:'POST',body:JSON.stringify({email:profile.email,password:'auth-only',turnstileToken:'captcha',mode:support?'support':'shop'})}))};
}
test('real login handler activates reserved owner with optional support configuration absent; re-login needs no new claim',async()=>{
 const f=loginFixture();const response=await f.send();assert.equal(response.status,200);assert.equal((await response.json()).profile.employeeId,null);assert.equal(f.claims,1);
 const returning=loginFixture({mapped:true});assert.equal((await returning.send()).status,200);assert.equal(returning.claims,0);
 const missing=loginFixture({turnstile:false});assert.equal((await missing.send()).status,403);assert.equal(missing.claims,0);
 const support=loginFixture({support:true});assert.equal((await support.send()).status,401);assert.equal(support.claims,0);
});
function wizardFixture(){
 const calls=[],elements=new Map(),cfg={shop_name:'Example',shop_address:'Address',shop_phone:'Phone',shop_email:'business@example.test',primary_color:'#126c5b',secondary_color:'#e9b949',currency:'Rs.',tax_rate:0,invoice_prefix:'INV',ticket_prefix:'TK',terms_text:'',onboarding_version:2};let failOnce=true,completed=0,signouts=0;
 const app={innerHTML:''},elementsFor=id=>{if(id==='app')return app;if(!elements.has(id))elements.set(id,{disabled:false,onclick:null,onsubmit:null});return elements.get(id)};
 const ctx={CFG:cfg,escapeHTML:s=>String(s??''),managedFeatures:()=>[['Printing',true]],fld:(label,name,value,type)=>`<label>${label}<input name="${name}" type="${type}" value="${value??''}"></label>`,document:{getElementById:elementsFor},FormData:class{constructor(form){return Object.entries(form.values)}},FileReader:class{readAsDataURL(){this.result='data:image/png;base64,aGVsbG8=';this.onload()}},invokeAccountAdmin:async(action,payload)=>{calls.push({action,payload});if(failOnce){failOnce=false;return {ok:false,error:'Retry settings'}}if(action==='update-config')Object.assign(cfg,payload.updates);if(action==='complete-onboarding')cfg.onboarding_completed_at='saved';return {ok:true}},loadConfig:async()=>true,applyBranding(){},_clearSession:async()=>{signouts++}};
 vm.createContext(ctx);vm.runInContext(read('src/settings-data.js').replace(/^export /gm,''),ctx);vm.runInContext('function renderOnboarding'+read('src/onboarding.js').split('export function renderOnboarding')[1],ctx);
 const start=()=>ctx.renderOnboarding({employee:{email:'owner@example.test'}},async()=>{completed++});
 const submit=async(values={},logo=false)=>{const alert={textContent:''},back={disabled:false},buttons=[back,{disabled:false}],form={values,elements:{pin:{value:values.pin||''}},querySelector:sel=>sel==='[role="alert"]'?alert:sel==='#onboard-back'?back:sel==='[name="logo"]'?{files:logo?[{type:'image/png',size:100}]:[]}:null,querySelectorAll:()=>buttons};await elementsFor('shop-onboarding').onsubmit({preventDefault(){},currentTarget:form});return alert;};
 start();return {app,cfg,calls,start,submit,back:()=>elementsFor('onboard-back').onclick(),signout:()=>elementsFor('onboard-signout').onclick(),get completed(){return completed},get signouts(){return signouts}};
}
test('all six wizard steps save branding/logo, contact, receipts, PIN, read-only features and idempotent completion; retry/back/resume retain saved values',async()=>{
 const f=wizardFixture();let alert=await f.submit({name:'Saved business'},true);assert.match(alert.textContent,/Retry settings/);assert.match(f.app.innerHTML,/Step 1 of 6/);
 await f.submit({name:'Saved business'},true);assert.equal(f.cfg.shop_name,'Saved business');assert.match(f.cfg.shop_logo,/^data:image\/png/);assert.match(f.app.innerHTML,/Step 2 of 6/);
 f.back();assert.match(f.app.innerHTML,/Saved business/);await f.submit({name:'Saved business'});
 await f.submit({address:'Saved address',phone:'123',email:'business@example.test'});await f.submit({currency:'Rs.',taxRate:'12',invoicePrefix:'inv',ticketPrefix:'tk',receiptFooter:'Thanks'});await f.submit({pin:'4829'});
 const before=f.calls.length;await f.submit();assert.equal(f.calls.length,before);assert.match(f.app.innerHTML,/Step 6 of 6/);
 await f.submit();assert.equal(f.completed,1);assert.equal(f.cfg.onboarding_completed_at,'saved');assert.equal(f.calls.at(-1).action,'complete-onboarding');
 assert.equal(f.cfg.invoice_prefix,'INV');assert.equal(f.cfg.tax_rate,12);assert.ok(f.calls.some(c=>c.action==='set-pin'&&c.payload.pin==='4829'));
 f.start();assert.match(f.app.innerHTML,/Saved business/);f.signout();assert.equal(f.signouts,1);
});
const ref='abcdefghijklmnopqrst',pair=`# orbito-project-ref: ${ref}\n# orbito-client-id: 50\nPLATFORM_BRIDGE_CALL_SECRET=${'a'.repeat(64)}\nPLATFORM_BRIDGE_SOURCE_SECRET=${'b'.repeat(64)}\nPLATFORM_BRIDGE_ENDPOINT=https://zyxwvutsrqponmlkjihg.supabase.co/functions/v1/platform-bridge\n`;
function toolFixture({access=true,ready=true}={}){const commands=[],reports=[],removed=[];return {commands,reports,removed,deps:{root:'/shop',privateFile:path=>path,read:path=>path==='pair'?pair:'TURNSTILE_SECRET=private-test-only\n',report:m=>reports.push(m),invoke:(exe,args)=>{commands.push({exe,args});return exe==='git'?'feature/onboarding-v2':args.includes('--help')?'--use-api --env-file':args[0]==='projects'?JSON.stringify(access?[{id:ref}]:[]):'success'},fetch:async()=>Response.json({contract:'orbito-onboarding-runtime-v1',checks:Object.fromEntries(keys.map(k=>[k,ready])),client_binding:'orbito-client-50'}),remove:path=>removed.push(path)}};}
const toolArgs=['--project-ref',ref,'--pairing-file','pair','--runtime-file','runtime'];
test('BYO tool validates target and access without mutations by default; rejects customer credentials and Client 1',async()=>{
 const f=toolFixture();await runSetup(toolArgs,f.deps);assert.ok(!f.commands.some(c=>['secrets','functions'].includes(c.args[0])&&!c.args.includes('--help')));assert.equal(f.removed.length,0);
 await assert.rejects(runSetup(toolArgs,toolFixture({access:false}).deps),/account cannot access/);
 assert.throws(()=>parseEnv('SUPABASE_SERVICE_ROLE_KEY=private',['TURNSTILE_SECRET']),/unapproved/);
 const pairing=parseEnv(pair,['PLATFORM_BRIDGE_CALL_SECRET','PLATFORM_BRIDGE_SOURCE_SECRET','PLATFORM_BRIDGE_ENDPOINT']);assert.throws(()=>validateInputs('kxmovywgshyltwusghhj',pairing,{values:{}}),/protected/);
 assert.throws(()=>validateInputs(ref,pairing,{values:{}}),/TURNSTILE_SECRET/);
});
test('BYO apply installs only separate allowed files, deploys exact six functions and removes pairing only after successful checks',async()=>{
 const f=toolFixture();await runSetup([...toolArgs,'--apply','--remove-pairing'],f.deps);assert.equal(f.commands.filter(c=>c.args[0]==='secrets'&&!c.args.includes('--help')).length,2);assert.equal(f.commands.filter(c=>c.args[0]==='functions'&&!c.args.includes('--help')).length,6);assert.deepEqual(f.removed,['pair']);assert.doesNotMatch(f.reports.join('\n'),/private-test-only|a{64}|b{64}/);
 const bad=toolFixture({ready:false});await assert.rejects(runSetup([...toolArgs,'--apply','--remove-pairing'],bad.deps),/runtime checks/);assert.equal(bad.removed.length,0);
});
function adminHandlerFixture({role='Business Owner',verified=true}={}){
 let handler;const writes=[],rpcCalls=[];const profile={auth_user_id:'verified-owner',employee_id:null,email:'owner@example.test',role,status:'Active',display_name:'Owner'};
 const admin={from:table=>({select(){return this},eq(){return this},single:async()=>({data:table==='app_users'?profile:{suspended:false}}),update:updates=>{writes.push({table,updates});return {eq:async()=>({})}}}),rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:{}}}};
 const ctx={Response,atob,Deno:{serve:fn=>handler=fn,env:{get:key=>({SUPABASE_URL:'https://shop.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'})[key]}},runtimeProbe:async()=>null,createClient:(_url,key)=>key==='service'?admin:{auth:{getUser:async token=>{assert.equal(token,'session-jwt');return {data:{user:verified?{id:profile.auth_user_id}:null}}}}},console:{error(){assert.fail('unexpected settings exception')}}};
 vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(read('supabase/functions/account-admin/index.ts').replace(/^import .*$/gm,'')),ctx);
 return {writes,rpcCalls,send:async(body)=>{const r=await handler(new Request('https://shop.test/settings',{method:'POST',headers:{Authorization:'Bearer session-jwt'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()}}};
}
test('real account-admin handler saves authenticated owner branding and completes only using verified caller UUID',async()=>{
 const f=adminHandlerFixture();assert.equal((await f.send({action:'update-config',updates:{shop_name:'Saved brand',shop_logo:'data:image/png;base64,aGVsbG8=',owner_email:'attacker@example.test',ems_enabled:true}})).status,200);
 assert.deepEqual(Object.keys(f.writes[0].updates).sort(),['shop_logo','shop_name']);
 assert.equal((await f.send({action:'complete-onboarding',owner:'attacker-id'})).status,200);assert.equal(f.rpcCalls[0].args.p_owner,'verified-owner');
 assert.equal((await adminHandlerFixture({verified:false}).send({action:'update-config',updates:{shop_name:'Denied'}})).status,401);
 const cashier=adminHandlerFixture({role:'Cashier'});assert.equal((await cashier.send({action:'update-config',updates:{shop_name:'Denied'}})).status,403);assert.equal(cashier.writes.length,0);
 assert.equal((await adminHandlerFixture({role:'Orbito Support'}).send({action:'complete-onboarding'})).status,403);
});
test('logo endpoint enforces decoded 512 KB size, supported image MIME and valid base64 for direct callers',async()=>{
 const f=adminHandlerFixture();for(const logo of ['data:image/svg+xml;base64,PHN2Zz4=',`data:image/png;base64,${Buffer.alloc(512*1024+1).toString('base64')}`,'data:image/png;base64,a=bb'])assert.equal((await f.send({action:'update-config',updates:{shop_logo:logo}})).status,403);
 assert.equal(f.writes.length,0);assert.equal((await f.send({action:'update-config',updates:{shop_logo:'data:image/webp;base64,aGVsbG8='}})).status,200);
});
