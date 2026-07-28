/* ═══════════════════════════════════════════════════════════════════
   features/admin/checkout/render.js
   Admin-exclusive sales/receipts browsing -- verified by actual caller
   (only admin.js calls this). state.data.sales is Checkout-domain
   data; the POS-side of Checkout (placing a sale) lives at
   features/pos/checkout/ -- same admin/pos split shape as Inventory.

   Takes tit, adminState, and CFG as parameters rather than importing
   tit/adminState from admin.js -- same pattern as
   adminInventoryPage({filter, tit}) and reportsPage({tit}).
═══════════════════════════════════════════════════════════════════ */
import { state, CFG, money, matchesInvoiceSearch } from '../../../shared.js'

export function receiptsPage({ tit, adminState }) {
  const allSales = state.data.sales || []
  const dateFrom = adminState.receiptDateFrom || ''
  const dateTo   = adminState.receiptDateTo   || ''
  const search   = adminState.receiptSearch   || ''

  const filtered = allSales.filter(s => {
    const matchText = (`${s.customer_name||''} ${s.payment_method||''} ${s.employee_name||''}`)
      .toLowerCase().includes(search.toLowerCase())
    const matchInvoice = matchesInvoiceSearch(s.invoice_number||'', search, CFG.invoice_prefix) && search.trim() !== ''
    const sDate     = (s.created_at||'').slice(0,10)
    const matchFrom = !dateFrom || sDate >= dateFrom
    const matchTo   = !dateTo   || sDate <= dateTo
    return (matchText || matchInvoice) && matchFrom && matchTo
  })

  return `
    ${tit('Receipts Archive','Full log of all completed sales.','')}
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;align-items:flex-end">
      <div style="flex:1;min-width:200px">
        <input class="search" data-receipt-search value="${search}"
          placeholder="Search by customer, payment…"
          style="width:100%">
      </div>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)">
        From
        <input type="date" value="${dateFrom}" data-receipt-from
          style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;
                 background:var(--surface);color:var(--text);font-size:13px">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)">
        To
        <input type="date" value="${dateTo}" data-receipt-to
          style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;
                 background:var(--surface);color:var(--text);font-size:13px">
      </label>
      <button class="secondary-button" data-action="clear-receipt-filter">Clear</button>
    </div>
    <p class="muted" style="font-size:13px;margin-bottom:8px">
      ${filtered.length} receipt${filtered.length !== 1 ? 's' : ''} found
    </p>
    <div class="card" style="display:grid;gap:0">
      ${filtered.length ? filtered.map((s, idx) => `
        <div style="border-bottom:1px solid var(--border);padding:12px 4px;
                    display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div style="cursor:pointer;flex:1;min-width:0"
            data-action="open-receipt-modal" data-receipt-idx="${idx}">
            <strong>${s.customer_name||'Walk-in'}</strong><br>
            <span class="muted" style="font-size:12px">
              ${s.invoice_number||`INV-${s.id}`} · ${s.payment_method} · ${s.employee_name||''}
            </span>
          </div>
          <div style="text-align:right;flex-shrink:0;display:flex;align-items:center;gap:10px">
            <div>
              <div><strong>${money(s.total_bill)}</strong></div>
              <span class="muted" style="font-size:11px">
                ${new Date(s.created_at).toLocaleDateString()}
                ${new Date(s.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
              </span>
            </div>
            <button class="secondary-button" style="font-size:12px;white-space:nowrap"
              data-action="reprint-receipt" data-sale-id="${s.id}">Reprint</button>
          </div>
        </div>`).join('') :
      `<div class="empty" style="padding:24px;text-align:center">No receipts found.</div>`}
    </div>`
}
