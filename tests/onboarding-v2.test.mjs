import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import { needsOnboarding, managedFeatures } from '../src/onboarding-state.js'
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8')
const fixturePayload = {request_id:'10000000-0000-4000-8000-000000000001',owner_name:'Test Owner',owner_email:'owner@example.test',shop_url:'https://shop.example.test'}
function fixture({already=false,conflict=false,inviteError=false,unknown=false,finishError=false,sdkUnknown=false}={}) {
  let handler; const calls=[],invites=[],clients=[]
  const admin={rpc:async(name,args)=>{
    calls.push({name,args})
    if(args.p_action==='claim') return conflict?{error:{message:'private database details'}}:{data:already?{already_provisioned:true,owner_invite:'owner_invite_sent'}:{lease_id:'lease',request_id:fixturePayload.request_id}}
    if(args.p_action==='finish') return finishError?{error:{message:'private error'}}:{data:{owner_invite:'owner_invite_sent',onboarding:'onboarding_pending'}}
    return {data:{infrastructure:'ready',owner_setup:'owner_setup_pending',owner_invite:'owner_invite_failed',onboarding:'onboarding_pending'}}
  },auth:{admin:{inviteUserByEmail:async(email,options)=>{
    invites.push({email,options}); if(unknown) throw Error('private-auth-credential')
    if(sdkUnknown) return {error:{message:'private-network-credential',status:0,name:'AuthRetryableFetchError'}}
    return inviteError?{error:{message:'private-smtp-password',status:422}}:{data:{user:{id:'auth-owner'}}}
  }}}}
  const source=[read('supabase/functions/platform-bridge/onboarding.ts'),read('supabase/functions/platform-bridge/index.ts')].join('\n').replace(/^import .*$/gm,'').replace(/^export /gm,'')
  vm.runInNewContext(stripTypeScriptTypes(source),{
    Response,URL,TextEncoder,Uint8Array,crypto,AbortSignal,checkRuntime:async (_admin,status)=>status,
    Deno:{serve:fn=>handler=fn,env:{get:key=>({PLATFORM_BRIDGE_CALL_SECRET:'test-call',SUPABASE_URL:'https://shop.example.test',SUPABASE_SERVICE_ROLE_KEY:'private-shop-key'})[key]}},
    createClient:(url,key)=>{clients.push({url,key});return admin},
    console:{log:()=>assert.fail('no logging'),error:()=>assert.fail('no logging')},
  })
  return {calls,invites,clients,send:async(token='test-call',payload=fixturePayload,operation='invite-owner')=>{
    const r=await handler(new Request('https://shop.example.test/bridge',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({operation,payload})}))
    const body=await r.json();assert.doesNotMatch(JSON.stringify(body),/private-/);return {status:r.status,body}
  }}
}
test('bootstrap is rejected before any database or Auth work without correct bridge secret',async()=>{
  for(const token of ['', 'wrong', 'private-shop-key']) {const f=fixture();assert.equal((await f.send(token)).status,401);assert.equal(f.clients.length+f.calls.length+f.invites.length,0)}
})
test('explicit optional invitation reserves identity before Shop-owned email and maps after invite',async()=>{
  const f=fixture();assert.equal((await f.send()).status,200)
  assert.deepEqual(f.calls.map(c=>c.args.p_action),['claim','finish']);assert.equal(f.invites.length,1)
  assert.equal(f.clients[0].key,'private-shop-key');assert.equal(f.invites[0].email,fixturePayload.owner_email)
  assert.equal(f.invites[0].options.redirectTo,'https://shop.example.test/invite/accept')
  assert.equal(f.invites[0].options.data.owner_name,'Test Owner')
  assert.equal(Object.hasOwn(f.invites[0].options,'password'),false)
})
test('retry returns already provisioned without a second Auth invitation',async()=>{
  const f=fixture({already:true});assert.equal((await f.send()).body.already_provisioned,true);assert.equal(f.invites.length,0)
})
test('conflicting owner fails closed before Auth work',async()=>{
  const f=fixture({conflict:true});assert.equal((await f.send()).status,409);assert.equal(f.invites.length,0)
})
test('optional SMTP failure preserves infrastructure and manual activation',async()=>{
  const f=fixture({inviteError:true});const result=await f.send();assert.equal(result.status,200)
  assert.equal(result.body.invitation,'failed');assert.equal(result.body.infrastructure,'ready');assert.deepEqual(f.calls.map(c=>c.args.p_action),['claim','failed','status'])
})
test('unknown Auth or profile-write outcomes retain reservation for identity recovery',async()=>{
  for(const options of [{unknown:true},{finishError:true},{sdkUnknown:true}]){const f=fixture(options);assert.equal((await f.send()).body.invitation,'pending');assert.ok(!f.calls.some(c=>c.args.p_action==='failed'))}
})
test('unsafe invite destinations rejected before DB or Auth',async()=>{
  for(const shop_url of ['http://shop.example.test','https://name:password@shop.example.test','https://shop.example.test/?secret=x']) {
    const f=fixture();assert.equal((await f.send('test-call',{...fixturePayload,shop_url})).status,409);assert.equal(f.calls.length+f.invites.length,0)
  }
})
test('wizard requires explicit V2 state and Business Owner; existing Shop/staff/support excluded',()=>{
  const pending={onboarding_version:2,onboarding_completed_at:null}
  for(const role of ['Manager','Cashier','Technician','Orbito Support']) assert.equal(needsOnboarding({employee:{role}},pending),false)
  const owner={employee:{role:'Business Owner'}}
  assert.equal(needsOnboarding(owner,pending),true);assert.equal(needsOnboarding(owner,{}),false)
  assert.equal(needsOnboarding(owner,{...pending,onboarding_completed_at:'2026-09-29'}),false)
  assert.equal(needsOnboarding({...owner,isSupportAdmin:true},pending),false)
})
test('module summary is read-only, canonical, and printing survives disabled Paper Resupply',()=>{
  const features=new Map(managedFeatures({technician_module_enabled:true,ems_enabled:false,ems_track_breaks:true,paper_resupply_enabled:false}))
  assert.equal(features.get('Technician / Workshop'),true);assert.equal(features.get('Break Tracking'),false)
  assert.equal(features.get('Printing & Thermal Tracking'),true);assert.equal(features.get('Paper Resupply'),false)
})
test('password acceptance uses authenticated Auth update and settings share the existing secured endpoint',()=>{
  const ui=read('src/onboarding.js');assert.match(ui,/sb.auth.updateUser\(\{ password:/)
  assert.doesNotMatch(ui,/localStorage|console\.(log|error)|SERVICE_ROLE/)
  assert.match(ui,/settingsUpdates\(form\)/);assert.match(read('src/admin/admin.js'),/settingsUpdates\(form\)/)
})


function applicationFixture({loaded=true,suspended=false,role='Business Owner',version=2,complete=null}={}) {
 const routes=new Map(), navigation=[], app={innerHTML:''}, elements=new Map();let notFound,cleared=0;
 const ctx={CFG:{suspended,onboarding_version:version,onboarding_completed_at:complete},state:{},
  loadConfig:async()=>loaded,applyBranding(){},_clearSession:async()=>{cleared++},resetClientEntitlements(){},dlog(){},
  sb:{auth:{onAuthStateChange(){}}},renderLogin(){},loadCurrentSession:async()=>null,
  needsOnboarding,can:()=>true,renderOnboarding(){},ensureOwnerAcceptance:async(_client,_session,proceed)=>proceed(),
  clearRoutes(){routes.clear()},registerRoute:(p,fn)=>routes.set(p,fn),registerNotFound:fn=>notFound=fn,
  navigate:p=>navigation.push(p),startRouter(){},
  document:{getElementById:id=>id==='app'?app:(elements.get(id)||elements.set(id,{}).get(id))},
  window:{location:{pathname:'/admin/dashboard'},addEventListener(){}},location:{pathname:'/admin/dashboard',reload(){}},navigator:{},sessionStorage:{removeItem(){}}};
 const source=read('src/main.js').replace(/^import .*$/gm,'').replace(/\nboot\(\)\s*$/,'')
  .replaceAll("await import('./onboarding.js')","await Promise.resolve({renderOnboarding:globalThis.renderOnboarding})");
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,routes,navigation,app,get cleared(){return cleared},get notFound(){return notFound},
  login:()=>ctx.onLoginSuccess({employee:{role,email:'owner@example.test'}})};
}
test('failed private configuration read blocks all application routes instead of skipping first run',async()=>{
 const f=applicationFixture({loaded:false});await f.login();assert.equal(f.ctx.state.role,null);
 assert.equal(f.routes.size,0);assert.equal(f.navigation.length,0);assert.match(f.app.innerHTML,/setup unavailable/);
 f.notFound('/admin/dashboard');assert.match(f.app.innerHTML,/setup unavailable/);
});
test('pending owner is forced through onboarding for login and arbitrary redirects',async()=>{
 const f=applicationFixture();await f.login();assert.deepEqual([...f.routes.keys()],['/onboarding']);
 assert.equal(f.navigation.at(-1),'/onboarding');f.notFound('/pos');assert.equal(f.navigation.at(-1),'/onboarding');
});
test('invite callback and normal login retain suspension checks; Support remains exempt',async()=>{
 const f=applicationFixture({suspended:true});await f.login();assert.equal(f.cleared,1);assert.ok(!f.routes.has('/onboarding'));
 const support=applicationFixture({suspended:true,role:'Orbito Support'});await support.login();assert.equal(support.cleared,0);assert.ok(support.routes.has('/admin/dashboard'));
});
function inviteFixture({email='owner@example.test',reserved='owner@example.test',rpcError=false}={}) {
 const status={textContent:''},form={elements:{password:{value:'Secure123!'},confirm:{value:'Secure123!'}},
  querySelector:selector=>selector==='button'?{}:status,reset(){}},app={innerHTML:'',querySelector:selector=>selector==='form'?form:status};
 const updates=[],rpcCalls=[];let done=0;
 const ctx={URLSearchParams,location:{hash:'#access_token=fixture-token&refresh_token=fixture-refresh',search:''},history:{replaceState(){}},
  document:{getElementById:()=>app},CFG:{shop_name:'Test Shop'},escapeHTML:s=>s,validatePassword:()=>null,
  sb:{rpc:async name=>{rpcCalls.push(name);return {data:{owner_email:reserved},error:rpcError?{}:null}},auth:{
   setSession:async()=>({data:{session:{}}}),getUser:async()=>({data:{user:{email}}}),
   updateUser:async value=>{updates.push(value);return {}},}}};
 vm.createContext(ctx);vm.runInContext(read('src/onboarding.js').split('export function renderOnboarding')[0].replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);
 return {app,status,updates,rpcCalls,run:()=>ctx.acceptInvite(async()=>{done++}),submit:()=>form.onsubmit({preventDefault(){},currentTarget:form}),get done(){return done}};
}
test('invite route rejects arbitrary sessions, mismatched email and pending mappings before asking for a password',async()=>{
 for(const options of [{email:'stranger@example.test'},{reserved:'other@example.test'},{rpcError:true}]) {
  const f=inviteFixture(options);await f.run();assert.match(f.status.textContent,/reserved Shop owner/);
  assert.doesNotMatch(f.app.innerHTML,/Create your password/);assert.equal(f.updates.length,0);
 }
});
test('reserved owner establishes password only through the authenticated Shop Auth session',async()=>{
 const f=inviteFixture();await f.run();await f.submit();assert.deepEqual(f.rpcCalls,['get_owner_invite_context']);
 assert.equal(f.updates.length,1);assert.equal(f.updates[0].password,'Secure123!');assert.equal(f.done,1);
});
function accountFixture() {
 const ctx={Deno:{env:{get:()=>''},serve(){}},Response,console:{error(){}}};vm.createContext(ctx);
 vm.runInContext(stripTypeScriptTypes(read('supabase/functions/account-admin/index.ts').replace(/^import .*$/gm,'')),ctx);return ctx;
}
test('V2 owner-email updates are rejected before Auth or profile mutation for both Owner and Support',async()=>{
 const ctx=accountFixture();let writes=0;
 const admin={from:()=>({select:()=>({eq:()=>({single:async()=>({data:{onboarding_version:2}})})})}),auth:{admin:{updateUserById:()=>{writes++;assert.fail('Identity mutation')}}}};
 for(const role of ['Business Owner','Orbito Support'])assert.equal((await ctx.updateOwner(admin,{role},{email:'replacement@example.test'})).ok,false);
 assert.equal(writes,0);
});
test('ordinary config cannot write owner identity; null/invalid tax cannot satisfy setup',async()=>{
 const ctx=accountFixture(),writes=[];const admin={from:()=>({update:value=>{writes.push(value);return {eq:async()=>({})}}})};
 for(const tax_rate of [null,'0',-1,101])assert.equal((await ctx.updateConfig(admin,{role:'Business Owner'},{updates:{tax_rate}})).ok,false);
 assert.equal(writes.length,0);
 assert.equal((await ctx.updateConfig(admin,{role:'Business Owner'},{updates:{shop_name:'Saved brand',owner_email:'replacement@example.test',tax_rate:0}})).ok,true);
 assert.deepEqual(Object.keys(writes[0]).sort(),['shop_name','tax_rate']);
});

test('default bootstrap reserves the owner and prepares infrastructure without any SMTP or Auth invite',async()=>{
 const f=fixture({inviteError:true});const r=await f.send('test-call',fixturePayload,'bootstrap');assert.equal(r.status,200);assert.equal(r.body.infrastructure,'ready');assert.equal(r.body.owner_setup,'owner_setup_pending');assert.deepEqual(f.calls.map(c=>c.args.p_action),['reserve']);assert.equal(f.invites.length,0);
});
function manualLoginFixture({verifiedEmail='owner@example.test',verifiedId='owner-id',claimError=false,profileRole='Business Owner'}={}){
 const calls=[];const profile={auth_user_id:'owner-id',employee_id:null,email:'owner@example.test',display_name:'Owner',role:profileRole,status:'Active'};
 const ctx={Deno:{env:{get:()=>''},serve(){}},Response};vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(read('supabase/functions/login/index.ts').replace(/^import .*$/gm,'')),ctx);
 const auth={auth:{signInWithPassword:async input=>{calls.push(['auth-password',input]);return {data:{user:{id:'owner-id'},session:{access_token:'shop-session',refresh_token:'shop-refresh'}}}},getUser:async token=>{calls.push(['verified-auth',token]);return {data:{user:{id:verifiedId,email:verifiedEmail}}}},signOut:async()=>calls.push(['signout'])},rpc:async(...args)=>{calls.push(['rpc',...args]);return {data:profile,error:claimError?{}:null}}};
 return {calls,run:()=>ctx.signInReservedOwner(auth,'owner@example.test','auth-only-password')};
}
test('manual login verifies Shop Auth and invokes a password-free no-argument owner claim',async()=>{
 const f=manualLoginFixture();assert.equal((await f.run()).ok,true);assert.deepEqual(f.calls.map(c=>c[0]),['auth-password','verified-auth','rpc']);assert.deepEqual(f.calls[2],['rpc','activate_reserved_owner']);assert.doesNotMatch(JSON.stringify(f.calls.slice(1)),/auth-only-password/);
});
test('manual login denies email or UUID mismatch before the owner claim and rejects conflicting profiles',async()=>{
 for(const options of [{verifiedEmail:'stranger@example.test'},{verifiedId:'stranger-id'}]){const f=manualLoginFixture(options);assert.equal((await f.run()).ok,false);assert.ok(!f.calls.some(c=>c[0]==='rpc'));}
 for(const options of [{claimError:true},{profileRole:'Cashier'}]){const f=manualLoginFixture(options);assert.equal((await f.run()).ok,false);assert.equal(f.calls.at(-1)[0],'signout');}
});

function restoredOwnerFixture({existing=null,claimedId='owner-id'}={}){
 let claims=0,signouts=0;const ctx={state:{},sessionStorage:{removeItem(){}},profileToSession:p=>({employee:p}),sb:{auth:{getUser:async()=>({data:{user:{id:'owner-id'}}}),signOut:async()=>{signouts++}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:existing,error:existing?null:{}})})})}),rpc:async()=>{claims++;return {data:{auth_user_id:claimedId,employee_id:null,email:'owner@example.test',display_name:'Owner',role:'Business Owner',status:'Active'}}}}};
 vm.createContext(ctx);const source=read('src/shared.js').split('export async function loadCurrentSession()')[1].split('export function _saveSession')[0];vm.runInContext('async function loadCurrentSession()'+source,ctx);
 return {run:()=>ctx.loadCurrentSession(),get claims(){return claims},get signouts(){return signouts}};
}
test('verified restored owner session uses the same canonical activation instead of an independent identity system',async()=>{
 const f=restoredOwnerFixture();assert.equal((await f.run()).employee.role,'Business Owner');assert.equal(f.claims,1);assert.equal(f.signouts,0);
});
test('session restoration rejects a different claimed UUID and does not reactivate inactive profiles',async()=>{
 const wrong=restoredOwnerFixture({claimedId:'different-id'});assert.equal(await wrong.run(),null);assert.equal(wrong.signouts,1);
 const inactive=restoredOwnerFixture({existing:{auth_user_id:'owner-id',status:'Inactive'}});assert.equal(await inactive.run(),null);assert.equal(inactive.claims,0);assert.equal(inactive.signouts,1);
});
