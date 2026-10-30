import {iconHTML,itemCategory} from '../../../catalog/icons.js'
import { escapeHTML } from "../../../html.js"
/* ═══════════════════════════════════════════════════════════════════
   features/pos/inventory/render.js
   POS-exclusive inventory browsing -- verified by actual caller (only
   pos.js calls either of these).

   handleInvPosAdd() isn't purely presentational -- it mutates the
   posState object passed into it -- but it does no Supabase operation
   so it doesn't belong in an api.js either, and it's tightly coupled
   to inventoryPanel() (same UI, same click target). Already correctly
   parameterized (posState passed in, not reached into globally) from
   before this split.
═══════════════════════════════════════════════════════════════════ */
import { state, money, moneyHTML } from '../../../shared.js'
import {posPageControls} from '../pagination.js'
import {resourceNotice} from '../../../read-state.js'

export function inventoryPanel(posState,{expanded=false}={}) {
  const invItems = (state.data.inventory||[]).filter(i=>Number(i.qty||0)>0)
  const filtered = invItems // Filtering, including SKU, is authoritative in the bounded backend query.
  return `
    <section class="card rs-inventory-panel" aria-label="Inventory">
      <h2>${expanded?'Inventory — expanded view':'Inventory'}</h2>
      <label class="field"><input class="search" aria-label="Search inventory" placeholder="Search stock…" value="${escapeHTML(posState.invSearch||'')}" data-inv-search></label>
      ${state.resources.inventory?.status==='unavailable'?resourceNotice('Inventory','unavailable'):''}
      <div class="rs-product-list">
        ${filtered.slice(0,24).map(i=>`
          <button class="secondary-button rs-product-item"
            ${state.resources.inventory?.status==='ready'?'':'disabled'}
            data-inv-pos-add="${i.id}" data-inv-pos-name="${escapeHTML(i.name)}" data-inv-pos-price="${i.price}">
            ${iconHTML(i.icon_id,itemCategory(i.icon_id))}<span><strong>${escapeHTML(i.name)}</strong><small>${moneyHTML(i.price)} · ${i.qty} left</small></span>
          </button>`).join('')}
      </div>
      <p class="muted" role="status" data-stock-search-status>${state.resources.inventory?.status==='unavailable'?'':state.resources.inventory?.status==='loading'?'Searching current stock…':!filtered.length?'No sellable items on this page.':''}</p>
      ${posPageControls(posState.inventoryPage,'data-stock-page','inventory',expanded,state.resources.inventory?.status==='ready')}
    </section>`
}

export function handleInvPosAdd(el, posState) {
  const id=Number(el.dataset.invPosAdd), name=el.dataset.invPosName, price=Number(el.dataset.invPosPrice)
  const key=`inv-${id}`
  const ex=posState.cart.find(i=>i.productId===key)
  if (ex) ex.qty+=1
  else posState.cart.push({ productId:key, name, qty:1, originalPrice:price, soldPrice:price, discount:0, reason:'', isInventory:true, icon_id:(state.data.inventory||[]).find(i=>i.id===id)?.icon_id, inventoryId:id })
}
