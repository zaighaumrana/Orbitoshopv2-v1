import {retirementAvailable} from '../../../inventory-state.js'
import {catalogAvailable} from '../../../catalog/data.js'
import {iconSelector} from '../../../catalog/icons.js'
import { escapeHTML } from "../../../html.js"
/* ═══════════════════════════════════════════════════════════════════
   features/admin/inventory/render.js
   Admin-exclusive inventory management rendering -- verified by
   actual caller (only admin.js calls either of these).
═══════════════════════════════════════════════════════════════════ */
import { state, money, moneyHTML, fld, modalActions } from '../../../shared.js'

export function adminInventoryPage({ filter, tit, status='active' }) {
  const items    = state.data.inventory || []
  const f        = (filter||'').toLowerCase()
  const filtered = items.filter(i => !f ||
    (i.name||'').toLowerCase().includes(f) ||
    (i.sku||'').toLowerCase().includes(f) ||
    (i.category||'').toLowerCase().includes(f))
  const lowStock = items.filter(i => !i.retired_at && Number(i.qty||0) <= Number(i.min_qty||0) && Number(i.min_qty||0) > 0)
  return `
    ${tit('Inventory','Stock levels, pricing, and alerts.',
      `<button class="primary-button" data-modal="inv-add">+ Add Item</button>`)}
    ${lowStock.length ? `<div style="background:color-mix(in srgb,var(--warning) 12%,var(--surface));border:1px solid color-mix(in srgb,var(--warning) 30%,var(--border));border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:12px">
      ⚠ On this page: ${lowStock.length} item${lowStock.length>1?'s':''} low: ${lowStock.map(i=>`<strong>${escapeHTML(i.name)}</strong> (${i.qty} left)`).join(', ')}
    </div>` : ''}
    <div class="card">
      ${retirementAvailable()?`<label class="field" style="max-width:240px;margin-bottom:12px"><span>Show</span><select data-inventory-status><option value="active" ${status==='active'?'selected':''}>Active items</option><option value="retired" ${status==='retired'?'selected':''}>Retired history</option></select></label>`:''}
      <input class="search" placeholder="Search inventory…" data-filter
        value="${escapeHTML(filter||'')}" style="width:100%;margin-bottom:10px;border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:var(--text)">
      ${filtered.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Qty</th><th>Sell</th><th>Cost</th><th></th></tr></thead>
          <tbody>
            ${filtered.map(i => `<tr>
              <td><strong>${escapeHTML(i.name)}</strong>${i.retired_at?`<p class="muted">Retired · ${escapeHTML(i.retirement_reason||'')}</p>`:''}</td>
              <td class="muted">${escapeHTML(i.sku||'—')}</td>
              <td>${escapeHTML(i.category||'—')}</td>
              <td><span class="badge ${Number(i.qty||0)<=Number(i.min_qty||0)&&Number(i.min_qty||0)>0?'bad':'good'}">${i.qty}</span></td>
              <td>${moneyHTML(i.price)}</td>
              <td class="muted">${moneyHTML(i.cost)}</td>
              <td>
                ${i.retired_at?'<span class="badge">Permanently retired</span>':`
                <button class="secondary-button" style="font-size:12px;padding:4px 10px" data-inv-edit="${i.id}">Edit</button>
                <button class="secondary-button" style="font-size:12px;padding:4px 10px" data-inv-adjust="${i.id}">${retirementAvailable()?'Manage stock':'Adjust Stock'}</button>
                ${retirementAvailable()?`<button class="secondary-button" style="font-size:12px;padding:4px 10px;color:var(--danger)" data-inv-retire="${i.id}">Retire</button>`:`<button class="secondary-button" style="font-size:12px;padding:4px 10px;color:var(--danger)" data-inv-delete="${i.id}">Delete</button>`}` }
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>` :
        `<div class="empty">${filter ? 'No items match.' : 'No inventory yet.'}</div>`}
    </div>`
}

export function inventoryModalHTML(type, id) {
  if (type === 'inv-add') return `<div class="modal-backdrop"><form class="modal" data-form="inv-add" style="max-width:500px">
    <h2>Add Inventory Item</h2>
    <div class="form-grid">
      ${fld('Name','name')}${fld('SKU','sku')}${fld('Category','category','General')}
      ${fld('Selling Price','price','0','number')}
      ${fld('Cost Price','cost','0','number')}
      ${fld('Quantity','qty','0','number')}
      ${fld('Min Stock Alert','min_qty','0','number')}
    </div>
    ${modalActions()}
  </form></div>`

  if (type === 'inv-edit') {
    const item = (state.data.inventory||[]).find(p => String(p.id) === String(id))
    if (!item) return `<div class="modal-backdrop"><div class="modal"><p>Not found.</p><div class="modal-actions"><button class="secondary-button" data-close>Close</button></div></div></div>`
    return `<div class="modal-backdrop"><form class="modal" data-form="inv-edit" style="max-width:500px">
      <h2>Edit Item</h2>
      <input type="hidden" name="id" value="${item.id}">
      <div class="form-grid">
        ${fld('Name','name',item.name)}${fld('SKU','sku',item.sku)}${fld('Category','category',item.category)}
        ${fld('Selling Price','price',item.price,'number')}
        ${fld('Cost Price','cost',item.cost,'number')}
        ${fld('Min Stock Alert','min_qty',item.min_qty,'number')}
        ${catalogAvailable()?iconSelector('icon_id',item.icon_id||'',['accessory','repair','service','generic'],'inventory'):''}
      </div>
      <p class="muted">Current quantity: <strong>${item.qty}</strong>. Use ${retirementAvailable()?'Manage stock':'Adjust Stock'} for an audited quantity change.</p>
      ${modalActions()}
    </form></div>`
  }
  if((type==='inv-adjust'||type==='inv-retire')&&retirementAvailable()){
    const item=(state.data.inventory||[]).find(i=>String(i.id)===String(id)),draft=state.modal?.stockDraft||{},retire=type==='inv-retire'
    if(!item||item.retired_at)return `<div class="modal-backdrop"><div class="modal"><p>Item unavailable or permanently retired.</p><button data-close>Close</button></div></div>`
    return `<div class="modal-backdrop"><form class="modal rs-stock-change" data-form="${type}"><h2>${retire?'Permanently retire item':'Manage stock'} — ${escapeHTML(item.name)}</h2><p class="muted">Current stock: <strong>${item.qty}</strong></p>${state.modal?.pendingStock?'<p role="status">Your previous stock change is awaiting confirmation. Retry its original values before making another change.</p>':''}<fieldset ${state.modal?.stockBusy?'disabled':''} style="border:0;margin:0;padding:0;min-width:0"><input type="hidden" name="id" value="${item.id}"><input type="hidden" name="expected_quantity" value="${escapeHTML(draft.expected_quantity??item.qty)}">
    ${retire?`<input type="hidden" name="stock_action" value="retire"><p>This removes the item from active Inventory and POS permanently. Its remaining ${item.qty} units will be recorded as removed. Receipts, returns and stock history stay intact. This cannot be undone.</p>`:`<div class="form-grid"><label class="field"><span>What do you want to do?</span><select name="stock_action"><option value="add" ${draft.stock_action==='add'?'selected':''}>Add stock</option><option value="remove" ${draft.stock_action==='remove'?'selected':''}>Remove stock</option><option value="set" ${draft.stock_action==='set'?'selected':''}>Set exact quantity</option></select></label>${fld('Quantity','quantity',draft.quantity??1,'number').replace('step="any"','step="1" min="0" required')}</div><p class="muted">Enter a positive amount for Add/Remove, or the final quantity for Set. Stock cannot go below zero.</p>`}
    <label class="field"><span>Reason</span><textarea name="reason" required maxlength="500">${escapeHTML(draft.reason||'')}</textarea></label><div class="modal-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button class="${retire?'danger-button':'primary-button'}">Continue with PIN</button></div></fieldset></form></div>`
  }
  if (type === 'inv-adjust') {
    const item = (state.data.inventory||[]).find(p => String(p.id) === String(id))
    if (!item) return `<div class="modal-backdrop"><div class="modal"><p>Not found.</p><div class="modal-actions"><button class="secondary-button" data-close>Close</button></div></div></div>`
    return `<div class="modal-backdrop"><form class="modal" data-form="inv-adjust" style="max-width:500px">
      <h2>Adjust Stock — ${escapeHTML(item.name)}</h2>
      <p class="muted">Current sellable quantity: <strong>${item.qty}</strong></p>
      <input type="hidden" name="id" value="${item.id}">
      <div class="form-grid">
        <label class="field"><span>Change type</span><select name="movement_type">
          <option value="restock">Restock (add stock)</option>
          <option value="manual_adjustment">Manual correction (+ or −)</option>
        </select></label>
        ${fld('Quantity change','quantity_delta','1','number')}
      </div>
      <label class="field"><span>Reason</span><textarea name="reason" required></textarea></label>
      ${modalActions()}
    </form></div>`
  }
  return ''
}
