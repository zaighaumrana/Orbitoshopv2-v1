// Complete Shop entry/handlers with synthetic I/O; compiled CSS and a stale brand asset.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

export async function runLiveLayout({page,origin,output,result={pagination:[],previews:[]}}) {
 result.provenance='Actual Shop entry and renderers; synthetic SDK; built app CSS plus deliberately stale fixed-URL branding CSS; no hosted writes';
 const go=async route=>{await page.goto(origin+route+'?fixtureAuth=signed&fixtureRole=Business%20Owner&fixtureEMS=true&boundedReads=1');await page.locator('.app-shell.rs-shop').waitFor();await page.evaluate(()=>document.fonts.ready);};
 const inspect=async()=>page.locator('.rs-pagination').evaluateAll(nodes=>nodes.map(n=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,center:(r.left+r.right)/2};};
  const p=n.parentElement,s=getComputedStyle(p),b=p.getBoundingClientRect();
  return {pager:rect(n),previous:rect(n.firstElementChild),count:rect(n.querySelector('.rs-pagination-summary')),next:rect(n.lastElementChild),display:getComputedStyle(n).display,tracks:getComputedStyle(n).gridTemplateColumns,parentClass:p.className,regionLeft:b.left+p.clientLeft+parseFloat(s.paddingLeft),regionRight:b.left+p.clientLeft+p.clientWidth-parseFloat(s.paddingRight),summary:n.querySelector('.rs-pagination-summary').textContent,previousDisabled:n.firstElementChild.disabled,nextDisabled:n.lastElementChild.disabled,overflow:document.documentElement.scrollWidth>innerWidth+1};
 }));
 const verify=(rows,name)=>{assert.ok(rows.length,name+' has an actual pager');for(const r of rows){assert.equal(r.display,'grid',name);assert.ok(Math.abs(r.previous.left-r.pager.left)<1&&Math.abs(r.next.right-r.pager.right)<1,name+' edge actions');assert.ok(Math.abs(r.count.center-r.pager.center)<1,name+' exact center');assert.ok(Math.abs(r.pager.left-r.regionLeft)<1&&Math.abs(r.pager.right-r.regionRight)<1,name+' fills its own list region');assert.equal(r.overflow,false,name+' no document overflow');}};
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:900});
  for(const route of ['/admin/repairs','/admin/inventory','/admin/catalog','/admin/receipts','/admin/employees','/admin/ems','/admin/customer-support','/pos','/workshop']){
   await go(route);await page.locator('.rs-pagination').first().waitFor().catch(e=>{throw Error(route+' '+width+': '+e.message)});const rows=await inspect();verify(rows,route+' '+width);result.pagination.push({route,width,rows});
   if(route==='/pos'&&width===1280)await page.screenshot({path:join(output,'actual-pos-pagination-desktop.png'),fullPage:true});
   if(route==='/admin/catalog'){await page.locator('[data-catalog-tab="components"]').click();await page.locator('[data-catalog-tab="components"].active').waitFor();const rows=await inspect();verify(rows,'Catalog components '+width);result.pagination.push({route:route+' components',width,rows});}
   if(route==='/admin/ems'){await page.locator('[data-ems-tab="slips"]').click();await page.locator('[data-ems-slip-page]').first().waitFor();const rows=await inspect();verify(rows,'EMS slips '+width);result.pagination.push({route:route+' slips',width,rows});}
   if(route==='/pos'){await page.locator('[data-action="open-repair-collection"]').first().click();await page.locator('[data-collection-page]').first().waitFor();const rows=await inspect();verify(rows,'POS collection '+width);result.pagination.push({route:route+' repair collection',width,rows});await page.locator('.feature-modal-host .modal').getByRole('button',{name:'Close',exact:true}).click();}

  }
 }
 await go('/pos');
 const sale={receiptNo:'INV-LAYOUT-1',date:'2026-10-29T00:00:00Z',cashier:'Synthetic Cashier',customer:'Synthetic Customer',items:[{name:'Screen replacement part',qty:1,soldPrice:200}],total:200,payment:'Cash',cashTendered:250,changeGiven:50};
 const ticket={id:42,invoice_number:'INV-TK-42',ticket_number:'TK-42',created_at:'2026-10-29T00:00:00Z',customer_name:'Synthetic Customer',customer_phone:'03000000000',device_brand:'Phone',device_model:'Model',imei:'SN-LAYOUT-42',components_noted:[{name:'Screen',price:200,tag:'Broken'}],labour_cost:50,final_total:250,amount_paid:50,balance_due:200,status:'Pending'};
 for(const [kind,value]of [['receipt',sale],['ticket',ticket]])for(const [width,height]of [[1280,900],[390,740]]){
  await page.setViewportSize({width,height});
  await page.evaluate(async({kind,value})=>{const {state}=await import('/src/shared.js');state.modal={type:'receipt',isTicketSlip:kind==='ticket',...(kind==='ticket'?{ticket:value}:{sale:value})};document.querySelector('[data-action="theme"]').click();},{kind,value});
  const modal=page.locator('.feature-modal-host .rs-receipt-preview-dialog');await modal.waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.receipt-preview img')].map(i=>i.decode().catch(()=>{})));});
  const r=await modal.evaluate(n=>{const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,center:(r.left+r.right)/2};};const paper=n.querySelector('.receipt-preview'),body=n.querySelector('.rs-receipt-preview-body');return {dialog:box(n),paper:box(paper),backdropTracks:getComputedStyle(n.parentElement).gridTemplateColumns,bodyClient:body.clientHeight,bodyScroll:body.scrollHeight,bodyWidth:body.clientWidth,bodyScrollWidth:body.scrollWidth,actions:box(n.querySelector('.modal-actions')),footers:n.querySelectorAll('[data-product-attribution]').length,paperFont:getComputedStyle(paper).fontSize,overflow:document.documentElement.scrollWidth>innerWidth+1};});
  assert.ok(r.dialog.left>=0&&r.dialog.right<=width&&r.dialog.top>=0&&r.dialog.bottom<=height+1);assert.ok(Math.abs(r.dialog.center-width/2)<1&&Math.abs(r.paper.center-r.dialog.center)<1);assert.ok(r.actions.top>=0&&r.actions.bottom<=height);assert.ok(r.bodyScrollWidth<=r.bodyWidth+1);assert.equal(r.overflow,false);assert.equal(r.footers,1);
  if(width>700){assert.equal(r.dialog.width,600);assert.equal(r.paper.width,380);}else assert.ok(r.dialog.width<=width-24);
  await page.keyboard.press('Tab');assert.ok(await modal.evaluate(n=>n.contains(document.activeElement)),'Keyboard stays in preview');
  result.previews.push({kind,width,height,...r});if(width===1280)await page.screenshot({path:join(output,'actual-'+kind+'-preview-desktop.png'),fullPage:true});
  await modal.getByRole('button',{name:'Close',exact:true}).click();await modal.waitFor({state:'detached'});
 }
 const docs=await page.evaluate(async({sale,ticket})=>{const current=await import('/src/print/print.js'),before=await import('/src/print/__baseline-print.js');return [['receipt',current.buildReceiptSlip(sale,true),before.buildReceiptSlip(sale,true)],['ticket',current.buildTicketSlip(ticket),before.buildTicketSlip(ticket)]];},{sale,ticket});
 result.printEquivalence=docs.map(([kind,after,before])=>{assert.equal(after,before,kind+' printable document byte-equivalent');return {kind,bytes:Buffer.byteLength(after),sha256:createHash('sha256').update(after).digest('hex'),equal:true};});
 assert.equal(await page.evaluate(()=>window.fixtureWrites.length),0);result.result='PASS';return result;
}
