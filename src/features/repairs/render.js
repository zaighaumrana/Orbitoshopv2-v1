/* ═══════════════════════════════════════════════════════════════════
   features/repairs/render.js
   Pure, presentational rendering for repair tickets. Moved out of
   pos.js during the Repairs extraction (see architecture refactor).

   Everything here is a pure function: data in (params or read-only
   shared state), an HTML string out. No DOM reads, no mutation, no
   side effects. That's deliberately the bar for what's in this file --
   repairTicketFormHTML() and repairCollectionHTML() are NOT here yet
   because they read POS-local mutable state (posState.repairSearch,
   draft ticket state) and need a state-ownership decision first.
═══════════════════════════════════════════════════════════════════ */
import { state, CFG, money, currentTenant } from '../../shared.js'

/** Combines a ticket's own balance with any sub-invoices billed under it. */
export function combinedBalance(t) {
  const subs = (state.data.tickets||[]).filter(s => String(s.parent_ticket_id) === String(t.id))
  const subBalance = subs.reduce((s,x) => s + Number(x.balance_due||0), 0)
  return { subs, subBalance, parentBalance: Number(t.balance_due||0), total: Number(t.balance_due||0) + subBalance }
}

export function repairRowHTML(t) {
  const { subs, subBalance, parentBalance, total } = combinedBalance(t)
  const balanceLine = subs.length
    ? `Balance: ${money(parentBalance)} (original) + ${money(subBalance)} (${subs.length} additional) = ${money(total)} total`
    : `Balance: ${money(total)}`
  return `
    <div class="list-row" style="margin-bottom:6px">
      <div>
        <strong>${t.customer_name}</strong>
        <span class="badge warn" style="margin-left:6px">${t.status}</span><br>
        <small class="muted">${t.invoice_number || t.ticket_number} · ${t.device_brand} ${t.device_model}</small>
        ${total > 0 ? `<br><small class="muted">${balanceLine}</small>` : ''}
      </div>
      <div style="display:flex;gap:6px">
        ${!CFG.technician_module_enabled ? `
          <button class="secondary-button" style="font-size:12px;padding:6px 10px" data-action="pos-edit-ticket" data-ticket-id="${t.id}">
            Edit
          </button>` : ''}
        <button class="primary-button" style="font-size:12px;padding:6px 10px" data-collect-ticket="${t.id}">
          ${t.is_locked ? 'Collect' : 'Place Order'}
        </button>
      </div>
    </div>`
}

export function compTagPickerHTML(name) {
  return `<div class="modal-backdrop" data-no-backdrop-close>
    <div class="modal modal-xs">
      <h2>${name}</h2>
      <p class="muted" style="font-size:13px">What's the issue?</p>
      <div style="display:grid;gap:8px;margin-top:10px">
        <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-pick="Broken">Broken</button>
        <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-pick="Not Working">Not Working</button>
        <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-pick="Custom">Custom…</button>
        <div id="tag-custom-wrap" class="hidden" style="display:grid;gap:8px">
          <input id="tag-custom-text" class="search" placeholder="Describe the issue">
          <button type="button" class="primary-button" data-action="confirm-custom-tag">Add</button>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Cancel</button>
      </div>
    </div>
  </div>`
}

export function ticketSlipPreview(ticket) {
  if (!ticket) return ''
  const t = currentTenant()
  const comps = ticket.components_noted || []
  return `<div class="receipt-preview">
    <center>${t.logo?`<img src="${t.logo}" style="max-width:120px;max-height:44px;object-fit:contain;margin-bottom:6px"><br>`:''}
    <strong>${t.name}</strong><br>${t.address||''}<br>${t.phone||''}</center>
    <hr>
    <center><strong>REPAIR TICKET</strong><br>${ticket.invoice_number||ticket.ticket_number}<br><span style="font-size:11px;color:#888">Ticket: ${ticket.ticket_number}</span></center>
    <hr>
    Customer: ${ticket.customer_name}<br>
    Phone: ${ticket.customer_phone}<br>
    Device: ${ticket.device_brand} ${ticket.device_model}<br>
    ${ticket.imei ? `IMEI: <small>${ticket.imei}</small><br>` : ''}
    Date: ${new Date(ticket.created_at||Date.now()).toLocaleString()}
    <hr>
    <strong>Issues Noted:</strong><br>
    ${comps.length ? comps.map(c => {
      const label = c.tag === 'Custom' ? (c.customText || '') : (c.tag || '')
      return `· ${c.name}${label?` (${label})`:''}${Number(c.price)>0?` — ${money(c.price)}`:''}`
    }).join('<br>') : 'No components noted.'}
    <hr>
    ${ticket.technician_note ? `<strong>Technician Note:</strong><br>${ticket.technician_note}<hr>` : ''}
    ${Number(ticket.labour_cost)>0 ? `Labour Fee: <strong>${money(ticket.labour_cost)}</strong><br>` : ''}
    Estimated Quote: <strong>${money(ticket.estimated_quote)}</strong><br>
    ${Number(ticket.advance_payment)>0 ? `Advance Paid: <strong>${money(ticket.advance_payment)}</strong>${ticket.advance_method?` (${ticket.advance_method})`:''}<br>` : ''}
    <hr>
    <center>${t.receiptFooter||''}</center>
  </div>`
}
