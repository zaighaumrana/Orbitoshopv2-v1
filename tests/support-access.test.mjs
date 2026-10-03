import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const supportNames=['PLATFORM_SUPABASE_URL','PLATFORM_SUPABASE_ANON','PLATFORM_AUTH_EMAIL'];
function fixture({configured=true,suspended=true,auditError=false}={}){
 let handler;const audit=[],writes=[],fetches=[],logs=[];let customerSignins=0;
 const email='orbitosupport+abcdefghijklmnopqrst@support.orbito.internal';
 const supportProfile={auth_user_id:'shop-support',employee_id:null,email,display_name:'Orbito Support',role:'Orbito Support',status:'Active'};
 const ownerProfile={auth_user_id:'shop-owner',employee_id:null,email:'owner@example.test',display_name:'Owner',role:'Business Owner',status:'Active'};
 const env={SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_ANON_KEY:'shop-anon',SUPABASE_SERVICE_ROLE_KEY:'private-service',TURNSTILE_SECRET:'private-turnstile',PLATFORM_BRIDGE_CALL_SECRET:'private-call',PLATFORM_BRIDGE_SOURCE_SECRET:'private-source',PLATFORM_BRIDGE_ENDPOINT:'https://zyxwvutsrqponmlkjihg.supabase.co/functions/v1/platform-bridge',
  ...(configured?{PLATFORM_SUPABASE_URL:'https://zyxwvutsrqponmlkjihg.supabase.co',PLATFORM_SUPABASE_ANON:'platform-anon',PLATFORM_AUTH_EMAIL:'canonical-master@example.test'}:{})};
 const admin={auth:{admin:{getUserById:async()=>({data:{user:{id:supportProfile.auth_user_id,email}}}),generateLink:async()=>({data:{properties:{hashed_token:'support-token'}}}),listUsers:async()=>({data:{users:[]}})}},
  rpc:async()=>({data:{checks:Object.fromEntries(['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','owner_reservation','bridge_mode','config_projection'].map(k=>[k,true])),owner_account:'active'}}),
  from:table=>({filter:null,select(){return this},eq(k,v){this.filter=[k,v];return this},
   single:async()=>({data:{id:1,suspended}}),maybeSingle(){assert.equal(table,'app_users');return {data:this.filter[0]==='role'?supportProfile:ownerProfile}},
   insert:async payload=>{writes.push({table,payload});assert.equal(table,'support_access_log');audit.push(payload);return {error:auditError?{}:null};},delete(){assert.fail('suspended login must not delete customer credentials')}})};
 const auth={auth:{signInWithPassword:async()=>{customerSignins++;assert.fail('suspended customer must not reach Auth')},verifyOtp:async()=>({data:{user:{id:supportProfile.auth_user_id},session:{access_token:'support-session',refresh_token:'support-refresh'}}})}};
 const ctx=vm.createContext({Request,Response,URL,URLSearchParams,TextEncoder,Uint8Array,crypto,AbortSignal,Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},createClient:(_url,key)=>key==='private-service'?admin:auth,
  console:{error:(...args)=>logs.push(args)},fetch:async(url,init)=>{
   fetches.push(url);
   if(url.includes('siteverify'))return Response.json({success:true});
   if(url.includes('/auth/v1/token')){assert.equal(init.headers.apikey,'platform-anon');return Response.json({user:{id:'verified-platform-master',email:'canonical-master@example.test'}});}
   // Exercise the actual authorized runtime probe for each function.
   return ctx.runtimeProbe(new Request(url,init),url.split('/').at(-1),['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','TURNSTILE_SECRET']);
  }});
 vm.runInContext(stripTypeScriptTypes([read('supabase/functions/_shared/runtime-preflight.ts'),read('supabase/functions/login/index.ts')].join('\n').replace(/^import .*$/gm,'').replace(/^export /gm,'')),ctx);
 return {ctx,env,audit,writes,logs,fetches,get customerSignins(){return customerSignins},runtime:()=>ctx.checkRuntime(admin,{owner_setup:'owner_active'}),
  send:async(mode)=>{const r=await handler(new Request('https://shop.test/login',{method:'POST',body:JSON.stringify({mode,email:mode==='support'?'canonical-master@example.test':'owner@example.test',password:'synthetic-password',turnstileToken:'captcha'})}));return {status:r.status,body:await r.json()};}};
}
test('suspended Shop blocks Business Owner but configured support login still authenticates and audits',async()=>{
 const f=fixture();const owner=await f.send('shop');assert.equal(owner.status,401);assert.match(owner.body.error,/suspended/);assert.equal(f.customerSignins,0);
 const support=await f.send('support');assert.equal(support.status,200);assert.equal(support.body.isSupportAdmin,true);assert.equal(f.audit.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(f.audit[0])),{platform_user_id:'verified-platform-master',platform_email:'canonical-master@example.test',client_auth_user_id:'shop-support',event:'support_login',user_agent:null});
 assert.equal(f.writes.length,1);assert.doesNotMatch(JSON.stringify([support,f.logs]),/private-service|private-turnstile|platform-anon|PLATFORM_AUTH_EMAIL/);
});
test('support login on suspended Shop fails closed if its required audit cannot be recorded',async()=>{
 const f=fixture({auditError:true}),result=await f.send('support');assert.equal(result.status,401);assert.match(result.body.error,/audit.*denied/i);assert.equal(result.body.session,undefined);
});
test('support presence is a protected nonsecret boolean independent of customer readiness and suspension',async()=>{
 for(const configured of [true,false]){
  const f=fixture({configured}),r=await f.runtime();assert.equal(r.infrastructure,'ready');assert.equal(r.runtime_details.support_auth_configured,configured);
  assert.doesNotMatch(JSON.stringify(r),/canonical-master|platform-anon|private-/);
  const probe=await f.ctx.runtimeProbe(new Request('https://shop.test',{method:'POST',headers:{'x-orbito-preflight':'private-call'}}),'login',['TURNSTILE_SECRET']);
  assert.equal((await probe.json()).support_auth_configured,configured);
  const rejected=await f.ctx.runtimeProbe(new Request('https://shop.test',{method:'POST',headers:{'x-orbito-preflight':'wrong'}}),'login',['TURNSTILE_SECRET']);assert.equal(rejected.status,401);assert.equal((await rejected.json()).support_auth_configured,undefined);
 }
 for(const missing of supportNames){const f=fixture();f.env[missing]='';const probe=await f.ctx.runtimeProbe(new Request('https://shop.test',{method:'POST',headers:{'x-orbito-preflight':'private-call'}}),'login',['TURNSTILE_SECRET']);assert.equal((await probe.json()).support_auth_configured,false);}
 const absent=await fixture({configured:false}).send('support');assert.equal(absent.status,401);assert.match(absent.body.error,/not configured/);
});
