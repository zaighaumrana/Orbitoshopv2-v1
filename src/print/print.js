import { escapeHTML, safeImageURL } from '../html.js'
import { CFG, money as formatMoney } from '../shared.js'
import { dlog, dstack } from '../debuglog.js'
import { measureThermal, queueThermalIntent } from '../platform/thermal.js'
const money = (...args) => escapeHTML(formatMoney(...args))

const thermalMarker = (type, reference, reprint = false) => `<span hidden data-thermal-type="${escapeHTML(type)}" data-thermal-reference="${escapeHTML(reference)}" data-thermal-reprint="${reprint ? 'true' : 'false'}"></span>`
let printQueue = Promise.resolve()
export function printThermal(html, { copies = 1 } = {}) {
  printQueue = printQueue.then(() => runThermalPrint(html, copies)).catch(() => {
    console.warn('Thermal print could not be opened.')
  })
  return printQueue
}

async function runThermalPrint(html, copies) {
  measureThermal(1, copies) // Validate before creating an iframe or recording intent.
  dstack('print.printThermal', 'Opening thermal print intent')
  const old = document.getElementById('thermal-frame')
  if (old) old.remove()
  const iframe = document.createElement('iframe')
  iframe.id = 'thermal-frame'
  Object.assign(iframe.style, { position:'fixed', top:'-9999px', left:'-9999px', width:'80mm', height:'1px', border:'none' })
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument || iframe.contentWindow.document
  const loaded = new Promise(resolve => iframe.addEventListener('load', () => resolve(true), { once: true }))
  doc.open()
  doc.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Courier New',monospace;font-size:12px;color:#000;background:#fff;width:80mm;padding:4mm;line-height:1.6}.c{text-align:center}.b{font-weight:bold}.lg{font-size:15px;font-weight:bold}.sm{font-size:10px;color:#555}.row{display:flex;justify-content:space-between}.ln{border-top:1px dashed #000;margin:5px 0}.bw{text-align:center;margin:6px 0}@page{margin:0;size:80mm auto}</style>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  </head><body>${html}
  </body></html>`)
  doc.close()
  const bounded = promise => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(false), 5000))])
  let available = await bounded(loaded)
  if (doc.fonts) available = await bounded(doc.fonts.ready.then(() => true)) && available
  const imagesReady = await bounded(Promise.all([...doc.images].map(img => img.decode().then(() => true, () => false))).then(results => results.every(Boolean)))
  available = imagesReady && available
  for (const barcode of doc.querySelectorAll('.bc')) {
    try { iframe.contentWindow.JsBarcode(barcode, barcode.dataset.val, { format: 'CODE128', width: 1.4, height: 38, displayValue: false }) }
    catch { available = false }
  }
  // Reading the bounding rect flushes layout after fonts/images/barcodes settle.
  const metadata = doc.querySelector('[data-thermal-type]')
  const height = doc.body.getBoundingClientRect().height
  if (metadata) await queueThermalIntent({
    document_type: metadata.dataset.thermalType,
    document_reference: metadata.dataset.thermalReference,
    is_reprint: metadata.dataset.thermalReprint === 'true',
    occurred_at: new Date().toISOString(),
    ...measureThermal(height, copies, available),
  })
  // Explicit app copies are represented in printed content, not assumed from
  // an unknowable printer-dialog copy setting. Preview builders never meter.
  if (copies > 1) {
    const original = doc.body.innerHTML
    doc.body.innerHTML = Array.from({ length: copies }, () => `<section style="break-after:page">${original}</section>`).join('')
  }
  iframe.contentWindow.focus()
  iframe.contentWindow.print()
}

export function buildTicketSlip(ticket) {
  dlog('print.buildTicketSlip', `ENTRY ticket_number=${ticket?.ticket_number}`)
  const comps = ticket.components_noted || []
  return `
    ${thermalMarker(ticket.parent_ticket_id ? 'repair_child' : 'repair_parent', ticket.invoice_number || ticket.ticket_number)}
    ${CFG.shop_logo ? `<div class="c"><img src="${escapeHTML(safeImageURL(CFG.shop_logo))}" style="max-width:140px;max-height:50px;object-fit:contain"></div>` : ''}
    <div class="c b lg">${escapeHTML(CFG.shop_name||'Repair Shop')}</div>
    <div class="c sm">${escapeHTML(CFG.shop_address||'')}</div>
    <div class="c sm">${escapeHTML(CFG.shop_phone||'')}</div>
    <div class="ln"></div>
    <div class="c b">REPAIR TICKET</div>
    <div class="c lg">${escapeHTML(ticket.invoice_number||ticket.ticket_number)}</div>
    <div class="c sm">Ticket: ${escapeHTML(ticket.ticket_number)}</div>
    <div class="bw"><svg class="bc" data-val="${escapeHTML(ticket.invoice_number||ticket.ticket_number)}"></svg></div>
    <div class="ln"></div>
    <div class="row"><span>Customer</span><span>${escapeHTML(ticket.customer_name)}</span></div>
    <div class="row"><span>Phone</span><span>${escapeHTML(ticket.customer_phone)}</span></div>
    <div class="row"><span>Device</span><span>${escapeHTML(ticket.device_brand)} ${escapeHTML(ticket.device_model)}</span></div>
    ${ticket.imei ? `<div class="row"><span>IMEI</span><span class="sm">${escapeHTML(ticket.imei)}</span></div>` : ''}
    <div class="row"><span>Date</span><span>${new Date(ticket.created_at).toLocaleDateString()}</span></div>
    <div class="ln"></div>
    <div class="b">Issues Noted:</div>
    ${comps.length ? comps.map(c => {
      const label = c.tag === 'Custom' ? (c.customText || '') : (c.tag || '')
      return `<div class="row"><span>· ${escapeHTML(c.name)}${label ? ` (${escapeHTML(label)})` : ''}</span><span class="sm">${Number(c.price)>0 ? money(c.price) : ''}</span></div>`
    }).join('') : '<div class="sm">No components noted.</div>'}
    <div class="ln"></div>
    ${Number(ticket.labour_cost)>0 ? `<div class="row"><span>Labour Fee</span><span>${money(ticket.labour_cost)}</span></div>` : ''}
    <div class="row b"><span>Original Invoice Total</span><span>${money(ticket.final_total ?? ticket.estimated_quote)}</span></div>
    <div class="row"><span>Paid at Creation</span><span>${money(ticket.advance_payment||0)}${ticket.advance_method ? ` (${escapeHTML(ticket.advance_method)})` : ''}</span></div>
    <div class="row b"><span>Remaining at Creation</span><span>${money(Math.max(0, Number(ticket.final_total ?? ticket.estimated_quote ?? 0)-Number(ticket.advance_payment||0)))}</span></div>
    <div class="ln"></div>
    ${ticket.technician_note ? `<div class="sm">Note: ${escapeHTML(ticket.technician_note)}</div><div class="ln"></div>` : ''}
    ${CFG.terms_text ? `<div class="c sm">${escapeHTML(CFG.terms_text)}</div><div class="ln"></div>` : ''}
    <div class="ln"></div>
    <div class="c sm">Track your repair online:</div>
    <div class="c b">orbitoshop.ahwad.com/track</div>
    <div class="c sm">Ticket: ${escapeHTML(ticket.ticket_number)}</div>
    <div class="c sm">Thank you for your trust.</div>`
}

export function buildReceiptSlip(sale, isReprint = false) {
  dlog('print.buildReceiptSlip', `ENTRY receiptNo=${sale?.receiptNo} isReprint=${isReprint}`)
  const items = sale.items || []
  return `
    ${thermalMarker('retail_receipt', sale.receiptNo, isReprint)}
    ${isReprint ? `<div style="text-align:center;font-size:16px;font-weight:900;border:3px solid #000;padding:4px 8px;margin-bottom:6px;letter-spacing:2px">★ DUPLICATE / REPRINT ★</div>` : ''}
    ${CFG.shop_logo ? `<div class="c"><img src="${escapeHTML(safeImageURL(CFG.shop_logo))}" style="max-width:140px;max-height:50px;object-fit:contain"></div>` : ''}
    <div class="c b lg">${escapeHTML(CFG.shop_name||'Repair Shop')}</div>
    <div class="c sm">${escapeHTML(CFG.shop_address||'')}</div>
    <div class="c sm">${escapeHTML(CFG.shop_phone||'')}</div>
    <div class="ln"></div>
    <div class="c b">RECEIPT</div>
    <div class="c">${escapeHTML(sale.receiptNo)}</div>
    <div class="bw"><svg class="bc" data-val="${escapeHTML(sale.receiptNo)}"></svg></div>
    <div class="ln"></div>
    <div class="row"><span>Date</span><span>${new Date(sale.date||Date.now()).toLocaleDateString()}</span></div>
    ${sale.customer ? `<div class="row"><span>Customer</span><span>${escapeHTML(sale.customer)}</span></div>` : ''}
    ${sale.cashier  ? `<div class="row"><span>Cashier</span><span>${escapeHTML(sale.cashier)}</span></div>`  : ''}
    <div class="ln"></div>
    ${items.map(i => `
      <div class="row"><span>${escapeHTML(i.name)}</span>${i.variantName ? '' : `<span>${money(i.soldPrice*i.qty)}</span>`}</div>
      ${i.variantName ? `<div class="row"><span>&nbsp;&nbsp;${escapeHTML(i.variantName)}</span><span>${money(i.soldPrice*i.qty)}</span></div>` : ''}
      <div class="sm row"><span>  ${i.qty} × ${money(i.soldPrice)}${i.discount>0?` (disc ${money(i.discount)})`:''}</span></div>
    `).join('')}
    <div class="ln"></div>
    ${sale.discount>0 ? `<div class="row"><span>Discount</span><span>${money(sale.discount)}</span></div>` : ''}
    ${sale.labour>0   ? `<div class="row"><span>Labour</span><span>${money(sale.labour)}</span></div>`   : ''}
    ${sale.tax>0      ? `<div class="row"><span>Tax</span><span>${money(sale.tax)}</span></div>`         : ''}
    <div class="row b lg"><span>TOTAL</span><span>${money(sale.total)}</span></div>
    <div class="row"><span>Payment</span><span>${escapeHTML(sale.payment)}</span></div>
    ${sale.payment==='Cash'&&sale.cashTendered>0 ? `
    <div class="row"><span>Cash Received</span><span>${money(sale.cashTendered)}</span></div>
    <div class="row"><span>Change Given</span><span>${money(sale.changeGiven||0)}</span></div>` : ''}
    <div class="ln"></div>
    <div class="c sm">${escapeHTML(CFG.terms_text||'Thank you for your business.')}</div>`
}

export function buildSubInvoiceSlip(sub, parentTicket) {
  const comps = sub.components_noted || []
  return `
    ${thermalMarker('repair_child', sub.invoice_number)}
    ${CFG.shop_logo ? `<div class="c"><img src="${escapeHTML(safeImageURL(CFG.shop_logo))}" style="max-width:140px;max-height:50px;object-fit:contain"></div>` : ''}
    <div class="c b lg">${escapeHTML(CFG.shop_name||'Repair Shop')}</div>
    <div class="c sm">${escapeHTML(CFG.shop_address||'')}</div>
    <div class="c sm">${escapeHTML(CFG.shop_phone||'')}</div>
    <div class="ln"></div>
    <div class="c b">SUB-INVOICE</div>
    <div class="c lg">${escapeHTML(sub.invoice_number)}</div>
    <div class="c sm">Linked to: ${escapeHTML(parentTicket.invoice_number)}</div>
    <div class="bw"><svg class="bc" data-val="${escapeHTML(sub.invoice_number)}"></svg></div>
    <div class="ln"></div>
    <div class="row"><span>Customer</span><span>${escapeHTML(sub.customer_name)}</span></div>
    <div class="row"><span>Device</span><span>${escapeHTML(sub.device_brand)} ${escapeHTML(sub.device_model)}</span></div>
    <div class="row"><span>Date</span><span>${new Date(sub.created_at||Date.now()).toLocaleDateString()}</span></div>
    <div class="ln"></div>
    <div class="b">Additional Work:</div>
    ${comps.length ? comps.map(c => `<div class="row"><span>· ${escapeHTML(c.name)}</span><span class="sm">${Number(c.price)>0?money(c.price):''}</span></div>`).join('') : '<div class="sm">No additional components.</div>'}
    <div class="ln"></div>
    ${Number(sub.labour_cost)>0 ? `<div class="row"><span>Labour Fee</span><span>${money(sub.labour_cost)}</span></div>` : ''}
    <div class="row b"><span>Sub-Invoice Total</span><span>${money(sub.estimated_quote)}</span></div>
    ${Number(sub.amount_paid)>0 ? `<div class="row"><span>Applied (advance credit)</span><span>${money(sub.amount_paid)}</span></div>` : ''}
    <div class="row b lg"><span>Balance Due</span><span>${money(sub.balance_due)}</span></div>
    <div class="ln"></div>
    ${sub.technician_note ? `<div class="sm">Note: ${escapeHTML(sub.technician_note)}</div><div class="ln"></div>` : ''}
    <div class="c sm">${escapeHTML(CFG.terms_text||'Thank you for your business.')}</div>`
}

export function buildReturnSlip(data) {
  return `
    ${thermalMarker('return_slip', data.invoiceNumber)}
    <div class="c b lg">${escapeHTML(CFG.shop_name||'Retail Shop')}</div>
    <div class="c sm">${escapeHTML(CFG.shop_address||'')}</div>
    <div class="ln"></div>
    <div class="c b">RETURN / REFUND</div>
    <div class="ln"></div>
    <div class="row"><span>Original Invoice</span><span>${escapeHTML(data.invoiceNumber)}</span></div>
    <div class="row"><span>Date</span><span>${new Date().toLocaleDateString()}</span></div>
    <div class="ln"></div>
    ${data.items.map(i => `<div class="row"><span>${escapeHTML(i.name)} × ${i.qty}</span><span>${money(i.sold_price*i.qty)}</span></div>`).join('')}
    <div class="ln"></div>
    <div class="row b lg"><span>REFUND</span><span>${money(data.refund)}</span></div>
    <div class="row"><span>Method</span><span>${escapeHTML(data.method)}</span></div>
    <div class="ln"></div>
    <div class="c sm">Please retain this slip for your records.</div>`
}

export function buildRepairSummary(summary) {
  const root = summary.root || {}
  const invoices = summary.invoices || []
  const adjustments = summary.adjustments || []
  const payments = summary.payments || []
  const refunds = summary.refunds || []
  return `
    ${thermalMarker('repair_summary', root.invoiceNumber || root.ticketNumber)}
    ${CFG.shop_logo ? `<div class="c"><img src="${escapeHTML(safeImageURL(CFG.shop_logo))}" style="max-width:140px;max-height:50px;object-fit:contain"></div>` : ''}
    <div class="c b lg">${escapeHTML(CFG.shop_name||'Repair Shop')}</div>
    <div class="c sm">${escapeHTML(CFG.shop_address||'')}</div>
    <div class="c sm">${escapeHTML(CFG.shop_phone||'')}</div>
    <div class="ln"></div>
    <div class="c b">FINAL REPAIR SUMMARY</div>
    <div class="c lg">${escapeHTML(root.invoiceNumber||root.ticketNumber||'')}</div>
    <div class="c sm">Ticket: ${escapeHTML(root.ticketNumber||'')}</div>
    <div class="ln"></div>
    <div class="row"><span>Customer</span><span>${escapeHTML(root.customerName||'')}</span></div>
    <div class="row"><span>Device</span><span>${escapeHTML(root.deviceBrand||'')} ${escapeHTML(root.deviceModel||'')}</span></div>
    <div class="ln"></div>
    <div class="b">Invoices</div>
    ${invoices.map(i => {
      const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      return `<div class="b" style="margin-top:6px">${i.parentTicketId ? 'Additional Work' : 'Original Repair'}: ${esc(i.invoiceNumber||i.ticketNumber)}</div>
        ${i.parentTicketId ? `<div class="sm">Parent: ${esc(root.invoiceNumber||root.ticketNumber)}</div>` : ''}
        ${(i.components||[]).map(c=>`<div class="row sm"><span>${esc(c.name)}${c.tag ? ' — '+esc(c.tag==='Custom'?c.customText:c.tag) : ''}${c.removed ? ' (not needed)' : ''}</span><span>${c.price != null ? money(c.price) : ''}</span></div>`).join('')}
        ${i.labourCost != null ? `<div class="row sm"><span>Labour</span><span>${money(i.labourCost)}</span></div>` : ''}
        ${i.note ? `<div class="sm">${esc(i.note)}</div>` : ''}
        <div class="row b"><span>Invoice subtotal</span><span>${money(i.amount)}</span></div>`
    }).join('')}
    ${adjustments.length ? `<div class="b" style="margin-top:4px">Adjustments</div>${adjustments.map(a => `<div class="row"><span>${escapeHTML(a.type)}: ${escapeHTML(a.reason)}</span><span>${money(a.amount)}</span></div>`).join('')}` : ''}
    <div class="ln"></div>
    <div class="row b"><span>Total Billed</span><span>${money(summary.effectiveObligation)}</span></div>
    <div class="ln"></div>
    <div class="b">Payments</div>
    ${payments.length ? payments.map(p => `<div class="row"><span>${new Date(p.createdAt).toLocaleDateString()} ${escapeHTML(p.method)}</span><span>${money(p.amount)}</span></div>`).join('') : '<div class="sm">None</div>'}
    <div class="b" style="margin-top:4px">Refunds</div>
    ${refunds.length ? refunds.map(r => `<div class="row"><span>${new Date(r.createdAt).toLocaleDateString()} ${escapeHTML(r.method)}</span><span>-${money(r.amount)}</span></div>`).join('') : '<div class="sm">None</div>'}
    <div class="ln"></div>
    <div class="row"><span>Net Payments</span><span>${money(summary.netPayments)}</span></div>
    <div class="row b lg"><span>Outstanding</span><span>${money(summary.outstanding)}</span></div>
    ${summary.udharApproved ? `<div class="row"><span>Udhar Approved</span><span>${money(summary.udharOutstanding)}</span></div>` : ''}
    <div class="row"><span>Status</span><span>${escapeHTML(root.status||'')}</span></div>
    ${root.deliveredAt ? `<div class="row"><span>Delivered</span><span>${new Date(root.deliveredAt).toLocaleString()}</span></div>` : ''}
    ${root.cancelledAt ? `<div class="row"><span>Cancelled</span><span>${new Date(root.cancelledAt).toLocaleString()}</span></div>` : ''}
    <div class="ln"></div>
    <div class="c sm">${escapeHTML(CFG.terms_text||'Thank you for your business.')}</div>`
}
