/* ═══════════════════════════════════════════════════════════════════
   features/admin/catalog/render.js
   Admin-exclusive catalog management -- verified by actual caller
   (only admin.js calls any of these). Bundles two genuinely separate
   management areas (repair component tags, quick sale items) into one
   tabbed page, same as the source UI does -- not split further into
   separate folders since the combined size (81 lines in the original)
   doesn't justify it, matching the same restraint applied to EMS's
   attendance/leave/salary tabs staying in one file.

   Note: the underlying DATA (state.data.quickItems,
   state.data.repairComponents) IS shared with pos.js (and
   repairComponents with workshop.js too) -- same shape as Inventory,
   POS has the browse/sell side, Admin has the manage side. Only the
   render functions are admin-exclusive.

   Takes tit and adminState as parameters rather than importing them
   from admin.js -- same pattern as adminInventoryPage({filter, tit})
   and reportsPage({tit}).
═══════════════════════════════════════════════════════════════════ */
import { state, money, fld, modalActions } from '../../../shared.js'

export function catalogPage({ tit, adminState, isAllowed }) {
  if (!isAllowed)
    return `<div class="card"><p class="muted">Catalog is available to Managers and the Business Owner only.</p></div>`
  const tabs = { quickitems:'Quick Items', components:'Components' }
  return `
    ${tit('Catalog','Quick sale items and repair components.','')}
    <div class="settings-tabs">
      ${Object.entries(tabs).map(([k,l]) =>
        `<button class="settings-tab ${adminState.catalogTab===k?'active':''}" data-catalog-tab="${k}">${l}</button>`
      ).join('')}
    </div>
    ${catalogTabContent(adminState)}`
}

export function catalogTabContent(adminState) {
  if (adminState.catalogTab === 'components') {
    const comps = state.data.repairComponents || []
    return `
      <div class="card" style="display:grid;gap:14px">
        <div><h2>Quick-Tap Components</h2></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${comps.map((c) => `
            <div style="display:flex;align-items:center;gap:6px;background:var(--surface-2);
                        border:1px solid var(--border);border-radius:8px;padding:6px 10px">
              <span style="font-size:13px">${c.name}</span>
              <button type="button" data-remove-quick="${c.id}"
                style="color:var(--danger);background:none;border:none;
                       font-size:16px;line-height:1;padding:0 2px;cursor:pointer">×</button>
            </div>`).join('')}
        </div>
        <div style="display:flex;gap:8px">
          <input id="new-comp-input" class="search" placeholder="New component name" style="flex:1">
          <button class="primary-button" data-action="add-quick-comp">Add</button>
        </div>
      </div>`
  }

  if (adminState.catalogTab === 'quickitems') {
    const items = state.data.quickItems || []
    return `
      <div class="card" style="display:grid;gap:16px">
        <div><h2>Quick Sale Items</h2></div>
        ${items.map((item,i) => `
          <div style="padding:12px;background:var(--surface-2);border-radius:8px;display:grid;gap:8px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <strong>${item.name}</strong>
              <button type="button" data-remove-qitem="${i}"
                style="color:var(--danger);background:none;border:none;font-size:18px;cursor:pointer">×</button>
            </div>
            <div style="font-size:13px;color:var(--muted)">
              Prices: ${(item.prices||[]).map((p,pi) => {
                const pv = (typeof p === 'object' && p !== null) ? p : { name:'', price:p }
                return `
                <span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px">
                  ${pv.name ? `<strong>${pv.name}</strong>:` : ''} ${money(pv.price)}
                  <button type="button" data-remove-qprice="${i}-${pi}"
                    style="color:var(--danger);background:none;border:none;font-size:14px;cursor:pointer;padding:0">×</button>
                </span>`
              }).join('')}
            </div>
            <div style="display:flex;gap:8px">
              <input class="search" placeholder="Brand/Variant name (optional)" id="qvariant-name-${i}" style="flex:2;min-width:0">
              <input type="number" step="any" min="0" placeholder="Price" id="qprice-input-${i}"
                style="flex:1;min-width:0;border:1px solid var(--border);border-radius:6px;
                       padding:7px 9px;background:var(--surface);color:var(--text)">
              <button type="button" class="secondary-button" data-add-qprice="${i}">+ Add</button>
            </div>
          </div>`).join('')}
        <button class="primary-button" data-action="open-add-quick-item">+ Add Quick Item</button>
      </div>`
  }
}

export function qiVariantRowHTML() {
  return `<div data-variant-row style="display:flex;gap:8px;margin-bottom:8px">
    <input class="search" name="variantName[]" placeholder="Brand/Variant name (optional)" style="flex:2;min-width:0">
    <input type="number" step="any" min="0" name="variantPrice[]" placeholder="Price" class="search" style="flex:1;min-width:0">
    <button type="button" class="secondary-button" data-action="remove-variant-row" style="color:var(--danger)">×</button>
  </div>`
}

export function addQuickItemModalHTML() {
  return `<div class="modal-backdrop"><form class="modal modal-sm" data-form="add-quick-item">
    <h2>Add Quick Item</h2>
    <div class="form-grid">
      ${fld('Item Name','itemName')}
    </div>
    <p class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin:14px 0 6px">
      Variants (brand/name optional, price required)
    </p>
    <div id="qi-variant-rows">${qiVariantRowHTML()}</div>
    <button type="button" class="secondary-button" data-action="add-variant-row">+ Add Another Variant</button>
    ${modalActions()}
  </form></div>`
}
