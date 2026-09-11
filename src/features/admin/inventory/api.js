/* ═══════════════════════════════════════════════════════════════════
   features/admin/inventory/api.js
   Admin-exclusive inventory management operations -- verified by
   actual caller (only admin.js calls any of these).
═══════════════════════════════════════════════════════════════════ */
import { sb, state, logInventoryEvent, confirmAction, showToast } from '../../../shared.js'
import { dlog } from '../../../debuglog.js'

const pendingInventoryRequests = new Map()

export function handleInvEdit(el) {
  dlog('admin.inventory.handleInvEdit', `id=${el.dataset.invEdit}`)
  state.modal = { type:'inv-edit', id:el.dataset.invEdit }
}

export function handleInvAdjust(el) {
  state.modal = { type:'inv-adjust', id:el.dataset.invAdjust }
}

export async function handleInvDelete(el) {
  dlog('admin.inventory.handleInvDelete', `ENTRY id=${el.dataset.invDelete}`)
  const outcome = await confirmAction({
    title: 'Delete item?',
    message: 'This action cannot be undone.',
    confirmLabel: 'Delete',
    tone: 'danger',
    action: async () => {
      const { error } = await sb.from('inventory').delete().eq('id', Number(el.dataset.invDelete))
      if (error) {
        dlog('admin.inventory.handleInvDelete', `FAILED: ${error.message}`)
        showToast('Error: ' + error.message, 'error')
        return false
      }
      dlog('admin.inventory.handleInvDelete', 'SUCCEEDED')
      showToast('Item deleted.', 'success')
      return true
    },
  })
  if (!outcome?.confirmed) dlog('admin.inventory.handleInvDelete', 'user cancelled delete dialog')
  return { deleted: outcome?.value === true }
}

export async function submitInvAdd(data) {
  dlog('admin.inventory.submitInvAdd', `ENTRY name=${data.name}`)
  const key = `create:${data.name}:${data.sku||''}`
  const requestId = pendingInventoryRequests.get(key) || crypto.randomUUID()
  pendingInventoryRequests.set(key,requestId)
  const { error } = await sb.rpc('create_inventory_item', {
    p_request_id:requestId, p_name:data.name, p_sku:data.sku||'',
    p_category:data.category||'General', p_price:Number(data.price||0),
    p_cost:Number(data.cost||0), p_initial_quantity:Number(data.qty||0),
    p_min_quantity:Number(data.min_qty||0),
  })
  if (error) { dlog('admin.inventory.submitInvAdd', `FAILED: ${error.message}`); showToast('Error: '+error.message, 'error'); return { ok:false } }
  pendingInventoryRequests.delete(key)
  await logInventoryEvent()
  dlog('admin.inventory.submitInvAdd', 'SUCCEEDED')
  return { ok:true }
}

export async function submitInvEdit(data) {
  dlog('admin.inventory.submitInvEdit', `ENTRY id=${data.id} name=${data.name}`)
  const { error } = await sb.from('inventory').update({
    name:data.name, sku:data.sku, category:data.category,
    price:Number(data.price), cost:Number(data.cost),
    min_qty:Number(data.min_qty),
  }).eq('id', Number(data.id))
  if (error) { dlog('admin.inventory.submitInvEdit', `FAILED: ${error.message}`); showToast('Error: '+error.message, 'error'); return { ok:false } }
  dlog('admin.inventory.submitInvEdit', 'SUCCEEDED')
  return { ok:true }
}

export async function submitInvAdjust(data) {
  const inventoryId = Number(data.id)
  const key = `adjust:${inventoryId}`
  const requestId = pendingInventoryRequests.get(key) || crypto.randomUUID()
  pendingInventoryRequests.set(key,requestId)
  const { error } = await sb.rpc('adjust_inventory_stock', {
    p_request_id:requestId,
    p_inventory_id:inventoryId,
    p_quantity_delta:Number(data.quantity_delta),
    p_movement_type:data.movement_type,
    p_reason:data.reason,
  })
  if (error) { showToast('Stock adjustment failed: '+error.message, 'error'); return { ok:false } }
  pendingInventoryRequests.delete(key)
  return { ok:true }
}
