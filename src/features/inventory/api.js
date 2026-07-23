/* ═══════════════════════════════════════════════════════════════════
   features/inventory/api.js
   Supabase-facing operations for inventory items. Moved from
   src/inventory.js during the Inventory extraction (see architecture
   refactor). Still lazy-loaded only when CFG.inventory_module_enabled
   is true -- see features/inventory/index.js and its two call sites
   in pos.js/admin.js, unchanged from before this split.
═══════════════════════════════════════════════════════════════════ */
import { sb, state, logInventoryEvent } from '../../shared.js'
import { dlog } from '../../debuglog.js'

export function handleInvEdit(el) {
  dlog('inventory.handleInvEdit', `id=${el.dataset.invEdit}`)
  state.modal = { type:'inv-edit', id:el.dataset.invEdit }
}

export async function handleInvDelete(el) {
  dlog('inventory.handleInvDelete', `ENTRY id=${el.dataset.invDelete}`)
  if (!confirm('Delete this item?')) { dlog('inventory.handleInvDelete', 'user cancelled confirm()'); return { deleted:false } }
  const { error } = await sb.from('inventory').delete().eq('id', Number(el.dataset.invDelete))
  if (error) { dlog('inventory.handleInvDelete', `FAILED: ${error.message}`); alert('Error: '+error.message); return { deleted:false } }
  dlog('inventory.handleInvDelete', 'SUCCEEDED')
  return { deleted:true }
}

export async function submitInvAdd(data) {
  dlog('inventory.submitInvAdd', `ENTRY name=${data.name}`)
  const { error } = await sb.from('inventory').insert({
    name:data.name, sku:data.sku||'', category:data.category||'General',
    price:Number(data.price||0), cost:Number(data.cost||0),
    qty:Number(data.qty||0), min_qty:Number(data.min_qty||0),
  })
  if (error) { dlog('inventory.submitInvAdd', `FAILED: ${error.message}`); alert('Error: '+error.message); return { ok:false } }
  await logInventoryEvent()
  dlog('inventory.submitInvAdd', 'SUCCEEDED')
  return { ok:true }
}

export async function submitInvEdit(data) {
  dlog('inventory.submitInvEdit', `ENTRY id=${data.id} name=${data.name}`)
  const { error } = await sb.from('inventory').update({
    name:data.name, sku:data.sku, category:data.category,
    price:Number(data.price), cost:Number(data.cost),
    qty:Number(data.qty), min_qty:Number(data.min_qty),
  }).eq('id', Number(data.id))
  if (error) { dlog('inventory.submitInvEdit', `FAILED: ${error.message}`); alert('Error: '+error.message); return { ok:false } }
  dlog('inventory.submitInvEdit', 'SUCCEEDED')
  return { ok:true }
}
