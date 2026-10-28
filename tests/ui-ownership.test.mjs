import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {parseAst} from 'rolldown/parseAst'
import {setUIAuthority,invalidateUIAuthority} from '../src/ui-authority.js'
import {observeCommand,originalCommandRecords} from '../src/ui-command-records.js'
import {settleRead,readStates,resourceReady} from '../src/read-state.js'
import {readPage,readComplete} from '../src/bounded-read.js'
const tick=()=>new Promise(r=>setImmediate(r))
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
function loaderFixture(module){
 const source=readFileSync(new URL('../src/'+module,import.meta.url),'utf8'),node=parseAst(source).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='load')
 const pending=[],summaries=[],renders=[];let epoch=0
 const state={role:'Business Owner',data:{},modal:null},CFG={repair_module_enabled:true,inventory_module_enabled:false}
 const query=table=>{
  const result=()=>{if(table==='tickets'&&!q.child){const g=deferred();pending.push(g);return g.promise}return Promise.resolve(q.child&&ctx.failChildren?{data:null,error:Error('denied child read')}:{data:[],count:0})}
  const q={select:()=>q,is:()=>q,eq:()=>q,not:()=>q,in:()=>{q.child=true;return q},order:()=>q,range:result,then:fn=>result().then(fn)};return q
 }
 const ctx=vm.createContext({SESSION:{employee:{role:state.role}},state,CFG,_inv:{},
  sb:{from:query,rpc:async name=>({data:name==='get_financial_report'?{}:[]})},loadConfig:async()=>true,can:()=>true,
  settleRead,readStates,resourceReady,readPage,readComplete,hasReadContract:()=>false,clearTimeout(){},
  quickPage:()=>{const g=deferred();pending.push(g);return g.promise},stockPage:async()=>({data:[],count:0}),
  captureView:()=>{const e=epoch;return ()=>e===epoch},posNavigationIsCurrent:()=>true,workshopNavigationIsCurrent:()=>true,
  posState:{cart:[]},wsState:{familySummaries:new Map(),statusFilter:'all',financeRequest:0},groupRepairFamilies:rows=>rows.map(root=>({root})),ownsWorkshop:()=>true,
  getRepairFamilySummary:async id=>{const g=deferred();summaries.push({id,...g});return g.promise},
  applyBranding(){},render(){renders.push(structuredClone(state.data))},dlog(){},showBlockingError(){},
  window:{location:{pathname:module.includes('workshop')?'/workshop':'/pos'}},sessionStorage:{getItem(){return null}},console})
 const expand=parseAst(source).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='expandFamilyMoney')
 vm.runInContext('let selectorGeneration=0,quickGeneration=0,selectorTimer=null,posLoadGeneration=0,workshopLoadGeneration=0;'+source.slice(node.start,node.end)+(expand?source.slice(expand.start,expand.end):'')+';globalThis.load=load;'+(expand?'globalThis.expand=expandFamilyMoney;':''),ctx)
 return {ctx,state,pending,summaries,renders,leave:()=>epoch++}
}
test('actual POS and Workshop loaders reject reversed older results and departed follow-up reads',async()=>{
 for(const path of ['pos/pos.js','pos/workshop.js']){
  const f=loaderFixture(path),a=f.ctx.load();await tick();const b=f.ctx.load();await tick()
  f.pending[1].resolve({data:[],count:0});await b;const published=f.renders.length;f.pending[0].resolve({data:[{id:1,customer_name:'OLD'}],count:1});await a
  assert.deepEqual(JSON.parse(JSON.stringify(f.state.data[path.includes('workshop')?'tickets':'quickItems'])),[]);assert.equal(f.renders.length,published);assert.equal(f.summaries.length,0)
  const departed=f.ctx.load();await tick();const loading=f.renders.length;f.leave();f.pending[2].resolve({data:[{id:2}]});await departed;assert.equal(f.summaries.length,0);assert.equal(f.renders.length,loading)
 }
})
test('actual Workshop has zero monetary startup calls for 0/10/100 roots and stale expansion cannot overwrite its successor',async()=>{
 for(const count of [0,10,100]){
  const f=loaderFixture('pos/workshop.js'),load=f.ctx.load();await tick();f.pending[0].resolve({data:Array.from({length:Math.min(25,count)},(_,i)=>({id:i+1})),count});await load;assert.equal(f.summaries.length,0)
 }
 const f=loaderFixture('pos/workshop.js'),load=f.ctx.load();await tick();f.pending[0].resolve({data:[{id:1}],count:1});await load
 const old=f.ctx.expand('1');await tick();assert.equal(f.summaries[0].id,'1')
 f.leave();const fresh=f.ctx.load();await tick();f.pending[1].resolve({data:[{id:2}],count:1});await fresh
 const expansion=f.ctx.expand('2');await tick();f.summaries[1].resolve({ok:true,data:{root:{id:2}}});await expansion
 f.summaries[0].resolve({ok:true,data:{root:{id:1}}});await old
 assert.deepEqual([...f.ctx.wsState.familySummaries.keys()],['2']);assert.equal(f.ctx.wsState.familySummaries.get('2').data.root.id,2)
})
test('financial journal preserves original actor/native-session UUID and exact args without replay',async()=>{
 setUIAuthority('journal-A:session-1');const gate=deferred(),args={p_request_id:'journal-original',p_lines:[{quantity:1,unitPrice:100}]};let calls=0
 const original=observeCommand('create_retail_sale',args,identity=>{assert.equal(identity,'journal-A:session-1');calls++;return gate.promise})
 setUIAuthority('journal-B:session-2');assert.deepEqual(originalCommandRecords(),[])
 gate.resolve({data:{invoiceNumber:'ORIGINAL'}});await original;assert.equal(calls,1)
 setUIAuthority('journal-A:session-3');const record=originalCommandRecords().find(r=>r.requestId===args.p_request_id)
 assert.equal(record.session,'journal-A:session-1');assert.equal(record.status,'acknowledged');assert.deepEqual(record.args,args)
 assert.throws(()=>observeCommand('create_retail_sale',{...args,p_lines:[]},()=>{calls++}),/different intended payload/);assert.equal(calls,1)
 invalidateUIAuthority()
})

test('read failures retain unknown truth and a partial Workshop family never becomes a complete queue',async()=>{
 const thrown=await settleRead(Promise.reject(Error('offline')))
 const reads=readStates({financial:{data:null,error:Error('denied')},history:thrown,catalog:{data:[]}},['financial'])
 assert.equal(reads.values.financial,null);assert.equal(reads.values.history,null);assert.equal(reads.resources.financial.status,'unavailable');assert.equal(reads.resources.catalog.status,'ready')
 assert.equal(resourceReady(reads.resources,'financial'),false);assert.equal(resourceReady(reads.resources,'catalog'),true)
 const f=loaderFixture('pos/workshop.js');f.ctx.failChildren=true;const pending=f.ctx.load();await tick();f.pending[0].resolve({data:[{id:7}],count:1});await pending
 assert.equal(f.state.data.tickets,null);assert.equal(f.state.resources.tickets.status,'incomplete');assert.equal(f.summaries.length,0)
})

test('actual late repair ACK and payment ACK followed by delayed summary remain original-account owned',async()=>{
 const source=readFileSync(new URL('../src/pos/pos.js',import.meta.url),'utf8'),node=parseAst(source).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='placeOrderOnce')
 for(const isNewTicket of [true,false]){
  let epoch=1,notices=0;const reload=deferred(),operations=new Map()
  const ticket={isTicket:true,isNewTicket,requestId:'original-repair',ticketId:7,topupAmount:10,topupMethod:'Cash'}
  const ctx=vm.createContext({SESSION:{authUserId:'A'},posState:{cart:[ticket]},state:{modal:null,data:{tickets:[{id:7}]}},cartOperations:operations,
   captureView:()=>{const e=epoch;return ()=>e===epoch},structuredClone,dlog(){},insertNewTicketFromCart:()=>reload.promise,collectTicketPayment:async()=>({ok:true,data:{}}),getRepairFamilySummary:()=>reload.promise,
   load:()=>assert.fail('repair payment must not refresh unrelated selectors'),render(){notices++},showTransactionSuccess(){notices++},showBlockingError(){notices++},resourceReady,combinedBalance:()=>({total:0}),money:String})
  vm.runInContext(source.slice(node.start,node.end)+';globalThis.place=placeOrderOnce',ctx)
  const pending=ctx.place();await tick();epoch=2;ctx.posState={cart:[]};ctx.SESSION={authUserId:'B'};ctx.state.data={tickets:[]};reload.resolve({ok:true,data:{id:7,outstanding:0}});await pending
  assert.equal(ctx.state.modal,null);assert.equal(notices,0);assert.equal(operations.get('original-repair').actor,'A');assert.equal(operations.get('original-repair').detached,true)
 }
})

test('actual router contains current failures and ignores departed asynchronous errors',async()=>{
 const source=readFileSync(new URL('../src/router.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/export /g,'')
 const ctx=vm.createContext({URL,URLSearchParams,Event,console,dlog(){},dstack(){},callerInfo:()=>'',window:{location:{origin:'https://fixture.test',pathname:'/',search:''}},history:{pushState(){},replaceState(){}}})
 vm.runInContext(source+';globalThis.router={registerRoute,registerRouteError,navigate}',ctx)
 const gate=deferred(),recovery=[];let reads=0
 ctx.router.registerRouteError((_error,nav)=>{assert.equal(nav.isCurrent(),true);recovery.push('current')})
 ctx.router.registerRoute('/old',async()=>{await gate.promise;throw Error('departed failure')});ctx.router.registerRoute('/new',async()=>{reads++})
 const old=ctx.router.navigate('/old');await ctx.router.navigate('/new');gate.resolve();await old;assert.equal(recovery.length,0)
 ctx.router.registerRoute('/broken',async()=>{throw Error('current initializer failure')});await ctx.router.navigate('/broken');assert.equal(recovery.length,1)
 ctx.router.registerRoute('/broken',async()=>{reads++});await ctx.router.navigate('/broken');assert.equal(reads,2);assert.equal(recovery.length,1)
})

test('actual Workshop renders only known status controls and escapes untrusted stored status text',async()=>{
 const {findRepairFamilies,groupRepairFamilies,matchedRepairChild,repairFamilyWork}=await import('../src/features/repairs/family.js');
 const {escapeHTML}=await import('../src/html.js');const {pageControls}=await import('../src/bounded-read.js');
 const source=readFileSync(new URL('../src/pos/workshop.js',import.meta.url),'utf8'),node=parseAst(source).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='workshopView');
 const status='"><img src=x onerror=alert(1)>',root={id:1,parent_ticket_id:null,status,customer_name:'Fixture',invoice_number:'ONE',ticket_number:'T1',components_noted:[]};
 const ctx=vm.createContext({state:{role:'Technician',resources:{},data:{tickets:[root]}},CFG:{repair_module_enabled:true,technician_module_enabled:true},SESSION:{employee:{id:5,role:'Technician'},isAdmin:false},wsState:{filter:'',statusFilter:'all',page:{data:[root],rootIds:[1],count:1,offset:0,size:25,hasMore:false,statusCounts:{[status]:1}},familySummaries:new Map()},resourceReady,resourceNotice:()=>'',escapeHTML,pageControls,findRepairFamilies,groupRepairFamilies,matchedRepairChild,repairFamilyWork,familyMoney:()=>'',moneyHTML:String,money:String,can:()=>true,hasReadContract:()=>true});
 vm.runInContext(source.slice(node.start,node.end)+';globalThis.html=workshopView();',ctx);
 assert.equal(ctx.html.includes('<img'),false);assert.ok(ctx.html.includes('&lt;img'));
 assert.ok(ctx.html.includes('data-status-filter="Pending"'));assert.ok(ctx.html.includes('Ready: 0'));assert.ok(ctx.html.includes('All matching: 1'));
});
