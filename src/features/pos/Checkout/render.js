/* ═══════════════════════════════════════════════════════════════════
   features/pos/checkout/render.js
   Pure, presentational rendering for retail sale checkout --
   POS-exclusive, verified by actual caller (only pos.js calls this).
═══════════════════════════════════════════════════════════════════ */
import { money, currentTenant } from '../../../shared.js'

export function receiptPreview(sale) {
  if (!sale) return ''
  const t = currentTenant()
  return `<div class="receipt-preview">
    <center>${t.logo?`<img src="${t.logo}" style="max-width:120px;max-height:44px;object-fit:contain;margin-bottom:6px"><br>`:''}
    <strong>${t.name}</strong><br>${t.address||''}<br>${t.phone||''}</center>
    <hr>
    Receipt: ${sale.receiptNo||'—'}<br>Date: ${sale.date?new Date(sale.date).toLocaleString():new Date().toLocaleString()}<br>
    Cashier: ${sale.cashier||'Counter'}<br>Customer: ${sale.customer||'Walk-in'}
    <hr>
    ${(sale.items||[]).map(i=>`${i.name}<br>${i.variantName?`&nbsp;&nbsp;${i.variantName} — ${money(i.soldPrice*(i.qty||1))}<br>`:''}<small>${i.qty||1} × ${money(i.soldPrice||0)}${i.discount>0?` (disc ${money(i.discount)})`:''}</small>`).join('<br>')}
    <hr>
    ${sale.discount>0?`Discount: ${money(sale.discount)}<br>`:''}
    ${sale.tax>0?`Tax: ${money(sale.tax)}<br>`:''}
    <strong>Total: ${money(sale.total)}</strong><br>Payment: ${sale.payment||'—'}
    ${sale.payment==='Cash'&&sale.cashTendered>0?`<br>Cash Received: <strong>${money(sale.cashTendered)}</strong><br>Change Given: <strong>${money(sale.changeGiven||0)}</strong>`:''}
    <hr>
    <center>${t.receiptFooter||''}</center>
  </div>`
}
