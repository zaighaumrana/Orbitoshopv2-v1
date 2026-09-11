/* ═══════════════════════════════════════════════════════════════════
   features/admin/repairs/render.js
   Admin-exclusive repair ticket modals -- verified by actual caller
   (only admin.js's renderModal() renders any of these). The POS-side
   of Repairs already lives at features/pos/repairs/; the genuinely
   shared operations (getSubInvoices etc.) stay at features/repairs/.

   Each function takes `modal` (the current state.modal object) as a
   parameter rather than reading state.modal directly -- same pattern
   as repairCollectionHTML(searchQuery)/repairTicketFormHTML(formInfo)
   in features/pos/repairs/render.js. state.data.* reads (tickets,
   repairComponents) stay as direct imports since that's shared,
   read-only app data, not UI state tied to one modal invocation.
═══════════════════════════════════════════════════════════════════ */
import { state, money } from '../../../shared.js'

/** Admin's own "ticket created" confirmation -- shown after creating a
 *  repair ticket from... [context: currently unreachable in the admin
 *  UI since admin's own ticket-creation flow was removed earlier in
 *  this project's history, but the modal type is kept in case it's
 *  ever wired up again, e.g. from a rebuilt admin-side creation flow]. */
export function ticketCreatedModalHTML(modal) {
  return `<div class="modal-backdrop" data-no-backdrop-close>
    <div class="modal">
      <h2>Repair Ticket Created</h2>
      <div style="text-align:center;padding:12px 0">
        <div style="font-size:15px;font-weight:700">${modal.ticket.invoice_number || modal.ticket.ticket_number}</div>
        <div class="muted" style="font-size:12px">Ticket: ${modal.ticket.ticket_number}</div>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-close>Close</button>
        <button class="primary-button" data-action="print-ticket-slip">Print Receipt</button>
      </div>
    </div></div>`
}

export function ticketDetailModalHTML(id, modal) {
  if (modal.summaryStatus === 'loading') return `<div class="modal-backdrop"><div class="modal modal-md" aria-busy="true">
    <h2>Repair summary</h2>
    <p class="muted">Loading current repair-family details…</p>
    <div class="summary-skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="modal-actions"><button class="secondary-button" data-close>Close</button></div>
  </div></div>`
  if (modal.summaryStatus === 'error' || !modal.summary) return `<div class="modal-backdrop"><div class="modal modal-sm">
    <h2>Repair summary unavailable</h2>
    <p class="muted">${modal.summaryError || 'Current repair details could not be loaded.'}</p>
    <div class="modal-actions"><button class="secondary-button" data-close>Close</button><button class="primary-button" data-action="retry-ticket-detail" data-ticket-id="${id}">Retry</button></div>
  </div></div>`

  const summary = modal.summary
  const root = summary.root || {}
  const rootId = root.id || id
  const original = (summary.invoices || []).find(invoice => !invoice.parentTicketId) || summary.invoices?.[0] || {}
  const children = (summary.invoices || []).filter(invoice => invoice.parentTicketId)
  const components = original.components || []
  const cachedRoot = (state.data.tickets || []).find(ticket => String(ticket.id) === String(rootId))
  const status = root.status || 'Pending'
  const sc = {'Pending':'warn','In Progress':'warn','Ready':'good','Delivered':'good','Cancelled':'bad','Declined':'bad'}
  const terminal = ['Delivered','Cancelled'].includes(status)
  const deliveredBy = root.deliveredByDisplayName || root.deliveredBy || ''
  const stateMessage = status === 'Delivered'
    ? `<div class="terminal-state good"><strong>Delivery completed</strong><span>${root.deliveredAt ? new Date(root.deliveredAt).toLocaleString() : 'Delivered'}${deliveredBy ? ` · ${deliveredBy}` : ''}</span></div>`
    : status === 'Cancelled'
      ? `<div class="terminal-state bad"><strong>Repair cancelled</strong><span>${root.cancelledAt ? new Date(root.cancelledAt).toLocaleString() : ''}${root.cancellationReason ? `${root.cancelledAt ? ' · ' : ''}${root.cancellationReason}` : ''}</span></div>`
      : status === 'Ready'
        ? `<div class="terminal-state good"><strong>Ready for collection</strong><span>Payment and delivery can be completed from POS.</span></div>`
        : `<p class="muted" style="font-size:12px">${status === 'In Progress' ? 'Repair work is in progress.' : 'Repair is waiting to be started.'}</p>`

  return `<div class="modal-backdrop"><div class="modal modal-md">
    <h2>${root.ticketNumber || original.ticketNumber || 'Repair'} <span class="badge ${sc[status]||'warn'}" style="margin-left:8px">${status}</span></h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:14px;margin-bottom:14px;padding:12px;background:var(--surface-2);border-radius:8px">
      <div><span class="muted">Customer</span><br><strong>${root.customerName || '—'}</strong></div>
      <div><span class="muted">Phone</span><br><strong>${root.customerPhone||'—'}</strong></div>
      <div><span class="muted">Device</span><br><strong>${root.deviceBrand || ''} ${root.deviceModel || ''}</strong></div>
      <div><span class="muted">IMEI</span><br><strong>${root.imei||'—'}</strong></div>
      <div><span class="muted">Original invoice</span><br><strong>${money(original.amount||0)}</strong></div>
      <div><span class="muted">Net paid</span><br><strong>${money(summary.netPayments||0)}</strong></div>
    </div>
    ${original.note ? `<div style="background:color-mix(in srgb,var(--warning) 10%,var(--surface));border-left:3px solid var(--warning);padding:10px 14px;border-radius:0 8px 8px 0;margin-bottom:12px;font-size:14px"><strong>Note:</strong> ${original.note}</div>` : ''}
    ${components.length ? `
      <div style="display:grid;gap:6px;margin-bottom:12px">
        ${components.map((c,i) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface-2);border-radius:8px;font-size:14px;${c.removed?'opacity:.55':''}">
            <span>
              <strong style="${c.removed?'text-decoration:line-through':''}">${c.name}</strong>
              <span class="badge warn" style="font-size:11px">${c.tag||c.condition||''}</span>
              ${c.removed ? `<br><span class="muted" style="font-size:11px">Not needed: ${c.removedReason||''}</span>` : ''}
            </span>
            <span style="display:flex;align-items:center;gap:8px">
              <span>${c.price>0 ? money(c.price) : '<span class="muted">Not priced</span>'}</span>
              ${!c.removed && !terminal ? `<button type="button" class="secondary-button" style="font-size:11px;padding:4px 8px" data-mark-not-needed="${i}">Not Needed</button>` : ''}
            </span>
          </div>`).join('')}
      </div>` : ''}
    ${children.length ? `
      <div style="margin-bottom:12px">
        <strong style="font-size:13px">Sub-Invoices</strong>
        <div style="display:grid;gap:6px;margin-top:6px">
          ${children.map(s => `
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:8px 10px;background:var(--surface-2);border-radius:6px">
              <span>${s.invoiceNumber || s.ticketNumber}</span><span>${money(s.amount)}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}
    <div style="display:grid;gap:6px;margin-bottom:12px;padding:12px;background:var(--surface-2);border-radius:8px">
      <div style="display:flex;justify-content:space-between"><span>Total billed</span><strong>${money(summary.effectiveObligation)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Payments received</span><strong>${money(summary.paymentsReceived)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Refunds</span><strong>${money(summary.refundsPaid)}</strong></div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:6px"><span>Outstanding</span><strong>${money(summary.outstanding)}</strong></div>
      ${summary.udharApproved ? `<div style="display:flex;justify-content:space-between"><span>Udhar approved</span><strong>${money(summary.udharOutstanding)}</strong></div>` : ''}
    </div>
    ${(summary.proposals||[]).length ? `<div style="margin-bottom:12px"><strong style="font-size:13px">Additional-work decisions</strong>
        <div style="display:grid;gap:6px;margin-top:6px">${summary.proposals.map(p => `<div style="padding:8px 10px;background:var(--surface-2);border-radius:6px;font-size:12px"><strong>${p.description}</strong> · ${money(p.quotedAmount)} <span class="badge ${p.decision==='Approved'?'good':p.decision==='Declined'?'bad':'warn'}">${p.decision}</span>${p.decisionMethod?`<br><span class="muted">${p.decisionMethod}${p.decisionNote?' · '+p.decisionNote:''}</span>`:''}${p.decision==='Pending'?`<div style="display:flex;gap:6px;margin-top:6px"><button class="secondary-button" data-action="decide-additional-work" data-proposal-id="${p.id}" data-decision="Approved">Approve</button><button class="secondary-button" data-action="decide-additional-work" data-proposal-id="${p.id}" data-decision="Declined">Decline</button></div>`:''}</div>`).join('')}</div>
      </div>` : ''}
    ${stateMessage}
    ${!terminal ? `<div style="border-top:1px solid var(--border);padding-top:12px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <select id="td-status" style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:var(--text);flex:1">
          ${['Pending','In Progress','Ready','Declined'].map(s =>
            `<option ${s===status?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <textarea id="td-note" placeholder="Add a note…"
        style="width:100%;margin-top:8px;min-height:60px;border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:var(--text);box-sizing:border-box">${cachedRoot?.update_note || ''}</textarea>
    </div>` : ''}
    <div class="modal-actions">
      <button class="secondary-button" data-close>Close</button>
      <button class="secondary-button" data-action="print-repair-summary" data-ticket-id="${rootId}">Print Summary</button>
      ${!terminal ? `<button class="secondary-button" data-action="open-create-sub-invoice" data-ticket-id="${rootId}">+ Additional Work</button><button class="secondary-button" data-action="open-repair-adjustment" data-ticket-id="${rootId}">Adjustment</button><button class="secondary-button" style="color:var(--danger)" data-action="open-repair-cancellation" data-ticket-id="${rootId}">Cancel Repair</button><button class="primary-button" data-action="save-ticket-detail" data-id="${rootId}">Save Update</button>` : ''}
    </div>
  </div></div>`
}

export function markNotNeededModalHTML(modal) {
  const tk = (state.data.tickets||[]).find(t => String(t.id) === String(modal.ticketId))
  const c  = tk?.components_noted?.[modal.index]
  if (!tk || !c) return ''
  return `<div class="modal-backdrop" data-no-backdrop-close>
    <div class="modal modal-xs">
      <h2>Mark "${c.name}" Not Needed</h2>
      <p class="muted" style="font-size:13px">E.g. "Only needed cleaning, no repair required." This stays visible on the ticket, it's not deleted.</p>
      <label class="field"><span>Reason</span><textarea id="not-needed-reason" style="min-height:56px"></textarea></label>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Cancel</button>
        <button type="button" class="primary-button" data-action="confirm-not-needed">Confirm (PIN required)</button>
      </div>
    </div>
  </div>`
}

export function createSubInvoiceModalHTML(modal) {
  const parentId = modal.parentId
  const tk = (state.data.tickets||[]).find(t => String(t.id) === String(parentId))
  if (!tk) return ''
  const draft      = modal.draftComponents || []
  const labour     = modal.draftLabour ?? 0
  const compDefs   = state.data.repairComponents || []
  const partsTotal = draft.reduce((s,c) => s + Number(c.price||0), 0)
  const total      = partsTotal + labour

  return `
    <div class="modal-backdrop" data-no-backdrop-close>
      <div class="modal modal-md" style="max-height:90vh;overflow-y:auto">
        <h2 style="margin-bottom:4px">Record Additional Work</h2>
        <p class="muted" style="font-size:13px;margin-bottom:16px">
          Linked to ${tk.invoice_number} — ${tk.customer_name}, ${tk.device_brand} ${tk.device_model}
        </p>

        <div style="display:grid;gap:8px;margin-bottom:14px">
          <strong style="font-size:13px">Additional Components</strong>
          ${draft.length ? draft.map((c,i) => `
            <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center">
              <div>
                <span style="font-size:13px"><strong>${c.name}</strong></span>
                <span class="badge warn" style="font-size:11px;margin-left:6px">${c.tag || ''}</span>
                ${c.customText ? `<span class="muted" style="font-size:12px"> — ${c.customText}</span>` : ''}
              </div>
              <input type="number" step="any" min="0" value="${c.price || ''}" placeholder="Price"
                data-subinv-comp-price="${i}"
                style="width:110px;border:1px solid var(--border);border-radius:6px;
                       padding:6px 8px;background:var(--surface);color:var(--text);font-size:13px">
              <button type="button" data-subinv-comp-remove="${i}"
                style="color:var(--danger);background:none;border:none;font-size:18px;cursor:pointer;padding:0 4px">×</button>
            </div>`).join('') : `<p class="muted" style="font-size:13px">No components added yet.</p>`}
        </div>

        <div style="margin-bottom:12px">
          <p class="muted" style="font-size:12px;margin-bottom:6px">Add component:</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
            ${compDefs.map(c => `<button type="button" class="secondary-button" style="font-size:12px;padding:5px 12px"
              data-add-draft-comp-name="${c.name}">${c.name}</button>`).join('')}
          </div>
          <div style="display:flex;gap:8px">
            <input id="custom-comp-name" class="search" placeholder="Custom component name" style="flex:1">
            <button type="button" class="secondary-button" data-action="add-custom-draft-comp">+ Add</button>
          </div>
        </div>

        <label style="display:flex;justify-content:space-between;align-items:center;padding:10px;
                      background:var(--surface-2);border-radius:8px;margin-bottom:8px;gap:12px">
          <span style="font-size:13px;font-weight:500">Labour Charge</span>
          <input type="number" step="any" min="0" value="${labour || ''}" placeholder="0" data-subinv-labour
            style="width:120px;border:1px solid var(--border);border-radius:6px;
                   padding:6px 8px;background:var(--surface);color:var(--text);font-size:13px">
        </label>

        <label class="field" style="margin-bottom:12px">
          <span>Note</span>
          <textarea id="sub-invoice-note" style="min-height:56px" placeholder="What was found / done…"></textarea>
        </label>

        <div class="form-grid" style="margin-bottom:12px">
          <label class="field"><span>Customer decision</span><select id="additional-work-decision"><option>Approved</option><option>Pending</option><option>Declined</option></select></label>
          <label class="field"><span>Decision method</span><select id="additional-work-method">${['Phone','In person','WhatsApp','Other'].map(x=>`<option>${x}</option>`).join('')}</select></label>
        </div>

        <div style="display:flex;justify-content:space-between;font-weight:600;padding:10px;
                    background:var(--surface-2);border-radius:8px;margin-bottom:16px;font-size:15px">
          <span>Sub-Invoice Total</span><span id="subinv-draft-total">${money(total)}</span>
        </div>

        <div class="modal-actions">
          <button type="button" class="secondary-button" data-close>Cancel</button>
          <button type="button" class="primary-button" data-action="submit-sub-invoice" data-parent-id="${parentId}">
            Save Decision
          </button>
        </div>
      </div>
    </div>`
}

export function repairAdjustmentModalHTML(modal) {
  return `<div class="modal-backdrop" data-no-backdrop-close><div class="modal modal-sm">
    <h2>Repair Price Adjustment</h2>
    <p class="muted">Original invoices stay unchanged. This records a permanent downward adjustment.</p>
    <label class="field"><span>Reduction amount</span><input id="repair-adjustment-amount" type="number" min="0" step="any"></label>
    <label class="field"><span>Type</span><select id="repair-adjustment-type"><option value="discount">Discount</option><option value="price_correction">Price correction</option><option value="goodwill">Goodwill</option><option value="cancelled_work">Cancelled work</option><option value="other">Other</option></select></label>
    <label class="field"><span>Reason</span><textarea id="repair-adjustment-reason"></textarea></label>
    <div class="modal-actions"><button class="secondary-button" data-close>Close</button><button class="primary-button" data-action="submit-repair-adjustment" data-ticket-id="${modal.rootId}">Apply (PIN required)</button></div>
  </div></div>`
}

export function repairCancellationModalHTML(modal) {
  const s = modal.summary || {}
  const paidAvailable = Math.max(0, Number(s.netPayments || 0))
  return `<div class="modal-backdrop" data-no-backdrop-close><div class="modal modal-sm">
    <h2>Cancel Repair</h2>
    <div style="display:grid;gap:6px;padding:12px;background:var(--surface-2);border-radius:8px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between"><span>Current billed</span><strong>${money(s.effectiveObligation)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Net paid</span><strong>${money(s.netPayments)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Current balance</span><strong>${money(s.outstanding)}</strong></div>
    </div>
    <label class="field"><span>Refund amount (0 allowed)</span><input id="repair-cancel-refund" data-repair-cancel-refund type="number" min="0" max="${paidAvailable}" step="any" value="0"></label>
    <label class="field"><span>Refund method</span><select id="repair-cancel-method">${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer'].map(x=>`<option>${x}</option>`).join('')}</select></label>
    <label class="field"><span>Reason</span><textarea id="repair-cancel-reason"></textarea></label>
    <div style="padding:10px;background:var(--surface-2);border-radius:8px;margin-top:10px">
      <div style="display:flex;justify-content:space-between"><span>Customer receives</span><strong id="repair-cancel-customer">${money(0)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Shop retains</span><strong id="repair-cancel-retains">${money(paidAvailable)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Final obligation</span><strong id="repair-cancel-obligation">${money(paidAvailable)}</strong></div>
    </div>
    <div class="modal-actions"><button class="secondary-button" data-close>Close</button><button class="primary-button" style="background:var(--danger)" data-action="submit-repair-cancellation" data-ticket-id="${modal.rootId}">Cancel (PIN required)</button></div>
  </div></div>`
}

export function addCompTagModalHTML(modal) {
  const { compName } = modal
  return `
    <div class="modal-backdrop" data-no-backdrop-close>
      <div class="modal modal-xs">
        <h2>${compName}</h2>
        <p class="muted" style="font-size:13px">What's the issue?</p>
        <div style="display:grid;gap:8px;margin-top:10px">
          <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-select="Broken">Broken</button>
          <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-select="Not Working">Not Working</button>
          <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-select="Custom">Custom…</button>
          <div id="custom-tag-wrap" class="hidden" style="display:grid;gap:8px">
            <input id="custom-tag-text" class="search" placeholder="Describe the issue">
            <button type="button" class="primary-button" data-action="confirm-draft-custom-tag">Add</button>
          </div>
        </div>
        <div class="modal-actions"><button class="secondary-button" data-close>Cancel</button></div>
      </div>
    </div>`
}
