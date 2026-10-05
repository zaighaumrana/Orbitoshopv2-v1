import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const token='a'.repeat(64);
function fixture({invalid=false}={}){
 const location={hash:'#support='+token,pathname:'/',search:'?display=shop'},app={textContent:''};let exchanged=0,cleared=0,success=0;
 const history={replaceState:(_state,_title,path)=>{assert.equal(path,'/?display=shop');location.hash='';}};
 const ctx=vm.createContext({URLSearchParams,document:{getElementById:()=>app},sb:{functions:{invoke:async(name,{body})=>{exchanged++;assert.equal(location.hash,'','fragment removed before network');assert.equal(name,'login');assert.deepEqual(JSON.parse(JSON.stringify(body)),{mode:'support-handoff',token});assert.match(app.textContent,/Starting secure/);return invalid?{error:{}}:{data:{ok:true,profile:{role:'Orbito Support'}}};}}},establishLoginSession:async()=>({ok:true,session:{employee:{role:'Orbito Support'}}}),_clearSession:async()=>cleared++});
 vm.runInContext(read('src/support-handoff.js').replace(/^import .*$/gm,'').replace(/^export /gm,''),ctx);
 return {ctx,location,history,app,get exchanged(){return exchanged;},get cleared(){return cleared;},get success(){return success;},onSuccess:async session=>{assert.equal(session.employee.role,'Orbito Support');success++;}};
}
test('support fragment is synchronously cleared, exchanged only with own Shop login and never replayed on refresh',async()=>{
 const f=fixture(),value=f.ctx.takeSupportHandoff(f.location,f.history);assert.equal(value,token);assert.equal(f.location.hash,'');await f.ctx.startSupportHandoff(value,f.onSuccess);assert.equal(f.success,1);assert.equal(f.exchanged,1);assert.equal(f.ctx.takeSupportHandoff(f.location,f.history),null);assert.equal(f.exchanged,1);
 assert.doesNotMatch(read('src/support-handoff.js'),/localStorage|sessionStorage|console\.|password|platform-support/);const main=read('src/main.js');assert.ok(main.indexOf('takeSupportHandoff(location,history)')<main.indexOf('async function boot()'));
});
test('expired/replayed/invalid links show useful failure with no privileged fallback; duplicate tokens rejected',async()=>{
 const f=fixture({invalid:true});await f.ctx.startSupportHandoff(f.ctx.takeSupportHandoff(f.location,f.history),f.onSuccess);assert.equal(f.success,0);assert.equal(f.cleared,1);assert.match(f.app.textContent,/Return to Platform/);
 for(const hash of ['#support=bad','#support='+token+'&support='+token]){const f=fixture();f.location.hash=hash;const value=f.ctx.takeSupportHandoff(f.location,f.history);assert.equal(value,'');assert.equal(f.location.hash,'');await f.ctx.startSupportHandoff(value,f.onSuccess);assert.equal(f.exchanged,0);assert.equal(f.success,0);}
});
