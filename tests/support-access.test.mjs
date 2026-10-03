import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const supportNames=['PLATFORM_SUPABASE_URL','PLATFORM_SUPABASE_ANON','PLATFORM_AUTH_EMAIL'];
const actor='99000000-0000-4000-8000-000000000001',source='99000000-0000-4000-8000-000000000003',token='a'.repeat(64);
function fixture({configured=true,suspended=true,auditError=false,exchangeStatus=200,assertion={},mappedSupport=false,newSupport=false}={}){
 let handler;const audit=[],writes=[],fetches=[],logs=[];let customerSignins=0,bootstraps=0;
 const email='orbitosupport+abcdefghijklmnopqrst@support.orbito.internal';
 const supportProfile={auth_user_id:'shop-support',employee_id:null,email,display_name:'Orbito Support',role:'Orbito Support',status:'Active'};
 let storedSupport=newSupport?null:supportProfile;
 const ownerProfile={auth_user_id:'shop-owner',employee_id:null,email:'owner@example.test',display_name:'Owner',role:'Business Owner',status:'Active'};
 const env={SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_ANON_KEY:'shop-anon',SUPABASE_SERVICE_ROLE_KEY:'private-service',TURNSTILE_SECRET:'private-turnstile',PLATFORM_BRIDGE_CALL_SECRET:'private-call',PLATFORM_BRIDGE_SOURCE_SECRET:'private-source-'.repeat(4),PLATFORM_BRIDGE_ENDPOINT:'https://zyxwvutsrqponmlkjihg.supabase.co/functions/v1/platform-bridge',
  ...(configured?{PLATFORM_SUPABASE_URL:'https://zyxwvutsrqponmlkjihg.supabase.co',PLATFORM_SUPABASE_ANON:'platform-anon',PLATFORM_AUTH_EMAIL:'obsolete-master@example.test'}:{})};
 const admin={auth:{admin:{getUserById:async()=>({data:{user:{id:supportProfile.auth_user_id,email}}}),generateLink:async()=>{bootstraps++;return {data:{properties:{hashed_token:'support-token'}}};},listUsers:async()=>({data:{users:[]}}),createUser:async payload=>{assert.equal(payload.email,email);assert.equal(payload.email_confirm,true);assert.equal(payload.password,undefined);return {data:{user:{id:supportProfile.auth_user_id,email}}};}}},
  rpc:async name=>name==='bridge_onboarding'?{data:{client_binding:'client-42',source_id:source}}:{data:{checks:Object.fromEntries(['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage','owner_reservation','bridge_mode','config_projection'].map(k=>[k,true])),owner_account:'active'}},
  from:table=>({filter:null,select(){return this},eq(k,v){this.filter=[k,v];return this},
   single:async()=>({data:{id:1,suspended,platform_client_id:42,onboarding_version:2}}),maybeSingle(){assert.equal(table,'app_users');return {data:this.filter[0]==='role'||mappedSupport||this.filter[1]===email?storedSupport:ownerProfile};},
   insert:async payload=>{writes.push({table,payload});if(table==='app_users'){assert.equal(payload.role,'Orbito Support');storedSupport=payload;return {error:null};}assert.equal(table,'support_access_log');audit.push(payload);return {error:auditError?{}:null};},delete(){assert.fail('support must not change owner, credentials or lifecycle');}})};
 const auth={auth:{signInWithPassword:async()=>{customerSignins++;assert.fail('suspended customer/support must not reach password Auth');},verifyOtp:async args=>{assert.equal(args.token_hash,'support-token');return {data:{user:{id:supportProfile.auth_user_id},session:{access_token:'support-session',refresh_token:'support-refresh'}}};}}};
 const ctx=vm.createContext({Request,Response,URL,URLSearchParams,TextEncoder,Uint8Array,crypto:webcrypto,AbortSignal,Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},createClient:(_url,key)=>key==='private-service'?admin:auth,
  console:{error:(...args)=>logs.push(args)},fetch:async(url,init)=>{
   fetches.push({url,init});assert.ok(!url.includes('/auth/v1/token'),'no Platform password auth');
   if(url.includes('siteverify'))return Response.json({success:true});
   if(url.endsWith('/platform-support')){
    assert.equal(init.headers.Authorization,'Bearer '+env.PLATFORM_BRIDGE_SOURCE_SECRET);assert.equal(init.redirect,'error');
    assert.deepEqual(JSON.parse(init.body),{action:'exchange',token,client_id:42,project_ref:'abcdefghijklmnopqrst',client_binding:'client-42',source_id:source});
    return Response.json(exchangeStatus===200?{ok:true,contract:'orbito-support-handoff-v1',platform_user_id:actor,platform_email:'canonical-master@example.test',client_id:42,project_ref:'abcdefghijklmnopqrst',client_binding:'client-42',source_id:source,...assertion}:{error:'expired or replayed'},{status:exchangeStatus});
   }
   return ctx.runtimeProbe(new Request(url,init),url.split('/').at(-1),['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','TURNSTILE_SECRET']);
  }});
 vm.runInContext(stripTypeScriptTypes(['supabase/functions/_shared/runtime-preflight.ts','supabase/functions/_shared/support-handoff.ts','supabase/functions/login/index.ts'].map(read).join('\n').replace(/^import .*$/gm,'').replace(/^export /gm,'')),ctx);
 return {ctx,env,audit,writes,logs,fetches,get customerSignins(){return customerSignins;},get bootstraps(){return bootstraps;},runtime:()=>ctx.checkRuntime(admin,{owner_setup:'owner_active'}),
  send:async(mode,extra={})=>{const body=mode==='support-handoff'?{mode,token,...extra}:{mode,email:'owner@example.test',password:'synthetic-password',turnstileToken:'captcha',...extra};const r=await handler(new Request('https://shop.test/login',{method:'POST',headers:{'user-agent':'handoff-test'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}};
}
test('suspended Shop blocks Business Owner but server handoff bootstraps local support and requires canonical audit',async()=>{
 const f=fixture({configured:false});const owner=await f.send('shop');assert.equal(owner.status,401);assert.match(owner.body.error,/suspended/);assert.equal(f.customerSignins,0);
 const support=await f.send('support-handoff');assert.equal(support.status,200);assert.equal(support.body.isSupportAdmin,true);assert.equal(f.audit.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(f.audit[0])),{platform_user_id:actor,platform_email:'canonical-master@example.test',client_auth_user_id:'shop-support',event:'support_login',user_agent:'handoff-test'});
 assert.equal(f.writes.length,1);assert.equal(f.bootstraps,1);assert.doesNotMatch(JSON.stringify([support,f.logs,f.audit]),/private-service|private-source|private-turnstile|platform-anon|PLATFORM_AUTH_EMAIL|a{64}/);
});
test('handoff fails closed for expired/replayed grants, untrusted assertions, missing pairing and audit failure',async()=>{
 for(const exchangeStatus of [401,403,503]){const f=fixture({exchangeStatus}),r=await f.send('support-handoff');assert.equal(r.status,401);assert.equal(f.bootstraps,0);assert.equal(r.body.session,undefined);}
 for(const assertion of [{client_id:99},{project_ref:'wrong'},{client_binding:'wrong'},{source_id:'wrong'},{platform_user_id:''},{platform_email:''},{contract:'wrong'}]){const f=fixture({assertion});assert.equal((await f.send('support-handoff')).status,401);assert.equal(f.bootstraps,0);}
 for(const key of ['PLATFORM_BRIDGE_ENDPOINT','PLATFORM_BRIDGE_SOURCE_SECRET']){const f=fixture();f.env[key]='';assert.equal((await f.send('support-handoff')).status,401);assert.equal(f.fetches.length,0);}
 const f=fixture({auditError:true}),r=await f.send('support-handoff');assert.equal(r.status,401);assert.match(r.body.error,/audit.*denied/i);assert.equal(r.body.session,undefined);
 const invalid=fixture();assert.equal((await invalid.send('support-handoff',{token:'bad'})).status,401);assert.equal(invalid.fetches.length,0);assert.equal((await invalid.send('support-handoff',{email:'browser@example.test'})).status,400);
});
test('first handoff creates a password-free local Support identity, verifies its OTP and audits before returning session',async()=>{
 const f=fixture({newSupport:true,configured:false}),r=await f.send('support-handoff');assert.equal(r.status,200);assert.equal(r.body.profile.role,'Orbito Support');assert.equal(f.bootstraps,1);assert.equal(f.audit.length,1);assert.equal(f.writes.length,2);assert.equal(f.writes[0].table,'app_users');assert.equal(f.writes[1].table,'support_access_log');assert.equal(f.customerSignins,0);
});
test('old support password route and mapped support password route cannot authenticate',async()=>{
 const f=fixture(),r=await f.send('support');assert.equal(r.status,401);assert.match(r.body.error,/Open Shop as Support/);assert.equal(f.fetches.length,0);
 const mapped=fixture({suspended:false,mappedSupport:true});assert.equal((await mapped.send('shop')).status,401);assert.equal(mapped.customerSignins,0);
 assert.doesNotMatch(read('supabase/functions/login/index.ts'),/grant_type=password|verifyPlatformSupport|PLATFORM_SUPABASE_ANON|PLATFORM_AUTH_EMAIL/);assert.doesNotMatch(read('src/auth.js'),/setLoginMode|_loginMode|Enter Support Mode/);
});
test('legacy support configuration presence remains a protected nonsecret compatibility flag',async()=>{
 for(const configured of [true,false]){
  const f=fixture({configured}),r=await f.runtime();assert.equal(r.infrastructure,'ready');assert.equal(r.runtime_details.support_auth_configured,configured);assert.doesNotMatch(JSON.stringify(r),/canonical-master|platform-anon|private-/);
  const probe=await f.ctx.runtimeProbe(new Request('https://shop.test',{method:'POST',headers:{'x-orbito-preflight':'private-call'}}),'login',['TURNSTILE_SECRET']);assert.equal((await probe.json()).support_auth_configured,configured);
  const rejected=await f.ctx.runtimeProbe(new Request('https://shop.test',{method:'POST',headers:{'x-orbito-preflight':'wrong'}}),'login',['TURNSTILE_SECRET']);assert.equal(rejected.status,401);
 }
 for(const missing of supportNames){const f=fixture();f.env[missing]='';const probe=await f.ctx.runtimeProbe(new Request('https://shop.test',{method:'POST',headers:{'x-orbito-preflight':'private-call'}}),'login',['TURNSTILE_SECRET']);assert.equal((await probe.json()).support_auth_configured,false);}
});
