/* ═══════════════════════════════════════════════════════════════════
   features/admin/inventory/api.js
   Admin-exclusive inventory management operations -- verified by
   actual caller (only admin.js calls any of these).
═══════════════════════════════════════════════════════════════════ */
import { sb, state, logInventoryEvent } from '../../../shared.js'
import { dlog } from '../../../debuglog.js'

export function handleInvEdit(el) {
  dlog('admin.inventory.handleInvEdit', `id=${el.dataset.invEdit}`)
  state.modal = { type:'inv-edit', id:el.dataset.invEdit }
}

export async function handleInvDelete(el) {
  dlog('admin.inventory.handleInvDelete', `ENTRY id=${el.dataset.invDelete}`)
  if (!confirm('Delete this item?')) { dlog('admin.inventory.handleInvDelete', 'user cancelled confirm()'); return { deleted:false } }
  const { error } = await sb.from('inventory').delete().eq('id', Number(el.dataset.invDelete))
  if (error) { dlog('admin.inventory.handleInvDelete', `FAILED: ${error.message}`); alert('Error: '+error.message); return { deleted:false } }
  dlog('admin.inventory.handleInvDelete', 'SUCCEEDED')
  return { deleted:true }
}

export async function submitInvAdd(data) {
  dlog('admin.inventory.submitInvAdd', `ENTRY name=${data.name}`)
  const { error } = await sb.from('inventory').insert({
    name:data.name, sku:data.sku||'', category:data.category||'General',
    price:Number(data.price||0), cost:Number(data.cost||0),
    qty:Number(data.qty||0), min_qty:Number(data.min_qty||0),
  })
  if (error) { dlog('admin.inventory.submitInvAdd', `FAILED: ${error.message}`); alert('Error: '+error.message); return { ok:false } }
  await logInventoryEvent()
  dlog('admin.inventory.submitInvAdd', 'SUCCEEDED')
  return { ok:true }
}

export async function submitInvEdit(data) {
  dlog('admin.inventory.submitInvEdit', `ENTRY id=${data.id} name=${data.name}`)
  const { error } = await sb.from('inventory').update({
    name:data.name, sku:data.sku, category:data.category,
    price:Number(data.price), cost:Number(data.cost),
    qty:Number(data.qty), min_qty:Number(data.min_qty),
  }).eq('id', Number(data.id))
  if (error) { dlog('admin.inventory.submitInvEdit', `FAILED: ${error.message}`); alert('Error: '+error.message); return { ok:false } }
  dlog('admin.inventory.submitInvEdit', 'SUCCEEDED')
  return { ok:true }
}
