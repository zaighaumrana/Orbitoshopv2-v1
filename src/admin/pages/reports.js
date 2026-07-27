/* ═══════════════════════════════════════════════════════════════════
   admin/pages/reports.js
   Admin-only analytics page -- reads across sales (Checkout), tickets
   (Repairs), and udhar (Checkout) data all at once for one summary.
   Doesn't belong to any single feature (same reasoning as
   dashboard()/settings() staying admin-owned), so it lives here rather
   than under features/.

   Takes tit (the shared page-title-renderer helper) as a parameter
   rather than importing it from admin.js -- same pattern already
   established for adminInventoryPage({filter, tit}), since a shared
   view-level helper being imported by a page module would invert the
   intended dependency direction.
═══════════════════════════════════════════════════════════════════ */
import { state, money } from '../../shared.js'

export function reportsPage({ tit }) {
  const sales   = state.data.sales   || []
  const tickets = state.data.tickets || []
  const udhar   = state.data.udhar   || []
  const total   = sales.reduce((s,x) => s+Number(x.total_bill||0), 0)
  const disc    = sales.reduce((s,x) => s+Number(x.discount||0), 0)
  const labour  = sales.reduce((s,x) => s+Number(x.labour_cost||0), 0)
  const avg     = sales.length ? total/sales.length : 0
  const udharOut= udhar.filter(u=>u.status!=='Settled').reduce((s,u)=>s+Number(u.balance_due||0),0)
  return `
    ${tit('Reports','Sales analytics and outstanding credits.','')}
    <div class="grid kpi-grid">
      ${[['Total Revenue',total],['Discounts Given',disc],['Labour Income',labour],
         ['Avg Invoice',avg],['Udhar Outstanding',udharOut],['Total Invoices',sales.length]
        ].map(([l,v]) => `
        <div class="card kpi"><span class="label">${l}</span>
          <span class="value">${l==='Total Invoices'?v:money(v)}</span>
        </div>`).join('')}
    </div>
    <div class="grid two-col">
      <div class="card">
        <h2>Payment Breakdown</h2>
        <div class="list">
          ${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer','Udhar'].map(m => {
            const c = sales.filter(s=>s.payment_method===m).length
            const r = sales.filter(s=>s.payment_method===m).reduce((s,x)=>s+Number(x.total_bill||0),0)
            return c ? `<div class="list-row"><span>${m} <small class="muted">(${c})</small></span><strong>${money(r)}</strong></div>` : ''
          }).join('')}
        </div>
      </div>
      <div class="card">
        <h2>Repair Summary</h2>
        <div class="list">
          ${['Pending','In Progress','Ready','Delivered','Declined'].map(s => `
            <div class="list-row"><span>${s}</span><strong>${tickets.filter(t=>t.status===s).length}</strong></div>`).join('')}
        </div>
      </div>
    </div>
    <div class="card">
      <h2>Recent Invoices</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Invoice</th><th>Customer</th><th>Items</th><th>Payment</th><th>Total</th><th>Date</th><th></th></tr></thead>
        <tbody>
          ${sales.slice(0,15).map(s => `<tr>
            <td>${s.invoice_number||`INV-${s.id}`}</td>
            <td>${s.customer_name||'Walk-in'}</td>
            <td>${(s.items_sold||[]).length} item(s)</td>
            <td>${s.payment_method}</td>
            <td>${money(s.total_bill)}</td>
            <td>${new Date(s.created_at).toLocaleDateString()}</td>
            <td><button class="secondary-button" style="font-size:12px"
              data-action="reprint-receipt" data-sale-id="${s.id}">Reprint</button></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`
}
