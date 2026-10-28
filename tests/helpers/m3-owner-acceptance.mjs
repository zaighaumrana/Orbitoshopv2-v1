// Focused owner finishing pass only; reuse the existing real-entry synthetic SDK.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
const original=(path,name,next)=>{
 const source=execFileSync('git',['show','9f74a8fff4d37424c31d8ba9bd942523e659a8b6:'+path],{encoding:'utf8'});
 return source.slice(source.indexOf('export function '+name),source.indexOf('\nexport function '+next)).replace('export ','');
};
export async function runOwnerAcceptance({page,origin,output}){
 const result={geometry:[],support:[],logos:[],provenance:'Author-run local Chrome; actual templates/handlers, synthetic SDK, no hosted writes or print hardware'};
 const modal=page.locator('.feature-modal-host .modal');
 const geometry=async(name,width,height)=>{
  await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
  const r=await modal.evaluate(node=>{
   const box=node.getBoundingClientRect(),body=node.querySelector('.rs-repair-workspace'),actions=node.querySelector('.rs-repair-actions'),a=actions.getBoundingClientRect();
   return {width:box.width,height:box.height,top:box.top,bottom:box.bottom,client:node.clientWidth,scroll:node.scrollWidth,bodyClient:body.clientHeight,bodyScroll:body.scrollHeight,columns:getComputedStyle(body).gridTemplateColumns.split(' ').length,actions:{top:a.top,bottom:a.bottom},viewport:innerHeight};
  });
  assert.ok(r.scroll<=r.client+1,name+' no horizontal overflow');assert.ok(r.top>=0&&r.bottom<=height+1,name+' fits viewport');assert.ok(r.actions.top>=0&&r.actions.bottom<=height,name+' actions remain visible');assert.equal(r.columns,width>820?2:1);
  if(width>820){assert.ok(r.width>1000,name+' wide desktop '+JSON.stringify(r));assert.ok(r.bodyScroll-r.bodyClient<80,name+' routine content substantially fits');}
  else assert.ok(r.width<=width,name+' mobile width');
  result.geometry.push({name,...r});
 };
 const close=async()=>{const button=modal.locator('[data-modal-close]');await button.click();if(await page.locator('[data-draft-warning]').count())await button.click();await modal.waitFor({state:'detached'});};
 const controlsUnchanged=async(source,args)=>page.evaluate(async({source,args})=>{
  const shared=await import('/src/shared.js'),html=await import('/src/html.js'),draft=await import('/src/features/pos/repairs/state.js');
  const fn=new Function('state','CFG','moneyHTML','escapeHTML','getDraft','calcDraftTotal','calcDraftPaid',source+';return '+(args.kind==='new'?'repairTicketFormHTML':'ticketDetailModalHTML')+';')(shared.state,shared.CFG,shared.moneyHTML,html.escapeHTML,draft.getDraft,draft.calcDraftTotal,draft.calcDraftPaid);
  const template=document.createElement('template');template.innerHTML=args.kind==='new'?fn(shared.state.modal._info||{}):fn(1,shared.state.modal);
  const signature=root=>[...root.querySelectorAll('input,select,textarea,button')].filter(x=>!x.hasAttribute('data-modal-close')).map(x=>{
   if(x.hasAttribute('data-close'))x.type='button';
   return [x.tagName,[...x.attributes].filter(a=>!['class','style','value'].includes(a.name)&&!a.name.startsWith('data-ui')).map(a=>[a.name,a.value]).sort((a,b)=>a[0].localeCompare(b[0]))];
  }).map(JSON.stringify).sort();
  return {before:signature(template.content),after:signature(document.querySelector('.feature-modal-host .modal'))};
 },{source,args});
 await page.goto(origin+'/pos?fixtureAuth=signed&fixtureRole=Business%20Owner');
 await page.locator('[data-modal="repair"]').click();
 await page.locator('[name="customerName"]').fill('Synthetic Owner Review');await page.locator('[name="customerPhone"]').fill('03000000000');await page.locator('[name="deviceBrand"]').fill('Phone');await page.locator('[name="deviceModel"]').fill('Model');await page.locator('[name="imei"]').fill('SN-42A');
 await page.evaluate(async()=>{const {replaceDraft}=await import('/src/features/pos/repairs/state.js');replaceDraft({components:[{name:'Screen',tag:'Broken',price:100},{name:'Battery',tag:'Not Working',price:50}],labour:25,payments:[{amount:30,method:'Cash'}],overridePrice:null});window.ownerInput=document.querySelector('[name="customerName"]');document.querySelector('[data-action="theme"]').click();});
 await page.locator('[data-draft-comp-price="0"]').fill('125');await page.locator('[data-draft-labour]').fill('50');
 await page.locator('#draft-pay-amount').fill('20');await page.locator('[data-action="draft-add-payment"]').click();
 assert.ok(await page.evaluate(()=>window.ownerInput===document.querySelector('[name="customerName"]')));assert.equal(await page.locator('[name="customerName"]').inputValue(),'Synthetic Owner Review');assert.equal(await page.locator('[name="imei"]').inputValue(),'SN-42A');
 const amounts=await page.evaluate(async()=>{const {getDraft,calcDraftTotal,calcDraftPaid}=await import('/src/features/pos/repairs/state.js');return {total:calcDraftTotal(getDraft()),paid:calcDraftPaid(getDraft())};});assert.deepEqual(amounts,{total:225,paid:50});assert.match(await page.locator('[data-draft-balance]').innerText(),/175/);
 let signature=await controlsUnchanged(original('src/features/pos/repairs/render.js','repairTicketFormHTML','compTagPickerHTML'),{kind:'new'});assert.deepEqual(signature.after,signature.before,'New repair fields/actions/default constraints preserved');
 await geometry('new-repair-desktop',1280,900);await page.screenshot({path:join(output,'owner-new-repair-desktop.png'),fullPage:true});await geometry('new-repair-mobile',390,740);await close();
 await page.goto(origin+'/admin/repairs?fixtureAuth=signed&fixtureRole=Business%20Owner');await page.locator('.app-shell').waitFor();
 await page.evaluate(async()=>{const {state}=await import('/src/shared.js');state.modal={type:'ticketDetail',id:1,summaryStatus:'ready',summary:{root:{id:1,ticketNumber:'TK-1',customerName:'Synthetic Customer',customerPhone:'03000000000',deviceBrand:'Phone',deviceModel:'Model',imei:'SN-42A',status:'Pending'},invoices:[{id:1,ticketNumber:'TK-1',amount:225,components:[{name:'Screen',tag:'Broken',price:125}],note:'Original intake note'},{id:2,parentTicketId:1,invoiceNumber:'CHILD-2',amount:50}],effectiveObligation:275,paymentsReceived:50,refundsPaid:0,netPayments:50,outstanding:225,proposals:[{id:1,description:'Battery',quotedAmount:50,decision:'Approved',decisionMethod:'Phone'}]}};document.querySelector('[data-action="theme"]').click();});
 signature=await controlsUnchanged(original('src/features/admin/repairs/render.js','ticketDetailModalHTML','markNotNeededModalHTML'),{kind:'existing'});assert.deepEqual(signature.after,signature.before,'Existing repair fields/actions/status choices preserved');
 await page.locator('#td-note').fill('Unsaved update survives presentation render');await page.evaluate(()=>document.querySelector('[data-action="theme"]').click());assert.equal(await page.locator('#td-note').inputValue(),'Unsaved update survives presentation render');assert.match(await modal.innerText(),/275/);assert.match(await modal.innerText(),/225/);
 await geometry('existing-repair-desktop',1280,900);await page.screenshot({path:join(output,'owner-existing-repair-desktop.png'),fullPage:true});await geometry('existing-repair-mobile',390,740);await close();
 for(const [width,theme]of [[1280,'light'],[390,'dark']]){
  await page.setViewportSize({width,height:900});await page.goto(origin+'/admin/customer-support?fixtureAuth=signed&fixtureRole=Business%20Owner');await page.locator('.support-page').waitFor();
  await page.evaluate(async theme=>{const {state,applyBranding}=await import('/src/shared.js');state.theme=theme;applyBranding();},theme);
  const r=await page.locator('.support-page').evaluate(node=>{const r=node.getBoundingClientRect(),p=node.parentElement.getBoundingClientRect(),style=getComputedStyle(node.parentElement);return {left:r.left,right:r.right,width:r.width,workspaceLeft:p.left+parseFloat(style.paddingLeft),workspaceRight:p.right-parseFloat(style.paddingRight),scroll:document.documentElement.scrollWidth,viewport:innerWidth};});assert.ok(Math.abs((r.left-r.workspaceLeft)-(r.workspaceRight-r.right))<1);assert.ok(r.width<=1100&&r.scroll<=width+1);result.support.push({theme,...r});
 }
 const variants=['absent','square','wide','transparent','white-background','large'];
 for(const [i,name]of variants.entries()){
  const r=await page.evaluate(async({i,name})=>{
   const {CFG,state,applyBranding}=await import('/src/shared.js');
   if(name==='absent')CFG.shop_logo='';else if(name==='wide')CFG.shop_logo='/brand/logos/retrasell-horizontal-primary.svg';else if(name==='large')CFG.shop_logo='/brand/app/app-icon-512.png';else if(name==='square')CFG.shop_logo='/brand/app/app-icon-192.png';else{const c=document.createElement('canvas');c.width=120;c.height=60;const ctx=c.getContext('2d');if(name==='white-background'){ctx.fillStyle='#fff';ctx.fillRect(0,0,120,60);}ctx.fillStyle='#2548D8';ctx.fillRect(20,15,80,30);CFG.shop_logo=c.toDataURL('image/png');}
   state.theme=i%2?'dark':'light';applyBranding();document.querySelector('[data-action="theme"]').click();const tile=document.querySelector('.top-brand .logo'),image=tile.querySelector('img');if(image)await image.decode();const b=tile.getBoundingClientRect(),m=image?.getBoundingClientRect();return {name,theme:state.theme,tile:{width:b.width,height:b.height,border:getComputedStyle(tile).borderWidth},image:m?{width:m.width,height:m.height,fit:getComputedStyle(image).objectFit}:null};
  },{i,name});assert.equal(r.tile.border,'0px');if(r.image){assert.equal(r.image.fit,'contain');assert.ok(r.image.width<r.tile.width&&r.image.height<r.tile.height,JSON.stringify(r));}result.logos.push(r);
 }
 const previews=await page.evaluate(async()=>{const {receiptPreview}=await import('/src/features/pos/checkout/render.js'),{ticketSlipPreview}=await import('/src/features/pos/repairs/render.js'),{withPrintAttribution}=await import('/src/print/presentation.js');return [receiptPreview({receiptNo:'INV-1',date:'2026-10-29',items:[],total:225,payment:'Cash'}),ticketSlipPreview({ticket_number:'TK-1',created_at:'2026-10-29',components_noted:[],final_total:225})].map(html=>({footers:(html.match(/data-product-attribution/g)||[]).length,idempotent:withPrintAttribution(html)===html}));});for(const p of previews){assert.equal(p.footers,1);assert.ok(p.idempotent);}
 assert.equal(await page.locator('[data-print-attribution],.rs-print-choice').count(),0);
 result.draftAndFinancial={total:225,paid:50,balance:175,controlsUnchanged:true,caretNodeStable:true};result.previews=previews;result.result='PASS';return result;
}
