import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRelease} from '../scripts/build-platform-release.mjs';
import {planMigrations,migrationEnvelope} from '../scripts/byo-support-release.mjs';
import {createSupportClient} from '../src/platform/support.js';
import {recoveryStore,RECOVERY_KEY} from '../src/platform/support-recovery.js';
import {safeAdminState,readAdminView,saveAdminView} from '../src/admin/navigation-state.js';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const id='97000000-0000-4000-8000-000000000001',sid='97000000-0000-4000-8000-000000000002';
test('release CLI refuses to overwrite the accepted artifact and leaves its exact bytes intact',()=>{
 const file=new URL('../../orbito/supabase/functions/_shared/shop-release.json',import.meta.url),before=readFileSync(file);
 const result=spawnSync(process.execPath,['scripts/build-platform-release.mjs'],{cwd:new URL('..',import.meta.url),encoding:'utf8',windowsHide:true});
 assert.notEqual(result.status,0);assert.match(result.stderr,/accepted release is frozen/);assert.deepEqual(readFileSync(file),before);
});
test('customer release planner supports fresh and additive exact histories, and stops gaps, conflicts and untracked schemas',()=>{
 const r=buildRelease(undefined,{support:true}),h=r.migrations.slice(0,32).map(m=>({version:m.version,name:m.name,statements:[m.sql]}));
 assert.equal(planMigrations([],r,'fresh',0).length,34);assert.equal(planMigrations(h,r,'existing',100).length,2);
 assert.equal(planMigrations(h.slice(0,5),r,'fresh',100).length,29,'partial fresh install resumes exact prefix');
 for(const [history,mode,count] of [[[], 'fresh',1],[h.slice(1),'existing',100],[h.slice(0,4),'existing',100],[[...h,{version:'foreign'}],'existing',100]])assert.throws(()=>planMigrations(history,r,mode,count));
 assert.throws(()=>planMigrations(h.map((m,i)=>i===0?{...m,statements:['conflict']}:m),r,'existing',100));
 assert.match(migrationEnvelope(r.migrations.at(-1)),/pg_advisory_xact_lock\(71390461\)/);assert.match(migrationEnvelope(r.migrations.at(-1)),/schema_migrations/);
});
test('safe navigation retains only approved non-sensitive view values for the same verified user, role and URL',()=>{
 const state={adminModule:'receipts',receiptType:'repair',receiptDateFrom:'2026-10-01',filter:'private customer',receiptSearch:'phone',modal:{type:'checkout'},settingsTab:'staff'};
 assert.deepEqual(safeAdminState(state),{settingsTab:'staff',receiptDateFrom:'2026-10-01',receiptType:'repair'});
 const history={state:{},replaceState(s){this.state=s}},location={pathname:'/admin/receipts',search:'?view=summary'},session={authUserId:id,employee:{role:'Business Owner'}};
 saveAdminView(history,location,session,state,250);assert.equal(readAdminView(history,location,session).scroll,250);
 assert.equal(readAdminView(history,location,{...session,authUserId:sid}),null);assert.equal(readAdminView(history,{...location,search:''},session),null);assert.ok(!JSON.stringify(history.state).includes('private customer'));
});
test('uncertain Support recovery persists original UUID only after live Auth/actor proof, clears on role/binding/logout and enforces TTL',async()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 let actor={auth_user_id:id,session_id:sid,role:'Business Owner',employee_id:null,source_id:sid,client_binding:'fixture',platform_client_id:42},loggedIn=true,uncertain=true;
 const s={user:{id},access_token:'x.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.x'},sent=[];
 const sb={auth:{getSession:async()=>({data:{session:loggedIn?s:null}}),getUser:async()=>({data:{user:loggedIn?s.user:null}})},rpc:async()=>({data:actor}),functions:{invoke:async(_,{body})=>{sent.push(structuredClone(body));if(body.action==='list')return {data:{tickets:[],has_more:false}};return uncertain?{error:Error('lost')}:{data:{ticket_id:body.request_id}}}}};
 const first=createSupportClient(sb,{storage,project:'synthetic-project'});await first.list();first.view.draft={subject:'Scanner',category:'technical',message:'Reconnect'};await assert.rejects(()=>first.create());assert.ok(map.has(RECOVERY_KEY));const pending=first.view.pending;
 const refreshed=createSupportClient(sb,{storage,project:'synthetic-project'});await refreshed.list();assert.deepEqual(refreshed.view.pending,pending);uncertain=false;await refreshed.create();assert.deepEqual(sent.filter(x=>x.action==='create'),[pending,pending]);assert.equal(map.size,0);
 recoveryStore(storage,()=>100).save('scope',pending);assert.equal(recoveryStore(storage,()=>100+7*3600000).restore('scope'),null);
 uncertain=true;first.view.draft={subject:'Again',category:'billing_question',message:'Question'};await assert.rejects(()=>first.create());actor={...actor,role:'Manager',employee_id:1};await first.list();assert.equal(first.view.pending,null);assert.equal(map.size,0);
 actor={...actor,role:'Business Owner',employee_id:null};first.view.draft={subject:'Again',category:'account',message:'Question'};await assert.rejects(()=>first.create());actor={...actor,client_binding:'replacement'};await first.list();assert.equal(first.view.pending,null);
 loggedIn=false;await assert.rejects(()=>first.list(),/Sign in/);assert.equal(map.size,0);
 assert.ok([...map.values()].every(v=>!v.includes('access_token')));
});
