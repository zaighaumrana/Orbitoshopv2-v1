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
import { state, money } from '../../../shared.js'

export function inventoryPanel(posState) {
  const invItems = (state.data.inventory||[]).filter(i=>Number(i.qty||0)>0)
  if (!invItems.length) return ''
  const f = (posState.invSearch||'').toLowerCase()
  const filtered = f ? invItems.filter(i=>(i.name||'').toLowerCase().includes(f)||(i.category||'').toLowerCase().includes(f)) : invItems
  return `
    <div class="card">
      <h2 style="margin-bottom:10px">Stock Items</h2>
      <input placeholder="Search stock…" value="${posState.invSearch||''}" data-inv-search
        style="width:100%;margin-bottom:10px;border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:var(--text);font-size:14px">
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${filtered.slice(0,24).map(i=>`
          <button class="secondary-button" style="font-size:13px;padding:8px 14px;border-radius:8px;text-align:left"
            data-inv-pos-add="${i.id}" data-inv-pos-name="${i.name}" data-inv-pos-price="${i.price}">
            <div style="font-weight:600">${i.name}</div>
            <div style="font-size:11px;color:var(--muted)">${money(i.price)} · ${i.qty} left</div>
          </button>`).join('')}
      </div>
    </div>`
}

export function handleInvPosAdd(el, posState) {
  const id=Number(el.dataset.invPosAdd), name=el.dataset.invPosName, price=Number(el.dataset.invPosPrice)
  const key=`inv-${id}`
  const ex=posState.cart.find(i=>i.productId===key)
  if (ex) ex.qty+=1
  else posState.cart.push({ productId:key, name, qty:1, originalPrice:price, soldPrice:price, discount:0, reason:'', isInventory:true, inventoryId:id })
}
