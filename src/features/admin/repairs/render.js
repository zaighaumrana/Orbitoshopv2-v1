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
  const tk = (state.data.tickets||[]).find(t => String(t.id) === String(id))
  if (!tk) return `<div class="modal-backdrop"><div class="modal"><p class="muted">Not found.</p><div class="modal-actions"><button class="secondary-button" data-close>Close</button></div></div></div>`
  const sc = {'Pending':'warn','In Progress':'warn','Ready':'good','Delivered':'good','Declined':'bad'}
  return `<div class="modal-backdrop"><div class="modal modal-md">
    <h2>${tk.ticket_number} <span class="badge ${sc[tk.status]||'warn'}" style="margin-left:8px">${tk.status}</span></h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:14px;margin-bottom:14px;padding:12px;background:var(--surface-2);border-radius:8px">
      <div><span class="muted">Customer</span><br><strong>${tk.customer_name}</strong></div>
      <div><span class="muted">Phone</span><br><strong>${tk.customer_phone||'—'}</strong></div>
      <div><span class="muted">Device</span><br><strong>${tk.device_brand} ${tk.device_model}</strong></div>
      <div><span class="muted">IMEI</span><br><strong>${tk.imei||'—'}</strong></div>
      <div><span class="muted">Quote</span><br><strong>${money(tk.estimated_quote||0)}</strong></div>
      <div><span class="muted">Advance</span><br><strong>${money(tk.advance_payment||0)}${tk.advance_method?' ('+tk.advance_method+')':''}</strong></div>
    </div>
    ${tk.technician_note ? `<div style="background:color-mix(in srgb,var(--warning) 10%,var(--surface));border-left:3px solid var(--warning);padding:10px 14px;border-radius:0 8px 8px 0;margin-bottom:12px;font-size:14px"><strong>Note:</strong> ${tk.technician_note}</div>` : ''}
    ${(tk.components_noted||[]).length ? `
      <div style="display:grid;gap:6px;margin-bottom:12px">
        ${tk.components_noted.map((c,i) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface-2);border-radius:8px;font-size:14px;${c.removed?'opacity:.55':''}">
            <span>
              <strong style="${c.removed?'text-decoration:line-through':''}">${c.name}</strong>
              <span class="badge warn" style="font-size:11px">${c.tag||c.condition||''}</span>
              ${c.removed ? `<br><span class="muted" style="font-size:11px">Not needed: ${c.removedReason||''}</span>` : ''}
            </span>
            <span style="display:flex;align-items:center;gap:8px">
              <span>${c.price>0 ? money(c.price) : '<span class="muted">Not priced</span>'}</span>
              ${!c.removed ? `<button type="button" class="secondary-button" style="font-size:11px;padding:4px 8px" data-mark-not-needed="${i}">Not Needed</button>` : ''}
            </span>
          </div>`).join('')}
      </div>` : ''}
    ${(modal.subInvoices||[]).length ? `
      <div style="margin-bottom:12px">
        <strong style="font-size:13px">Sub-Invoices</strong>
        <div style="display:grid;gap:6px;margin-top:6px">
          ${modal.subInvoices.map(s => `
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:8px 10px;background:var(--surface-2);border-radius:6px">
              <span>${s.invoice_number}</span><span>${money(s.estimated_quote)} · Bal: ${money(s.balance_due)}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}
    <div style="border-top:1px solid var(--border);padding-top:12px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <select id="td-status" style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:var(--text);flex:1">
          ${['Pending','In Progress','Ready','Declined'].map(s =>
            `<option ${s===tk.status?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <textarea id="td-note" placeholder="Add a note…"
        style="width:100%;margin-top:8px;min-height:60px;border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:var(--text);box-sizing:border-box">${tk.update_note||''}</textarea>
    </div>
    <div class="modal-actions">
      <button class="secondary-button" data-close>Close</button>
      <button class="secondary-button" data-action="open-create-sub-invoice" data-ticket-id="${tk.id}">+ Create Sub-Invoice</button>
      <button class="primary-button" data-action="save-ticket-detail" data-id="${tk.id}">Save Update</button>
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
        <h2 style="margin-bottom:4px">Create Sub-Invoice</h2>
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

        <div style="display:flex;justify-content:space-between;font-weight:600;padding:10px;
                    background:var(--surface-2);border-radius:8px;margin-bottom:16px;font-size:15px">
          <span>Sub-Invoice Total</span><span id="subinv-draft-total">${money(total)}</span>
        </div>

        <div class="modal-actions">
          <button type="button" class="secondary-button" data-close>Cancel</button>
          <button type="button" class="primary-button" data-action="submit-sub-invoice" data-parent-id="${parentId}">
            Create & Print
          </button>
        </div>
      </div>
    </div>`
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
