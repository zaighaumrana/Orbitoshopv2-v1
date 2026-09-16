import {state,money} from '../../shared.js'
import {recordAdditionalWork} from './api.js'

export function createSubInvoiceModalHTML(modal, {technician = false, workshop = false} = {}) {
  const parentId = modal.parentId
  const tk = (state.data.tickets||[]).find(t => String(t.id) === String(parentId))
  if (!tk) return ''
  const draft      = modal.draftComponents || []
  const labour     = modal.draftLabour ?? 0
  const compDefs   = state.data.repairComponents || []
  const partsTotal = draft.reduce((s,c) => s + Number(c.price||0), 0)
  const total      = partsTotal + labour

  const fields = modal.additionalFields || {}
  const esc = value => String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
  const html = `
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
          <textarea id="sub-invoice-note" style="min-height:56px" placeholder="What was found / done…">${esc(fields.note)}</textarea>
        </label>

        <div class="form-grid" style="margin-bottom:12px">
          <label class="field"><span>Customer decision</span><select id="additional-work-decision" ${technician ? 'disabled' : ''}>${(technician ? ['Pending'] : ['Approved','Pending','Declined']).map(x=>`<option ${x===(fields.decision||'Approved')?'selected':''}>${x}</option>`).join('')}</select></label>
          <label class="field"><span>Decision method</span><select id="additional-work-method">${['Phone','In person','WhatsApp','Other'].map(x=>`<option ${x===(fields.method||'Phone')?'selected':''}>${x}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>Decision note (optional)</span><textarea id="additional-work-note">${esc(fields.decisionNote)}</textarea></label>
        ${technician ? '<p class="muted">Saved as Pending for an authorized customer decision. No invoice is created.</p>' : ''}

        <div style="display:flex;justify-content:space-between;font-weight:600;padding:10px;
                    background:var(--surface-2);border-radius:8px;margin-bottom:16px;font-size:15px">
          <span>Additional Work Quote</span><span id="subinv-draft-total">${money(total)}</span>
        </div>

        <div class="modal-actions">
          <button type="button" class="secondary-button" data-close>Cancel</button>
          <button type="button" class="primary-button" data-action="submit-sub-invoice" data-parent-id="${parentId}">
            Save Decision
          </button>
        </div>
      </div>
    </div>`
  return workshop ? html.replaceAll('data-subinv-', 'data-draft-').replaceAll('subinv-draft-total','draft-total') : html
}

export function rememberAdditionalWorkInput(target, modal) {
  if (modal?.type !== 'create-sub-invoice') return
  const key = {'sub-invoice-note':'note','additional-work-decision':'decision','additional-work-method':'method','additional-work-note':'decisionNote'}[target.id]
  if (key) (modal.additionalFields ||= {})[key] = target.value
}
const pending = new Set()
export async function submitAdditionalWorkDraft(parentId, components, labour, modal, technician = false) {
  const key = String(parentId)
  if (pending.has(key)) return {busy:true}
  pending.add(key)
  const fields = modal.additionalFields || {}
  const description = components.map(c=>c.name).filter(Boolean).join(', ') || fields.note || 'Additional work'
  try {
    return await recordAdditionalWork(Number(parentId), description, components, labour,
      technician ? 'Pending' : (fields.decision || 'Approved'),
      fields.method || 'Phone', fields.decisionNote || '', fields.note || '')
  } finally { pending.delete(key) }
}
