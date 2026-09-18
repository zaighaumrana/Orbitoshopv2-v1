import { escapeHTML, safeImageURL } from "../../../html.js"
/* ═══════════════════════════════════════════════════════════════════
   features/pos/checkout/render.js
   Pure, presentational rendering for retail sale checkout --
   POS-exclusive, verified by actual caller (only pos.js calls this).
═══════════════════════════════════════════════════════════════════ */
import { money, moneyHTML, currentTenant } from '../../../shared.js'

export function receiptPreview(sale) {
  if (!sale) return ''
  const t = currentTenant()
  return `<div class="receipt-preview">
    <center>${t.logo?`<img src="${escapeHTML(safeImageURL(t.logo))}" style="max-width:120px;max-height:44px;object-fit:contain;margin-bottom:6px"><br>`:''}
    <strong>${escapeHTML(t.name)}</strong><br>${escapeHTML(t.address||'')}<br>${escapeHTML(t.phone||'')}</center>
    <hr>
    Receipt: ${escapeHTML(sale.receiptNo||'—')}<br>Date: ${sale.date?new Date(sale.date).toLocaleString():new Date().toLocaleString()}<br>
    Cashier: ${escapeHTML(sale.cashier||'Counter')}<br>Customer: ${escapeHTML(sale.customer||'Walk-in')}
    <hr>
    ${(sale.items||[]).map(i=>`${escapeHTML(i.name)}<br>${i.variantName?`&nbsp;&nbsp;${escapeHTML(i.variantName)} — ${moneyHTML(i.soldPrice*(i.qty||1))}<br>`:''}<small>${i.qty||1} × ${moneyHTML(i.soldPrice||0)}${i.discount>0?` (disc ${moneyHTML(i.discount)})`:''}</small>`).join('<br>')}
    <hr>
    ${sale.discount>0?`Discount: ${moneyHTML(sale.discount)}<br>`:''}
    ${sale.tax>0?`Tax: ${moneyHTML(sale.tax)}<br>`:''}
    <strong>Total: ${moneyHTML(sale.total)}</strong><br>Payment: ${escapeHTML(sale.payment||'—')}
    ${sale.payment==='Cash'&&sale.cashTendered>0?`<br>Cash Received: <strong>${moneyHTML(sale.cashTendered)}</strong><br>Change Given: <strong>${moneyHTML(sale.changeGiven||0)}</strong>`:''}
    <hr>
    <center>${escapeHTML(t.receiptFooter||'')}</center>
  </div>`
}
