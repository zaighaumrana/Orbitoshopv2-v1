/* ═══════════════════════════════════════════════════════════════════
   admin/pages/reports.js
   Admin-only analytics page. Financial values come from the canonical
   Phase 3 report RPC; legacy headers remain only for recent-invoice and
   operational repair lists.
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
  const report  = state.data.financial || {}
  const metric = key => Number(report[key] || 0)
  const methods = report.paymentMethods || []
  const costCoverage = metric('inventoryCostCoverage')
  return `
    ${tit('Reports','Invoices, real money movement, receivables, and Udhar.','')}
    <div class="grid kpi-grid">
      ${[
        ['Invoiced / Sales', metric('invoiced')],
        ['Payments Collected', metric('paymentsCollected')],
        ['Refunds', metric('refunds')],
        ['Net Payments', metric('netPayments')],
        ['Outstanding Receivables', metric('outstandingReceivables')],
        ['Udhar Outstanding', metric('udharOutstanding')],
      ].map(([l,v]) => `
        <div class="card kpi"><span class="label">${l}</span>
          <span class="value">${money(v)}</span>
        </div>`).join('')}
    </div>
    <div class="grid two-col">
      <div class="card">
        <h2>Actual Payments by Method</h2>
        <div class="list">
          ${methods.length ? methods.map(row => `
            <div class="list-row"><span>${row.method} <small class="muted">(${row.count})</small></span><strong>${money(row.amount)}</strong></div>
          `).join('') : '<div class="empty">No payment events.</div>'}
        </div>
      </div>
      <div class="card">
        <h2>Financial Detail</h2>
        <div class="list">
          <div class="list-row"><span>Retail invoiced</span><strong>${money(metric('retailInvoiced'))}</strong></div>
          <div class="list-row"><span>Repair invoiced</span><strong>${money(metric('repairInvoiced'))}</strong></div>
          <div class="list-row"><span>Retail return reductions</span><strong>-${money(metric('retailReturnReductions'))}</strong></div>
          <div class="list-row"><span>Repair adjustments</span><strong>${money(metric('repairAdjustments'))}</strong></div>
          <div class="list-row"><span>Inventory gross profit</span><strong>${costCoverage > 0 ? money(metric('inventoryGrossProfit')) : 'Not available'}</strong></div>
          <small class="muted">Inventory gross profit is shown only for tracked lines with a captured cost; it is not total business net profit.</small>
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
