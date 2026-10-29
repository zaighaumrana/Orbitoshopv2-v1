// M3-IR-01 only: actual Shop handlers, native keyboard events, synthetic I/O.
import assert from 'node:assert/strict';
import {join} from 'node:path';

export async function runIR01({page,origin,output,result}) {
 result.provenance='Author-run actual entry/renderers/handlers with built CSS; synthetic SDK; no hosted operations';
 const go=async route=>{await page.goto(origin+route+'?fixtureAuth=signed&fixtureRole=Business%20Owner&boundedReads=1');await page.locator('.app-shell').waitFor();await page.evaluate(()=>document.fonts.ready);};
 const tabTo=async selector=>{
  for(let i=0;i<40;i++){
   if(await page.locator(selector).evaluate(n=>n===document.activeElement))return i;
   await page.keyboard.press('Tab');
  }
  throw Error('Tab did not reach '+selector);
 };
 const focus=async control=>control.evaluate(n=>{const s=getComputedStyle(n);return {tag:n.tagName,type:n.type,tabIndex:n.tabIndex,active:n===document.activeElement,visible:n.matches(':focus-visible'),outline:s.outlineStyle,width:parseFloat(s.outlineWidth),color:s.outlineColor,offset:s.outlineOffset,nested:n.querySelectorAll('button,a,input,select,textarea').length};});
 const verifyFocus=r=>{assert.equal(r.tag,'BUTTON');assert.equal(r.type,'button');assert.equal(r.tabIndex,0);assert.ok(r.active&&r.visible&&r.outline!=='none'&&r.width>=2);assert.equal(r.nested,0);};
 const installCounters=async()=>page.evaluate(async()=>{
  window.ir01Calls={pushes:[],receiptOpens:0,clicks:[],submits:0};
  const push=history.pushState;history.pushState=function(...args){window.ir01Calls.pushes.push(String(args[2]));return push.apply(this,args);};
  const {state}=await import('/src/shared.js');let modal=state.modal;
  Object.defineProperty(state,'modal',{configurable:true,enumerable:true,get:()=>modal,set:value=>{if(value?.type==='receipt-detail')window.ir01Calls.receiptOpens++;modal=value;}});
  document.addEventListener('click',event=>{const n=event.target.closest('[data-kpi-target],[data-action]');if(n)window.ir01Calls.clicks.push(n.dataset.kpiTarget||n.dataset.action);},true);
  document.addEventListener('submit',()=>window.ir01Calls.submits++,true);
 });
 const appearance=async(selector,kind)=>{
  const observations=[];
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   const r=await page.locator(selector).evaluate((n,kind)=>{
    const props=['display','fontFamily','fontSize','fontWeight','lineHeight','color','backgroundColor','padding','borderTopWidth','borderTopStyle','borderTopColor','borderRadius'];
    const sample=node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return {style:Object.fromEntries(props.map(p=>[p,s[p]])),width:r.width,height:r.height};};
    const after=sample(n),old=document.createElement('div');old.className=kind==='kpi'?'card kpi':'';old.style.cssText=kind==='kpi'?'cursor:pointer':'cursor:pointer;flex:1;min-width:0';old.innerHTML=n.innerHTML;n.replaceWith(old);const before=sample(old);old.replaceWith(n);
    return {before,after,overflow:document.documentElement.scrollWidth>innerWidth+1};
   },kind);
   assert.deepEqual(r.after,r.before,'Same legacy card/content appearance at '+width);assert.equal(r.overflow,false);observations.push({width,...r});
  }
  await page.setViewportSize({width:1280,height:900});return observations;
 };
 await page.setViewportSize({width:1280,height:900});
 for(const method of ['Enter','Space','pointer']){
  await go('/admin/dashboard');const selector='.card.kpi[data-kpi-target="repairs"]',control=page.locator(selector);await control.waitFor();
  const all=await page.locator('.card.kpi[data-kpi-target]').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,type:n.type,target:n.dataset.kpiTarget,nested:n.querySelectorAll('button,a,input,select,textarea').length})));assert.equal(all.length,6);for(const n of all){assert.equal(n.tag,'BUTTON');assert.equal(n.type,'button');assert.equal(n.nested,0);}
  const styles=method==='Enter'?await appearance(selector,'kpi'):undefined;
  await installCounters();const tabs=await tabTo(selector),focused=await focus(control);verifyFocus(focused);
  if(method==='Enter')await page.screenshot({path:join(output,'dashboard-kpi-focus.png'),fullPage:true});
  if(method==='pointer')await control.locator('.label').click();else await page.keyboard.press(method);
  await page.waitForURL('**/admin/repairs');await page.getByRole('heading',{name:'Repair Tickets',exact:true}).first().waitFor();
  const calls=await page.evaluate(()=>window.ir01Calls);assert.equal(calls.pushes.length,1);assert.deepEqual(calls.clicks,['repairs']);assert.equal(calls.submits,0);assert.equal(calls.receiptOpens,0);
  result.journeys.push({kind:'Dashboard KPI',method,tabs,focused,all,styles,calls});
 }
 for(const method of ['Enter','Space','pointer']){
  await go('/admin/receipts');const selector='[data-action="open-receipt-modal"][data-receipt-idx="0"]',control=page.locator(selector);await control.waitFor();
  const semantics=await page.locator('[data-action="open-receipt-modal"]').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,type:n.type,index:n.dataset.receiptIdx,name:n.getAttribute('aria-label'),nested:n.querySelectorAll('button,a,input,select,textarea').length,neighborActions:[...n.parentElement.querySelectorAll(':scope>div [data-action]')].map(b=>b.dataset.action)})));
  for(const n of semantics){assert.equal(n.tag,'BUTTON');assert.equal(n.type,'button');assert.ok(n.name?.startsWith('View '));assert.equal(n.nested,0);assert.ok(n.neighborActions.some(a=>a==='reprint-receipt'||a==='print-repair-invoice'));}
  assert.match(semantics[0].name,/INV-1/);const styles=method==='Enter'?await appearance(selector,'receipt'):undefined;
  await installCounters();const tabs=await tabTo(selector),focused=await focus(control);verifyFocus(focused);
  if(method==='Enter')await page.screenshot({path:join(output,'receipt-detail-focus.png'),fullPage:true});
  if(method==='pointer')await control.locator('strong').first().click();else await page.keyboard.press(method);
  const modal=page.locator('.feature-modal-host .modal');await modal.getByRole('heading',{name:'INV-1',exact:true}).waitFor();
  const calls=await page.evaluate(()=>({...window.ir01Calls,frames:document.querySelectorAll('iframe').length,writes:window.fixtureWrites.length}));
  assert.equal(calls.receiptOpens,1);assert.deepEqual(calls.clicks,['open-receipt-modal']);assert.equal(calls.submits,0);assert.equal(calls.pushes.length,0);assert.equal(calls.frames,0);assert.equal(calls.writes,0);
  result.journeys.push({kind:'Receipt Archive detail',method,index:semantics[0].index,name:semantics[0].name,tabs,focused,semantics,styles,calls});
 }
 result.result='PASS';
}
