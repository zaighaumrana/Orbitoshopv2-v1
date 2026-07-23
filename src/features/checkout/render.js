/* ═══════════════════════════════════════════════════════════════════
   features/checkout/render.js
   Pure, presentational rendering for retail sale checkout. Moved out
   of pos.js during the Checkout extraction (see architecture refactor).

   Only receiptPreview() is here so far -- it's the one checkout
   function confirmed fully pure (sale object in, HTML string out, zero
   posState dependency). doCheckout(), _finalizeCheckout(),
   settleUdhar(), updateQty(), removeCartItem() are NOT here yet: they
   all read/mutate posState.cart directly, which is referenced in 28
   places across pos.js (rendering, click handlers, checkout logic).
   That needs its own dedicated state.js extraction, same treatment as
   the repairs draft state, before those functions can move safely.
═══════════════════════════════════════════════════════════════════ */
import { money, currentTenant } from '../../shared.js'

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
