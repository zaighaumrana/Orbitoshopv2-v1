import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {parseAst} from 'rolldown/parseAst'
const tick=()=>new Promise(r=>setImmediate(r))
test('actual EMS binder uses current callbacks after revisit, refreshes actions once and blocks duplicate payroll',async()=>{
 const source=readFileSync(new URL('../src/features/admin/ems/index.js',import.meta.url),'utf8')
 const node=parseAst(source).body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='attachEMSEvents').declaration
 const lifecycle=readFileSync(new URL('../src/ui-lifecycle.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'')
 let epoch=1,first=0,second=0,third=0,writes=0,generated=0,toasts=0,release
 const listeners={},app={addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn)},button={disabled:false,textContent:'Generate'}
 const ctx=vm.createContext({window:{location:{pathname:'/admin/ems'}},state:{role:'Business Owner'},can:()=>true,
  captureAuthority:()=>{const e=epoch;return ()=>e===epoch},captureNavigation:()=>{const e=epoch;return ()=>e===epoch},authorityIdentity:()=> 'actor:session',
  sb:{from:()=>({update:()=>{writes++;return {eq:async()=>({error:null})}}})},
  generateSalarySlip:()=>{generated++;return new Promise(r=>release=r)},showBlockingError:message=>assert.fail(message),showToast:()=>toasts++,
  FormData:class{constructor(form){this.form=form}entries(){return Object.entries(this.form.values)}},Date,console,CFG:{},app})
 vm.runInContext(lifecycle+';let SESSION={},_eventsAttached=false,emsController=null;const pendingEMSActions=new Set(),emsState={};const ownsEMS=()=>emsController&&emsController.isCurrent()&&window.location.pathname===\'/admin/ems\';'+source.slice(node.start,node.end)+';globalThis.attach=attachEMSEvents',ctx)
 const session={employee:{id:2,role:'Business Owner'}}
 ctx.attach(app,()=>({}),async()=>first++,session,()=>epoch===1);epoch=2;ctx.attach(app,()=>({}),async()=>second++,session,()=>epoch===2)
 const click=dataset=>listeners.click[0]({target:{closest:()=>({dataset})}})
 click({emsTab:'leaves'});await tick();assert.equal(first,0);assert.equal(second,1);assert.equal(listeners.click.length,1)
 listeners.input[0]({target:{dataset:{emsAttendanceFilter:''},value:'Staff'}});await tick();assert.equal(second,2)
 click({emsLeaveAction:'Approved',leaveId:'1'});await tick();assert.equal(writes,1);assert.equal(second,3)
 const form={dataset:{form:'generate-slip'},values:{employee_id:'2',month:'10',year:'2026'},querySelector:()=>button},submit=()=>listeners.submit[0]({target:form,preventDefault(){}})
 submit();submit();await tick();assert.equal(generated,1);release({ok:true});await tick();assert.equal(second,4);assert.equal(toasts,1);assert.equal(button.disabled,false)
 submit();await tick();epoch=3;ctx.attach(app,()=>({}),async()=>third++,session,()=>epoch===3);submit();await tick();assert.equal(generated,2,'revisit cannot send the same pending payroll action again')
 release({ok:true});await tick();assert.equal(third,0);assert.equal(toasts,1,'departed action cannot refresh or toast in replacement view')
})
