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
import { state, money } from '../../../shared.js'
import { buildReceiptRecords, filterReceiptRecords } from './receipts.js'

function receiptArchive(adminState) {
  return filterReceiptRecords(
    buildReceiptRecords(state.data.sales || [], state.data.tickets || []),
    adminState,
  )
}

export function receiptsPage({ tit, adminState }) {
  const dateFrom = adminState.receiptDateFrom || ''
  const dateTo   = adminState.receiptDateTo   || ''
  const search   = adminState.receiptSearch   || ''
  const receiptType = adminState.receiptType || 'all'
  const filtered = receiptArchive(adminState)

  return `
    ${tit('Receipts Archive','Retail receipts and repair invoices in one searchable archive.','')}
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;align-items:flex-end">
      <div style="flex:1;min-width:200px">
        <input class="search" data-receipt-search value="${search}"
          placeholder="Search invoice, ticket, customer, phone, device…"
          style="width:100%">
      </div>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)">
        Type
        <select data-receipt-type style="border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:var(--surface);color:var(--text);font-size:13px">
          <option value="all" ${receiptType === 'all' ? 'selected' : ''}>All</option>
          <option value="retail" ${receiptType === 'retail' ? 'selected' : ''}>Retail</option>
          <option value="repair" ${receiptType === 'repair' ? 'selected' : ''}>Repair</option>
        </select>
      </label>
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
      ${filtered.length} receipt${filtered.length !== 1 ? 's' : ''} / invoice${filtered.length !== 1 ? 's' : ''} found
    </p>
    <div class="card" style="display:grid;gap:0">
      ${filtered.length ? filtered.map((record, idx) => `
        <div style="border-bottom:1px solid var(--border);padding:12px 4px;
                    display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div style="cursor:pointer;flex:1;min-width:0"
            data-action="open-receipt-modal" data-receipt-idx="${idx}">
            <strong>${record.customerName}</strong>
            <span class="badge ${record.type === 'repair' ? 'warn' : 'good'}" style="margin-left:6px">${record.label}</span><br>
            <span class="muted" style="font-size:12px">
              <strong>${record.invoiceNumber}</strong>${record.ticketNumber ? ` · ${record.ticketNumber}` : ''}
              ${record.parentInvoiceNumber ? `<br>Parent: ${record.parentInvoiceNumber}${record.parentTicketNumber ? ` · ${record.parentTicketNumber}` : ''}` : ''}
              <br>${record.paymentMethod}${record.employeeName ? ` · ${record.employeeName}` : ''}
            </span>
          </div>
          <div style="text-align:right;flex-shrink:0;display:flex;align-items:center;gap:10px">
            <div>
              <div><strong>${money(record.total)}</strong></div>
              <span class="muted" style="font-size:11px">
                ${new Date(record.createdAt).toLocaleDateString()}
                ${new Date(record.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
              </span>
            </div>
            ${record.kind === 'ticket'
              ? `<button class="secondary-button" style="font-size:12px;white-space:nowrap" data-action="print-repair-invoice" data-ticket-id="${record.id}">Print</button>`
              : `<button class="secondary-button" style="font-size:12px;white-space:nowrap" data-action="reprint-receipt" data-sale-id="${record.id}">Reprint</button>`}
          </div>
        </div>`).join('') :
      `<div class="empty" style="padding:24px;text-align:center">No receipts found.</div>`}
    </div>`
}

export function udharListModalHTML() {
  const outstanding = state.data.udharAccounts || []
  return `<div class="modal-backdrop"><div class="modal modal-lg">
    <h2>Outstanding Credits</h2>
    ${outstanding.length === 0 ? `<div class="empty">No outstanding credits.</div>` : `
      <div style="display:grid;gap:10px">
        ${outstanding.map(u => `
          <div style="padding:12px;background:var(--surface-2);border-radius:8px;display:grid;gap:8px">
            <div style="display:flex;justify-content:space-between">
              <div><strong>${u.customerName}</strong> · ${u.customerPhone}<br>
                <small class="muted">${u.kind === 'repair' ? 'Repair' : 'Retail'} · ${u.reference} · ${new Date(u.createdAt).toLocaleDateString()}</small></div>
              <span class="badge ${u.status==='Settled'?'good':'bad'}">${u.status}</span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span>Balance: <strong>${money(u.outstanding)}</strong></span>
              <span class="muted">Current total: ${money(u.effectiveObligation)}</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="number" step="any" min="0" max="${u.outstanding}" placeholder="Amount to settle" data-settle-amount="${u.kind}:${u.sourceId}"
                style="flex:1;border:1px solid var(--border);border-radius:6px;padding:7px 9px;background:var(--surface);color:var(--text)">
              <select data-settle-method="${u.kind}:${u.sourceId}" style="border:1px solid var(--border);border-radius:6px;padding:7px 9px;background:var(--surface);color:var(--text)">
                ${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer'].map(m => `<option>${m}</option>`).join('')}
              </select>
              <button class="primary-button" data-settle-id="${u.kind}:${u.sourceId}">Settle</button>
            </div>
          </div>`).join('')}
      </div>`}
    <div class="modal-actions"><button class="secondary-button" data-close>Close</button></div>
  </div></div>`
}

export function receiptDetailModalHTML(adminState) {
  const filtered = receiptArchive(adminState)
  const idx  = adminState.receiptModalIdx ?? 0
  const record = filtered[idx]
  if (!record) return ''
  if (record.kind === 'ticket') return repairReceiptDetailHTML(record, idx, filtered.length)
  const s = record.raw
  const items = Array.isArray(s.items_sold) ? s.items_sold : []
  const hasPrev = idx > 0
  const hasNext = idx < filtered.length - 1
  return `
    <div class="modal-backdrop" data-no-backdrop-close>
      <div class="modal modal-md" style="max-height:90vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h2 style="margin:0">${s.invoice_number||`INV-${s.id}`}</h2>
          <button class="icon-button" data-close style="font-size:20px;line-height:1">×</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;
                    padding:12px;background:var(--surface-2);border-radius:10px;
                    font-size:13px;margin-bottom:16px">
          <div><span class="muted">Date</span><br>
            <strong>${new Date(s.created_at).toLocaleString()}</strong></div>
          <div><span class="muted">Customer</span><br>
            <strong>${s.customer_name||'Walk-in'}</strong></div>
          <div><span class="muted">Cashier</span><br>
            <strong>${s.employee_name||'—'}</strong></div>
          <div><span class="muted">Payment</span><br>
            <strong>${s.payment_method}</strong></div>
          ${s.ticket_id ? `<div><span class="muted">Linked Ticket</span><br><strong>#${s.ticket_id}</strong></div>` : ''}
        </div>

        <div style="margin-bottom:16px">
          <p style="font-size:12px;font-weight:600;color:var(--muted);
                     text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Items</p>
          ${items.length ? `
            <div style="display:grid;gap:0;border:1px solid var(--border);border-radius:8px;overflow:hidden">
              <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;
                          padding:8px 12px;background:var(--surface-2);
                          font-size:12px;font-weight:600;color:var(--muted)">
                <span>Item</span><span>Qty</span><span>Total</span>
              </div>
              ${items.map(i => `
                <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;
                            padding:10px 12px;border-top:1px solid var(--border);font-size:13px">
                  <div>
                    <strong>${i.name||'Item'}</strong>
                    <br><span class="muted">${money(i.soldPrice||i.sold_price||0)} each
                    ${(i.discount||0) > 0 ? ` · disc ${money(i.discount)}` : ''}</span>
                  </div>
                  <span style="text-align:right">${i.qty||1}</span>
                  <span style="text-align:right"><strong>${money((i.soldPrice||i.sold_price||0)*(i.qty||1))}</strong></span>
                </div>`).join('')}
            </div>` :
            `<p class="muted" style="font-size:13px">No item breakdown recorded.</p>`}
        </div>

        <div style="border-top:1px solid var(--border);padding-top:12px;
                    display:grid;gap:6px;font-size:13px">
          ${Number(s.labour_cost||0) > 0 ? `
            <div style="display:flex;justify-content:space-between">
              <span>Labour</span><span>${money(s.labour_cost)}</span>
            </div>` : ''}
          ${Number(s.discount||0) > 0 ? `
            <div style="display:flex;justify-content:space-between;color:var(--success)">
              <span>Discount</span><span>− ${money(s.discount)}</span>
            </div>` : ''}
          ${Number(s.tax||0) > 0 ? `
            <div style="display:flex;justify-content:space-between">
              <span>Tax</span><span>${money(s.tax)}</span>
            </div>` : ''}
          <div style="display:flex;justify-content:space-between;
                      font-size:18px;font-weight:700;padding-top:6px;
                      border-top:1px solid var(--border)">
            <span>Total</span><span>${money(s.total_bill)}</span>
          </div>
          ${s.cash_tendered > 0 ? `
            <div style="display:flex;justify-content:space-between;color:var(--muted)">
              <span>Cash Received</span><span>${money(s.cash_tendered)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;color:var(--muted)">
              <span>Change Given</span><span>${money(s.change_given||0)}</span>
            </div>` : ''}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;
                    margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="display:flex;gap:8px">
            <button class="secondary-button" ${!hasPrev?'disabled':''} data-action="receipt-prev">← Prev</button>
            <button class="secondary-button" ${!hasNext?'disabled':''} data-action="receipt-next">Next →</button>
          </div>
          <div style="display:flex;gap:8px">
            <button class="secondary-button" data-close>Close</button>
            <button class="primary-button"
              data-action="reprint-receipt" data-sale-id="${s.id}">Reprint</button>
          </div>
        </div>
      </div>
    </div>`
}

function repairReceiptDetailHTML(record, index, totalRecords) {
  const ticket = record.raw
  const components = Array.isArray(ticket.components_noted) ? ticket.components_noted : []
  const hasPrev = index > 0
  const hasNext = index < totalRecords - 1
  const invoiceTotal = Number(ticket.final_total || ticket.estimated_quote || 0)
  const amountPaid = Number(ticket.amount_paid || 0)
  const balanceDue = Number(ticket.balance_due || 0)
  return `
    <div class="modal-backdrop" data-no-backdrop-close>
      <div class="modal modal-md" style="max-height:90vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div>
            <h2 style="margin:0">${record.invoiceNumber}</h2>
            <span class="badge warn" style="margin-top:6px">${record.label}</span>
          </div>
          <button class="icon-button" data-close style="font-size:20px;line-height:1">×</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;padding:12px;background:var(--surface-2);border-radius:10px;font-size:13px;margin-bottom:16px">
          <div><span class="muted">Date</span><br><strong>${new Date(record.createdAt).toLocaleString()}</strong></div>
          <div><span class="muted">Status</span><br><strong>${ticket.status || 'Pending'}</strong></div>
          <div><span class="muted">Customer</span><br><strong>${record.customerName}</strong></div>
          <div><span class="muted">Phone</span><br><strong>${record.customerPhone || '—'}</strong></div>
          <div><span class="muted">Ticket</span><br><strong>${record.ticketNumber || '—'}</strong></div>
          <div><span class="muted">Device</span><br><strong>${record.device || '—'}</strong></div>
          ${record.parentInvoiceNumber ? `<div><span class="muted">Parent Invoice</span><br><strong>${record.parentInvoiceNumber}</strong></div>` : ''}
          ${record.parentTicketNumber ? `<div><span class="muted">Parent Ticket</span><br><strong>${record.parentTicketNumber}</strong></div>` : ''}
          <div><span class="muted">Created By</span><br><strong>${record.employeeName || '—'}</strong></div>
          <div><span class="muted">Payment</span><br><strong>${record.paymentMethod}</strong></div>
        </div>

        <div style="margin-bottom:16px">
          <p style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Repair items</p>
          ${components.length ? `<div style="display:grid;gap:0;border:1px solid var(--border);border-radius:8px;overflow:hidden">
            ${components.map(component => `<div style="display:flex;justify-content:space-between;gap:8px;padding:10px 12px;border-top:1px solid var(--border);font-size:13px">
              <span><strong>${component.name || 'Component'}</strong>${component.tag || component.condition ? `<br><span class="muted">${component.tag || component.condition}</span>` : ''}</span>
              <strong>${money(component.price || 0)}</strong>
            </div>`).join('')}
          </div>` : `<p class="muted" style="font-size:13px">No component breakdown recorded.</p>`}
          ${Number(ticket.labour_cost || 0) > 0 ? `<div style="display:flex;justify-content:space-between;padding:10px 12px;font-size:13px"><span>Labour</span><strong>${money(ticket.labour_cost)}</strong></div>` : ''}
          ${ticket.technician_note ? `<p class="muted" style="font-size:13px;margin-top:8px">${ticket.technician_note}</p>` : ''}
        </div>

        <div style="border-top:1px solid var(--border);padding-top:12px;display:grid;gap:6px;font-size:13px">
          <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:700"><span>Invoice Total</span><span>${money(invoiceTotal)}</span></div>
          <div style="display:flex;justify-content:space-between;color:var(--success)"><span>Paid</span><span>${money(amountPaid)}</span></div>
          <div style="display:flex;justify-content:space-between"><span>Balance</span><span>${money(balanceDue)}</span></div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="display:flex;gap:8px">
            <button class="secondary-button" ${!hasPrev ? 'disabled' : ''} data-action="receipt-prev">← Prev</button>
            <button class="secondary-button" ${!hasNext ? 'disabled' : ''} data-action="receipt-next">Next →</button>
          </div>
          <div style="display:flex;gap:8px">
            <button class="secondary-button" data-close>Close</button>
            <button class="primary-button" data-action="print-repair-invoice" data-ticket-id="${ticket.id}">Print Invoice</button>
          </div>
        </div>
      </div>
    </div>`
}
