import {iconHTML,brandChoices,brandIcon} from '../../../catalog/icons.js'
import {withPrintAttribution} from '../../../print/presentation.js'
import { escapeHTML, safeImageURL } from '../../../html.js'
/* ═══════════════════════════════════════════════════════════════════
   features/pos/repairs/render.js
   Pure, presentational rendering for repair tickets -- POS-exclusive,
   verified by actual caller (only pos.js calls any of these).

   Everything here is a pure function: data in (params or read-only
   shared state), an HTML string out. No DOM reads, no mutation, no
   side effects. repairTicketFormHTML() and repairCollectionHTML() take
   formInfo/searchQuery as parameters rather than reading state.modal._info
   or posState.repairSearch directly -- both of those are POS-view-local
   UI state (confirmed by checking adminState/wsState have no equivalent),
   so pos.js passes them in at the call site instead of render.js
   reaching back into a view file, preserving the one-way
   views -> features -> shared dependency direction.
═══════════════════════════════════════════════════════════════════ */
import { state, CFG, money, moneyHTML, currentTenant } from '../../../shared.js'
import { getDraft, calcDraftTotal, calcDraftPaid } from './state.js'
import { findRepairFamilies, matchedRepairChild } from '../../repairs/family.js'
import {pageControls} from '../../../bounded-read.js'

/** Combines a ticket's own balance with any sub-invoices billed under it. */
export function combinedBalance(t) {
  const subs = (state.data.tickets||[]).filter(s => String(s.parent_ticket_id) === String(t.id))
  const subBalance = subs.reduce((s,x) => s + Number(x.balance_due||0), 0)
  return { subs, subBalance, parentBalance: Number(t.balance_due||0), total: Number(t.balance_due||0) + subBalance }
}

export function repairRowHTML(t, family = null) {
  const { subs, subBalance, parentBalance, total } = combinedBalance(t)
  const matchedChild = family ? matchedRepairChild(family) : null
  const balanceLine = subs.length
    ? `Balance: ${money(parentBalance)} (original) + ${money(subBalance)} (${subs.length} additional) = ${money(total)} total`
    : `Balance: ${money(total)}`
  return `
    <div class="list-row" style="margin-bottom:6px">
      <div>
        ${iconHTML(brandIcon(t.device_brand),'brand')}<strong>${escapeHTML(t.customer_name)}</strong>
        <span class="badge warn" style="margin-left:6px">${escapeHTML(t.status)}</span><br>
        <small class="muted">${escapeHTML(t.invoice_number || t.ticket_number)} · ${escapeHTML(t.device_brand)} ${escapeHTML(t.device_model)}</small>
        ${matchedChild ? `<br><small style="color:var(--primary)">Matched additional invoice: ${escapeHTML(matchedChild.invoice_number || matchedChild.ticket_number)}</small>` : ''}
        ${total > 0 ? `<br><small class="muted">${escapeHTML(balanceLine)}</small>` : ''}
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

export function repairCollectionHTML(searchQuery = '',page=null) {
  const pending = findRepairFamilies(state.data.tickets || [], searchQuery)
    .filter(family => combinedBalance(family.root).total > 0 || !family.root.is_locked)
    .sort((a,b) => new Date(b.root.created_at) - new Date(a.root.created_at))

  return `<div class="modal-backdrop">
    <div class="modal modal-md" style="max-height:85vh;overflow-y:auto">
      <h2>Repair Collection</h2>
      <input class="search" placeholder="Search name, phone, device, IMEI, ticket #…"
        data-repair-search value="${escapeHTML(searchQuery)}"
        style="width:100%;margin:10px 0;font-size:14px">
      ${page?.mode==='exact-identifiers'?'<p class="muted">Enter an exact ticket or invoice number to search beyond this page.</p>':''}
      <p class="muted" style="font-size:12px;margin-bottom:10px">${pending.length} pending ticket${pending.length!==1?'s':''}${page?' on this page; pagination counts all matching families':''}</p>
      ${pageControls(page,'data-collection-page')}
      ${pending.length ? `<div style="display:grid;gap:8px">${pending.map(family => repairRowHTML(family.root, family)).join('')}</div>` :
        `<div class="empty">No pending tickets match.</div>`}
      <div class="modal-actions">
        <button class="secondary-button" data-close>Close</button>
      </div>
    </div>
  </div>`
}

export function repairTicketFormHTML(formInfo = {}, { isEditing = false } = {}) {
  const comps    = state.data.repairComponents || []
  const draft    = getDraft()
  // Draft fields round-trip through HTML on edit and component/payment changes.
  const dInfo = Object.fromEntries(Object.entries(formInfo || {}).map(([key, value]) => [
    key, escapeHTML(value),
  ]))
  const total    = calcDraftTotal(draft)
  const paid     = calcDraftPaid(draft)
  const balance  = Math.max(0, total - paid)
  const hasItemized = draft.components.length > 0 || Number(draft.labour||0) > 0

  return `<div class="modal-backdrop">
    <form class="modal rs-repair-workspace-dialog" data-form="repair">
      <header class="rs-repair-header"><h2>${isEditing ? 'Modify Repair Ticket' : 'New Repair Ticket'}</h2>
      ${isEditing ? `<p class="muted" style="font-size:13px">Changes update this cart draft only. The repair is not finalized until Place Order.</p>` : ''}</header>
      <div class="rs-repair-workspace">
          <section class="rs-repair-panel" aria-label="Customer and device"><h3>Customer and device</h3>
      <div class="form-grid">
        <label class="field"><span>Customer Name *</span>
          <input name="customerName" required value="${dInfo.customerName||''}"></label>
        <label class="field"><span>Customer Phone *</span>
          <input name="customerPhone" type="tel" inputmode="numeric" pattern="[0-9]*"
            data-numeric="digits" data-numeric-message="Numbers only" autocomplete="tel"
            required value="${dInfo.customerPhone||''}"></label>
        <div class="rs-repair-brand-row">
        <label class="field"><span>Device Brand *</span>
          <input name="deviceBrand" list="rs-device-brands" autocomplete="off" required value="${dInfo.deviceBrand||''}" aria-describedby="rs-brand-help"></label>
        <datalist id="rs-device-brands">${brandChoices(state.data.deviceBrands??null).flatMap(b=>[b.display_name,...(b.aliases||[])]).map(name=>`<option value="${escapeHTML(name)}"></option>`).join('')}</datalist>
        <p id="rs-brand-help" class="muted">${state.data.brandChoicesUnavailable?'Brand choices unavailable. Type the brand manually; retry choices by reopening the form.':'Search a brand or type your own. Custom text is retained.'}</p>
        </div>
        <label class="field"><span>Device Model *</span>
          <input name="deviceModel" required value="${dInfo.deviceModel||''}"></label>
        <label class="field" style="grid-column:1/-1"><span>IMEI / Serial <small class="muted">(letters and numbers allowed)</small></span>
          <input name="imei" value="${dInfo.imei||''}"></label>
      </div>

      <label class="field"><span>Technician / Intake Note</span>
        <textarea name="technicianNote" style="min-height:56px">${dInfo.technicianNote||''}</textarea></label>

          </section>
          <section class="rs-repair-panel" aria-label="Issues and components"><h3>Issues and components</h3>
      <p class="muted" style="font-size:13px;margin:12px 0 6px">Tap to flag an issue:</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        ${comps.map(c => `
          <button type="button" class="secondary-button" style="font-size:13px;padding:6px 14px"
            data-pick-comp="${escapeHTML(c.name)}">${iconHTML(c.icon_id,'repair')}${escapeHTML(c.name)}</button>`).join('')}
      </div>

      <div class="rs-compound" style="margin-bottom:12px;align-items:end">
        <label class="field" style="flex:1"><span>Custom component name</span>
          <input id="intake-custom-comp-name" class="search" placeholder="Custom component name">
        </label>
        <button type="button" class="secondary-button" data-action="add-intake-custom-comp">+ Add</button>
      </div>

      ${draft.components.length ? `
        <div style="display:grid;gap:8px;margin-bottom:12px">
          ${draft.components.map((c,i) => `
            <div class="rs-component-row" style="
                        padding:8px;background:var(--surface-2);border-radius:8px">
              <div>
                <strong style="font-size:13px">${escapeHTML(c.name)}</strong><br>
                <span class="muted" style="font-size:12px">
                  ${escapeHTML(c.tag === 'Custom' ? (c.customText || '—') : c.tag)}
                </span>
              </div>
              <input type="number" step="any" min="0" placeholder="Price (optional)"
                value="${c.price||''}" data-draft-comp-price="${i}"
                style="width:110px;border:1px solid var(--border);border-radius:6px;padding:6px 8px;background:var(--surface);color:var(--text);font-size:13px">
              <button type="button" data-draft-comp-remove="${i}"
                style="color:var(--danger);background:none;border:none;font-size:18px;cursor:pointer">×</button>
            </div>`).join('')}
        </div>` : ''}

          </section>
        <section class="rs-repair-finance" aria-label="Quote, payments and balance">
          <div class="rs-repair-finance-part"><h3>Labour and quote</h3>
      <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface-2);
                  border-radius:8px;margin-bottom:12px">
        <label style="flex:1;font-size:13px;font-weight:500">Labour Charge</label>
        <input type="number" step="any" min="0" value="${draft.labour||''}" placeholder="0" data-draft-labour
          style="width:120px;border:1px solid var(--border);border-radius:6px;padding:6px 8px;background:var(--surface);color:var(--text)">
      </div>

      ${draft.overridePrice !== null ? `
        <div style="padding:10px;background:var(--surface-2);border-radius:8px;margin-bottom:12px">
          <label style="font-size:13px;font-weight:500;display:block;margin-bottom:6px">Manual Quote Override</label>
          <input type="number" step="any" min="0" value="${draft.overridePrice}" data-draft-override
            style="width:100%;border:1px solid var(--border);border-radius:6px;padding:8px 10px;
                   background:var(--surface);color:var(--text);font-size:16px;font-weight:600">
          <button type="button" data-action="draft-clear-override" style="font-size:12px;margin-top:6px;
            background:none;border:none;color:var(--primary);cursor:pointer">Switch back to itemized</button>
        </div>` : `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:10px;background:var(--surface-2);border-radius:8px;margin-bottom:12px">
          <span style="font-size:14px;font-weight:600">Quote Total: ${moneyHTML(total)}</span>
          <button type="button" data-action="draft-set-override" title="Enter one price manually"
            style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 8px;
                   font-size:16px;cursor:pointer">✏️</button>
        </div>`}

          </div>
          <div class="rs-repair-finance-part"><h3>Balance</h3>
      <div style="display:grid;gap:8px;padding:12px;background:var(--surface-2);border-radius:8px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:14px">
          <span>Quote Total</span><strong data-draft-total>${moneyHTML(total)}</strong>
        </div>
        ${draft.payments.map((p,i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:14px;color:var(--success)">
          <span style="display:flex;align-items:center;gap:6px">
            <button type="button" data-draft-payment-remove="${i}" aria-label="Remove advance payment" title="Remove advance"
              style="color:var(--danger);background:none;border:none;font-size:18px;line-height:1;cursor:pointer;padding:0 2px">×</button>
            Advance (${escapeHTML(p.method)})
          </span>
          <strong>− ${moneyHTML(p.amount)}</strong>
        </div>`).join('')}
        ${draft.payments.length ? `
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;border-top:1px solid var(--border);padding-top:6px">
          <span>Remaining Balance</span><span data-draft-balance>${moneyHTML(balance)}</span>
        </div>` : `
        <p class="muted" style="font-size:13px;margin:0">Any advance payment is asked for in the next step.</p>`}
      </div>

          </div>
        </section>
      </div>
      <div class="modal-actions rs-repair-actions">
        <button type="button" class="secondary-button" data-close>Cancel</button>
        <button class="primary-button">Continue to Cart</button>
      </div>
    </form>
  </div>`
}

export function compTagPickerHTML(name) {
  return `<div class="modal-backdrop" data-no-backdrop-close>
    <div class="modal rs-comp-tag-picker">
      <h2>${escapeHTML(name)}</h2>
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

export function advancePromptHTML(modal = {}) {
  const draft        = getDraft()
  const total        = calcDraftTotal(draft)
  const existing     = draft.payments || []
  const existingPaid = calcDraftPaid(draft)
  const hasExisting  = existing.length > 0
  const step         = modal.step || 'ask'
  const method       = modal.method || 'Cash'
  const amount       = Math.max(0, Number(modal.amount) || 0)
  const remaining    = Math.max(0, total - amount)
  const tooHigh      = amount > total + 0.001
  const methods      = ['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer']
  const row = (label, value, style = '') =>
    `<div style="display:flex;justify-content:space-between;align-items:center;font-size:14px;${style}"><span>${label}</span>${value}</div>`
  const box = rows =>
    `<div style="display:grid;gap:8px;padding:12px;background:var(--surface-2);border-radius:8px;margin:12px 0">${rows.join('')}</div>`
  const strong = v => `<strong>${v}</strong>`
  const totalRow = row('Quote Total', strong(moneyHTML(total)))
  const existingList = existing.map(p => `${moneyHTML(p.amount)} · ${escapeHTML(p.method)}`).join(' + ')
  let body = ''

  if (step === 'ask' && !hasExisting) {
    body = `<h2>Advance Payment</h2>
      <p class="muted" style="font-size:14px">Did the customer pay an advance for this repair?</p>
      ${box([totalRow, row('Balance Due', strong(moneyHTML(total)), 'font-weight:700;border-top:1px solid var(--border);padding-top:6px')])}
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-action="advance-no">No</button>
        <button type="button" class="primary-button" data-action="advance-yes">Yes</button>
      </div>`
  } else if (step === 'ask') {
    body = `<h2>Replace Current Advance?</h2>
      <p class="muted" style="font-size:14px">This ticket already has an advance recorded. Do you want to replace it?</p>
      ${box([
        totalRow,
        row('Current Advance', strong(moneyHTML(existingPaid)), 'color:var(--success)'),
        row('Balance Due', strong(moneyHTML(Math.max(0, total - existingPaid))), 'font-weight:700;border-top:1px solid var(--border);padding-top:6px'),
      ])}
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-action="advance-no">No, Keep It</button>
        <button type="button" class="primary-button" data-action="advance-yes">Yes, Replace It</button>
      </div>`
  } else if (step === 'amount') {
    body = `<h2>${hasExisting ? 'Replace Advance' : 'Advance Received'}</h2>
      ${hasExisting ? `
      <div style="padding:10px 12px;border:1px dashed var(--border);border-radius:8px;margin-top:8px">
        <div class="muted" style="font-size:13px">Current advance (will be replaced)</div>
        <div><strong>${moneyHTML(existingPaid)}</strong> <span class="muted" style="font-size:13px">${existingList}</span></div>
      </div>` : ''}
      <div style="display:grid;gap:10px;margin-top:12px">
        <label class="field"><span>${hasExisting ? 'New advance amount' : 'Advance amount'}</span>
          <input id="advance-amount" class="search" type="number" step="any" min="0" inputmode="decimal" autofocus
            placeholder="0" data-advance-amount value="${modal.amount === '' || modal.amount == null ? '' : escapeHTML(String(modal.amount))}"></label>
        <label class="field"><span>Payment method</span>
          <select class="tenant-switcher" data-advance-method>
            ${methods.map(m => `<option ${m === method ? 'selected' : ''}>${m}</option>`).join('')}
          </select></label>
      </div>
      ${box([
        totalRow,
        row('Paid So Far', `<strong data-adv-paid>${moneyHTML(amount)}</strong>`, 'color:var(--success)'),
        row('Remaining Balance', `<strong data-adv-remaining>${moneyHTML(remaining)}</strong>`, 'font-weight:700;border-top:1px solid var(--border);padding-top:6px'),
      ])}
      <p class="inline-notice" data-adv-warning role="alert" style="display:${tooHigh ? 'block' : 'none'}">The advance cannot be more than the quote total.</p>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-action="advance-back">Back</button>
        <button type="button" class="primary-button" data-action="advance-continue">${hasExisting ? 'Replace Advance' : 'Add to Cart'}</button>
      </div>`
  } else {
    body = `<h2>Are You Sure?</h2>
      <p style="font-size:14px">You are replacing the current advance of <strong>${moneyHTML(existingPaid)}</strong> with
        <strong>${moneyHTML(amount)}</strong> (${escapeHTML(method)}). The remaining balance will be <strong>${moneyHTML(remaining)}</strong>.</p>
      <p class="muted" style="font-size:13px">The payment is recorded when the order is placed.</p>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-action="advance-back">Go Back</button>
        <button type="button" class="primary-button" data-action="advance-confirm">Yes, Replace It</button>
      </div>`
  }

  return `<div class="modal-backdrop" data-no-backdrop-close>
    <div class="modal rs-advance-prompt">${body}</div>
  </div>`
}

export function ticketSlipPreview(ticket) {
  if (!ticket) return ''
  const t = currentTenant()
  const comps = ticket.components_noted || []
  return `<div class="receipt-preview">${withPrintAttribution(`
    <center>${t.logo?`<img src="${escapeHTML(safeImageURL(t.logo))}" style="max-width:120px;max-height:44px;object-fit:contain;margin-bottom:6px"><br>`:''}
    <strong>${escapeHTML(t.name)}</strong><br>${escapeHTML(t.address||'')}<br>${escapeHTML(t.phone||'')}</center>
    <hr>
    <center><strong>REPAIR TICKET</strong><br>${escapeHTML(ticket.invoice_number||ticket.ticket_number)}<br><span style="font-size:11px;color:#888">Ticket: ${escapeHTML(ticket.ticket_number)}</span></center>
    <hr>
    Customer: ${escapeHTML(ticket.customer_name)}<br>
    Phone: ${escapeHTML(ticket.customer_phone)}<br>
    Device: ${escapeHTML(ticket.device_brand)} ${escapeHTML(ticket.device_model)}<br>
    ${ticket.imei ? `IMEI: <small>${escapeHTML(ticket.imei)}</small><br>` : ''}
    Date: ${new Date(ticket.created_at||Date.now()).toLocaleString()}
    <hr>
    <strong>Issues Noted:</strong><br>
    ${comps.length ? comps.map(c => {
      const label = c.tag === 'Custom' ? (c.customText || '') : (c.tag || '')
      return `· ${escapeHTML(c.name)}${label?` (${escapeHTML(label)})`:''}${Number(c.price)>0?` — ${moneyHTML(c.price)}`:''}`
    }).join('<br>') : 'No components noted.'}
    <hr>
    ${ticket.technician_note ? `<strong>Technician Note:</strong><br>${escapeHTML(ticket.technician_note)}<hr>` : ''}
    ${Number(ticket.labour_cost)>0 ? `Labour Fee: <strong>${moneyHTML(ticket.labour_cost)}</strong><br>` : ''}
    Estimated Quote: <strong>${moneyHTML(ticket.estimated_quote)}</strong><br>
    ${Number(ticket.advance_payment)>0 ? `Advance Paid: <strong>${moneyHTML(ticket.advance_payment)}</strong>${ticket.advance_method?` (${escapeHTML(ticket.advance_method)})`:''}<br>` : ''}
    <hr>
    <center>${escapeHTML(t.receiptFooter||'')}</center>
  `)}</div>`
}
