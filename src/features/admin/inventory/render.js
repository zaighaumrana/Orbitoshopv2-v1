/* ═══════════════════════════════════════════════════════════════════
   features/admin/inventory/render.js
   Admin-exclusive inventory management rendering -- verified by
   actual caller (only admin.js calls either of these).
═══════════════════════════════════════════════════════════════════ */
import { state, money, fld, modalActions } from '../../../shared.js'

export function adminInventoryPage({ filter, tit }) {
  const items    = state.data.inventory || []
  const f        = (filter||'').toLowerCase()
  const filtered = items.filter(i => !f ||
    (i.name||'').toLowerCase().includes(f) ||
    (i.sku||'').toLowerCase().includes(f) ||
    (i.category||'').toLowerCase().includes(f))
  const lowStock = items.filter(i => Number(i.qty||0) <= Number(i.min_qty||0) && Number(i.min_qty||0) > 0)
  return `
    ${tit('Inventory','Stock levels, pricing, and alerts.',
      `<button class="primary-button" data-modal="inv-add">+ Add Item</button>`)}
    ${lowStock.length ? `<div style="background:color-mix(in srgb,var(--warning) 12%,var(--surface));border:1px solid color-mix(in srgb,var(--warning) 30%,var(--border));border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:12px">
      ⚠ ${lowStock.length} item${lowStock.length>1?'s':''} low: ${lowStock.map(i=>`<strong>${i.name}</strong> (${i.qty} left)`).join(', ')}
    </div>` : ''}
    <div class="card">
      <input class="search" placeholder="Search inventory…" data-filter
        value="${filter||''}" style="width:100%;margin-bottom:10px;border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:var(--text)">
      ${filtered.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Qty</th><th>Sell</th><th>Cost</th><th></th></tr></thead>
          <tbody>
            ${filtered.map(i => `<tr>
              <td><strong>${i.name}</strong></td>
              <td class="muted">${i.sku||'—'}</td>
              <td>${i.category||'—'}</td>
              <td><span class="badge ${Number(i.qty||0)<=Number(i.min_qty||0)&&Number(i.min_qty||0)>0?'bad':'good'}">${i.qty}</span></td>
              <td>${money(i.price)}</td>
              <td class="muted">${money(i.cost)}</td>
              <td>
                <button class="secondary-button" style="font-size:12px;padding:4px 10px" data-inv-edit="${i.id}">Edit</button>
                <button class="secondary-button" style="font-size:12px;padding:4px 10px;color:var(--danger)" data-inv-delete="${i.id}">Delete</button>
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
        ${fld('Quantity','qty',item.qty,'number')}
        ${fld('Min Stock Alert','min_qty',item.min_qty,'number')}
      </div>
      ${modalActions()}
    </form></div>`
  }
  return ''
}
