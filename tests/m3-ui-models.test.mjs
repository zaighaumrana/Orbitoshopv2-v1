import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {groupRepairFamilies,findRepairFamilies} from '../src/features/repairs/family.js';
import {buildReceiptRecords,filterReceiptRecords} from '../src/features/admin/checkout/receipts.js';
import {withPrintAttribution} from '../src/print/presentation.js';
import {escapeHTML,safeImageURL} from '../src/html.js';
const original=path=>execFileSync('git',['show','2dffa1ea:'+path],{encoding:'utf8'});
test('automatic branded footer is idempotent at builder/queue boundaries',()=>{
 const body='<div class="c sm">Merchant terms remain.</div>';
 const once=withPrintAttribution(body);assert.equal(withPrintAttribution(once),once);
 assert.equal((once.match(/data-product-attribution/g)||[]).length,1);
 assert.equal((once.match(/Powered by RetraSell/g)||[]).length,1);
 assert.ok(once.includes('/brand/logos/retrasell-horizontal-primary.svg'));
 assert.ok(once.startsWith(body));
});
test('family and receipt models invalidate on relevant in-place revisions, with live filters',()=>{
 const tickets=[{id:1,invoice_number:'INV-1',ticket_number:'TK-1',customer_name:'Original',created_at:'2026-10-01',final_total:100,status:'Pending'},{id:2,parent_ticket_id:1,invoice_number:'INV-2',created_at:'2026-10-02'}],sales=[];
 const family=groupRepairFamilies(tickets),receipts=buildReceiptRecords(sales,tickets);
 assert.equal(groupRepairFamilies(tickets),family);assert.equal(buildReceiptRecords(sales,tickets),receipts);
 tickets[0].customer_name='Changed';tickets[0].final_total=125;
 assert.equal(findRepairFamilies(tickets,'Changed').length,1);
 const changed=buildReceiptRecords(sales,tickets);assert.notEqual(changed,receipts);assert.equal(changed.find(x=>x.id===1).total,125);
 assert.equal(filterReceiptRecords(changed,{receiptSearch:'Changed'}).length,1);
 tickets[1].parent_ticket_id=null;assert.notEqual(groupRepairFamilies(tickets),family);assert.equal(groupRepairFamilies(tickets).length,2);
 tickets.push({id:3,parent_ticket_id:1,invoice_number:'INV-3',created_at:'2026-10-03'});assert.equal(buildReceiptRecords(sales,tickets).length,3);
});
test('merchant accents have readable contrast without changing saved colors',()=>{
 const context={};runInNewContext(readFileSync('public/brand/merchant-accent.js','utf8'),context);
 const {derive,contrast}=context.RetraSellBrand,toRGB=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 for(const theme of ['light','dark'])for(const saved of ['#fff','#000000','#ffff00','#06b9ee','#ff0000','#ffffff00','bad legacy color']){
  const value=derive(saved,theme),surface=toRGB(theme==='dark'?'#151e36':'#ffffff');
  assert.ok(contrast(toRGB(value.accent),surface)>=4.5,saved+' '+theme);
  assert.ok(contrast(toRGB(value.accent),toRGB(value.on))>=4.5,saved+' text '+theme);
 }
 const css=readFileSync('public/brand/retrasell-shop.css','utf8');assert.ok(!css.includes('font-family:Inter'));assert.ok(!css.includes('overflow-x:hidden'));
});
const CFG={shop_name:'Synthetic Merchant',shop_address:'Address',shop_phone:'123',currency:'PKR',terms_text:'Merchant receipt terms'};
const names=['buildTicketSlip','buildReceiptSlip','buildSubInvoiceSlip','buildReturnSlip','buildRepairSummary'];
function builders(source){return new Function('CFG','escapeHTML','safeImageURL','formatMoney','dlog','dstack','withPrintAttribution',source.replace(/^import .*$/gm,'').replaceAll('export ','')+'\nreturn {'+names.join(',')+'};')(CFG,escapeHTML,safeImageURL,x=>'PKR '+Number(x).toFixed(2),()=>{},()=>{},withPrintAttribution);}
test('all thermal builders retain transaction output and automatically add one branded footer',()=>{
 const before=builders(original('src/print/print.js')),after=builders(readFileSync('src/print/print.js','utf8'));
 const ticket={id:1,ticket_number:'TK-1',invoice_number:'INV-1',customer_name:'Customer',created_at:'2026-10-01',components_noted:[],final_total:125};
 const sale={receiptNo:'INV-SALE',items:[{name:'Item',qty:2,soldPrice:50}],total:100,date:'2026-10-01'};
 const samples=[[ticket],[sale,true],[{...ticket,parent_ticket_id:1},ticket],[{invoiceNumber:'INV-RETURN',items:[],refund:25,method:'Cash'}],[{root:ticket,invoices:[],payments:[],refunds:[],effectiveObligation:125,netPayments:50,outstanding:75}]];
 names.forEach((name,i)=>{
  const args=samples[i],baseline=before[name](...args);assert.equal(after[name](...args),withPrintAttribution(baseline),name+' automatic footer');
  const branded=after[name](...args);assert.equal(withPrintAttribution(branded),branded,name+' repeated presentation');
  assert.equal((branded.match(/Powered by RetraSell/g)||[]).length,1);
 });
 CFG.terms_text='Powered by RetraSell';const once=after.buildTicketSlip(ticket);assert.equal((once.match(/Powered by RetraSell/g)||[]).length,1);CFG.terms_text='Merchant receipt terms';
});
test('salary builder keeps amounts and automatically adds the same footer',()=>{
 const extract=source=>source.slice(source.indexOf('export function buildSalarySlipHTML'),source.indexOf('\n/*',source.indexOf('export function buildSalarySlipHTML'))).replace('export ','');
 const build=source=>new Function('escapeHTML','moneyHTML','withPrintAttribution',extract(source)+'\nreturn buildSalarySlipHTML;')(escapeHTML,x=>'PKR '+Number(x).toFixed(2),withPrintAttribution);
 const before=build(original('src/features/admin/ems/index.js')),after=build(readFileSync('src/features/admin/ems/index.js','utf8')),args=[{month:10,year:2026,salary_type:'Monthly',rate:1000,net_salary:900,generated_at:'2026-10-28'},'Employee','Merchant'];
 assert.equal(after(...args),withPrintAttribution(before(...args)));assert.equal(withPrintAttribution(after(...args)),after(...args));
});
test('shift preview/print automatically share one footer without changing financial fields',()=>{
 const extract=source=>source.slice(source.indexOf('function buildShiftStats()'),source.indexOf('\n/*',source.indexOf('function buildShiftStats()')));
 const state={data:{shiftFinancial:{invoiced:225,paymentsCollected:50,refunds:0,netPayments:50,paymentMethods:[{method:'Cash',amount:50}]},shiftPeriod:{label:'Synthetic shift'},shiftSales:[],shiftTickets:[],shiftPending:0}};
 const PrintedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-29T10:00:00Z']));}};
 const build=source=>new Function('state','CFG','SESSION','currentTenant','moneyHTML','escapeHTML','resourceNotice','withPrintAttribution','Date',extract(source)+';return buildShiftStats;')(state,{repair_module_enabled:true},{employee:{name:'Employee'}},()=>({name:'Merchant'}),x=>'PKR '+Number(x).toFixed(2),escapeHTML,()=>'',withPrintAttribution,PrintedDate);
 const before=build(original('src/pos/pos.js'))(),after=build(readFileSync('src/pos/pos.js','utf8'))();
 assert.equal(after,before.replace(/<\/div>$/,withPrintAttribution('')+'</div>'));
 assert.equal(withPrintAttribution(after),after);
});
