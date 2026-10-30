import {quickPrice} from '../../../catalog/prices.js'
import {iconHTML,iconSelector,itemCategory} from '../../../catalog/icons.js'
import {catalogAvailable} from '../../../catalog/data.js'
import { escapeHTML } from "../../../html.js"
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
import { state, CFG, money, moneyHTML, fld, modalActions } from '../../../shared.js'

export function catalogPage({ tit, tlb, adminState, isAllowed }) {
  if (!isAllowed)
    return `<div class="card"><p class="muted">Catalog is available to Managers and the Business Owner only.</p></div>`
  const tabs = { quickitems:'Quick Items', ...(CFG.repair_module_enabled ? { components:'Components' } : {}) }
  if (!tabs[adminState.catalogTab]) adminState.catalogTab = 'quickitems'
  return `
    ${tit('Catalog','Quick sale items and repair components.','')}
    <div class="settings-tabs">
      ${Object.entries(tabs).map(([k,l]) =>
        `<button class="settings-tab ${adminState.catalogTab===k?'active':''}" data-catalog-tab="${k}">${l}</button>`
      ).join('')}
    </div>
    ${adminState.catalogTab==='components'?`<div class="settings-tabs"><button class="settings-tab ${adminState.componentTab!=='brands'?'active':''}" data-component-tab="quicktap">Quick-Tap Components</button><button class="settings-tab ${adminState.componentTab==='brands'?'active':''}" data-component-tab="brands">Device Brands</button></div>`:''}
    ${!catalogAvailable()?'<p role="status" class="muted">Icon assignment and Device Brands require a reviewed backend upgrade. Existing catalog and repairs remain available.</p>':''}
    ${tlb('Search this catalog…')}
    ${catalogTabContent(adminState)}`
}

export function catalogTabContent(adminState) {
  if(adminState.catalogTab==='components'&&adminState.componentTab==='brands')return brandsContent()
  if (adminState.catalogTab === 'components' && CFG.repair_module_enabled) {
    const comps = state.data.repairComponents || []
    return `
      <div class="card" style="display:grid;gap:14px">
        <div><h2>Quick-Tap Components</h2></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${comps.map((c) => `
            <div style="display:flex;align-items:center;gap:6px;background:var(--surface-2);
                        border:1px solid var(--border);border-radius:8px;padding:6px 10px">
              ${iconHTML(c.icon_id,'repair')}<span style="font-size:13px">${escapeHTML(c.name)}</span>
              ${catalogAvailable()?`<button class="secondary-button" data-action="edit-catalog-icon" data-icon-kind="component" data-record-id="${c.id}">Icon</button>`:''}
              <button type="button" data-remove-quick="${c.id}"
                style="color:var(--danger);background:none;border:none;
                       font-size:16px;line-height:1;padding:0 2px;cursor:pointer">×</button>
            </div>`).join('')}
        </div>
        <div style="display:flex;gap:8px">
          <input id="new-comp-input" class="search" placeholder="New component name" style="flex:1">
          ${catalogAvailable()?iconSelector('newComponentIcon','',['repair','generic'],'repair'):''}<button class="primary-button" data-action="add-quick-comp">Add</button>
        </div>
      </div>`
  }

  if (adminState.catalogTab === 'quickitems') {
    const items = state.data.quickItems || []
    return `
      <div class="card" style="display:grid;gap:16px">
        <div class="toolbar"><h2>Quick Sale Items</h2><button class="primary-button" data-action="open-add-quick-item">+ Add Quick Item</button></div>
        ${items.map((item,i) => `
          <div class="rs-quick-item-row" style="padding:12px;background:var(--surface-2);border-radius:8px;display:grid;gap:8px">
            <div class="rs-quick-item-header">
              ${iconHTML(item.icon_id,itemCategory(item.icon_id))}<strong>${escapeHTML(item.name)}</strong>${catalogAvailable()?`<button class="secondary-button" data-action="edit-catalog-icon" data-icon-kind="quick" data-record-id="${item.id}">Icon</button>`:''}
              <button type="button" data-remove-qitem="${i}"
                style="color:var(--danger);background:none;border:none;font-size:18px;cursor:pointer">×</button>
            </div>
            <div style="font-size:13px;color:var(--muted)">
              Prices: ${(Array.isArray(item.prices)?item.prices:[]).map((p,pi) => {
                const pv = quickPrice(p)
                return `
                <span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px">
                  ${pv?.name ? `<strong>${escapeHTML(pv.name)}</strong>:` : ''} ${pv?moneyHTML(pv.price):'Price unavailable'}
                  <button type="button" data-remove-qprice="${i}-${pi}"
                    style="color:var(--danger);background:none;border:none;font-size:14px;cursor:pointer;padding:0">×</button>
                </span>`
              }).join('')}
            </div>
            <div class="rs-quick-variant-entry">
              <input class="search" placeholder="Brand/Variant name (optional)" id="qvariant-name-${i}" style="flex:2;min-width:0">
              <input type="number" step="any" min="0" placeholder="Price" id="qprice-input-${i}"
                style="flex:1;min-width:0;border:1px solid var(--border);border-radius:6px;
                       padding:7px 9px;background:var(--surface);color:var(--text)">
              <button type="button" class="secondary-button" data-add-qprice="${i}">+ Add</button>
            </div>
          </div>`).join('')}
      </div>`
  }
}

export function qiVariantRowHTML() {
  return `<div data-variant-row class="quick-variant-row">
    <label class="field"><span>Variant name (optional)</span><input class="search" name="variantName[]" placeholder="Brand/Variant name"></label>
    <label class="field"><span>Price</span><input type="number" step="any" min="0" name="variantPrice[]" placeholder="Price" class="search"></label>
    <button type="button" class="secondary-button" aria-label="Remove this variant" data-action="remove-variant-row" style="color:var(--danger)">×</button>
  </div>`
}

export function addQuickItemModalHTML() {
  return `<div class="modal-backdrop"><form class="modal modal-sm" data-form="add-quick-item">
    <h2>Add Quick Item</h2>
    <div class="form-grid rs-quick-item-fields">
      ${fld('Item Name','itemName')}
      ${catalogAvailable()?iconSelector('icon_id'):''}
    </div>
    <p class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin:14px 0 6px">
      Variants (brand/name optional, price required)
    </p>
    <div id="qi-variant-rows" data-ui-preserve-children>${qiVariantRowHTML()}</div>
    <button type="button" class="secondary-button" data-action="add-variant-row">+ Add Another Variant</button>
    ${modalActions()}
  </form></div>`
}

function brandsContent(){
 if(!catalogAvailable())return '<div class="card"><h2>Device Brands</h2><p>Install the reviewed catalog backend update before managing brands.</p></div>'
 return `<section class="card"><div class="toolbar"><h2>Device Brands</h2><button class="primary-button" data-action="new-device-brand">Add Brand</button></div>
  <p class="muted">Inactive brands stay available for historical labels. Manual repair brand entry does not create records.</p>
  <div class="rs-product-list">${(state.data.deviceBrands||[]).map(b=>`<div class="rs-brand-row">${iconHTML(b.icon_id,'brand')}<strong>${escapeHTML(b.display_name)}</strong><span class="badge">${b.enabled?'Active':'Inactive'}</span><button class="secondary-button" data-action="edit-device-brand" data-record-id="${b.id}">Edit</button></div>`).join('')||'<p class="muted">No brands match.</p>'}</div></section>`
}
export function catalogIconModalHTML(modal){
 return `<div class="modal-backdrop"><form class="modal modal-sm" data-form="catalog-icon"><h2>Assign icon</h2><p>${escapeHTML(modal.record.name)}</p>${iconSelector('icon_id',modal.record.icon_id||'',modal.kind==='component'?['repair','generic']:['accessory','repair','service','generic'],modal.kind==='component'?'repair':'catalog')}${modalActions()}</form></div>`
}
export function deviceBrandModalHTML(modal){
 const b=modal.record||{}
 return `<div class="modal-backdrop"><form class="modal modal-sm" data-form="device-brand"><h2>${b.id?'Edit':'Add'} Device Brand</h2>
 <label class="field"><span>Display name</span><input name="display_name" required maxlength="100" value="${escapeHTML(b.display_name||'')}"></label>
 ${iconSelector('icon_id',b.icon_id||'',['brand','generic'],'brands')}
 <label class="field"><span>Order</span><input name="sort_order" type="number" min="0" max="10000" step="1" required value="${b.sort_order||0}"></label>
 <label class="field"><span>Availability</span><select name="enabled"><option value="true" ${b.enabled!==false?'selected':''}>Active</option><option value="false" ${b.enabled===false?'selected':''}>Inactive</option></select></label>${modalActions()}</form></div>`
}
