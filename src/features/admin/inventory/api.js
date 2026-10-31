import {retirementAvailable} from '../../../inventory-state.js'
import {onPrivateReset,authorityIdentity,captureAuthority} from '../../../ui-authority.js'
import {catalogAvailable} from '../../../catalog/data.js'
/* ═══════════════════════════════════════════════════════════════════
   features/admin/inventory/api.js
   Admin-exclusive inventory management operations -- verified by
   actual caller (only admin.js calls any of these).
═══════════════════════════════════════════════════════════════════ */
import { sb, state, logInventoryEvent, confirmAction, showTransactionSuccess, showBlockingError, showToast } from '../../../shared.js'
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
    message: 'This permanently deletes an unused item. Items with recorded stock or sales history must be retained.',
    confirmLabel: 'Delete',
    tone: 'danger',
    action: async () => {
      const { error } = await sb.from('inventory').delete().eq('id', Number(el.dataset.invDelete))
      if (error) {
        dlog('admin.inventory.handleInvDelete', `FAILED: ${error.message}`)
        showBlockingError(error.code==='23503'
          ? 'This item has stock or sales history and cannot be deleted. Use Adjust Stock when its actual quantity changes; zero-quantity items are hidden from POS.'
          : 'Error: ' + error.message)
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
  const { data: result, error } = await sb.rpc('create_inventory_item', {
    p_request_id:requestId, p_name:data.name, p_sku:data.sku||'',
    p_category:data.category||'General', p_price:Number(data.price||0),
    p_cost:Number(data.cost||0), p_initial_quantity:Number(data.qty||0),
    p_min_quantity:Number(data.min_qty||0),
  })
  if (error) { dlog('admin.inventory.submitInvAdd', `FAILED: ${error.message}`); showBlockingError('Error: '+error.message); return { ok:false } }
  pendingInventoryRequests.delete(key)
  logInventoryEvent(result)
  dlog('admin.inventory.submitInvAdd', 'SUCCEEDED')
  return { ok:true }
}

export async function submitInvEdit(data) {
  dlog('admin.inventory.submitInvEdit', `ENTRY id=${data.id} name=${data.name}`)
  const { error } = await sb.from('inventory').update({
    name:data.name, sku:data.sku, category:data.category,
    price:Number(data.price), cost:Number(data.cost),
    min_qty:Number(data.min_qty),
    ...(catalogAvailable()?{icon_id:data.icon_id||null}:{}),
  }).eq('id', Number(data.id))
  if (error) { dlog('admin.inventory.submitInvEdit', `FAILED: ${error.message}`); showBlockingError('Error: '+error.message); return { ok:false } }
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
  if (error) { showBlockingError('Stock adjustment failed: '+error.message); return { ok:false } }
  pendingInventoryRequests.delete(key)
  showTransactionSuccess('Stock adjustment completed.')
  return { ok:true }
}


const stockRequests=new Map()
if(typeof onPrivateReset==='function')onPrivateReset(()=>stockRequests.clear())
export function validateStockChange(data){
 if(String(data.id??'').trim()===''||String(data.expected_quantity??'').trim()===''||(data.stock_action!=='retire'&&String(data.quantity??'').trim()===''))throw Error('Enter a whole quantity; empty fields are not zero.')
 const id=Number(data.id),action=data.stock_action,quantity=action==='retire'?0:Number(data.quantity),expected=Number(data.expected_quantity),reason=String(data.reason||'').trim()
 if(!Number.isSafeInteger(id)||id<=0||!['add','remove','set','retire'].includes(action)||!Number.isSafeInteger(quantity)||quantity<0||quantity>2147483647||(['add','remove'].includes(action)&&!quantity)||!Number.isSafeInteger(expected)||expected<0||!reason||reason.length>500)throw Error('Choose an action, enter a whole quantity and give a reason (up to 500 characters).')
 if(action==='remove'&&quantity>expected)throw Error('You cannot remove more stock than is currently available.')
 return {p_inventory_id:id,p_action:action,p_quantity:quantity,p_expected_quantity:expected,p_reason:reason}
}
export function pendingStockDraft(id){const request=stockRequests.get(authorityIdentity()+':'+Number(id));if(!request)return null;const p=request.payload;return {id:p.p_inventory_id,stock_action:p.p_action,quantity:p.p_quantity,expected_quantity:p.p_expected_quantity,reason:p.p_reason}}
export async function submitInventoryChange(data,owns=()=>true){
 const authority=captureAuthority(),current=()=>authority()&&owns()
 if(!current()||!retirementAvailable())return {ok:false}
 let payload
 try{payload=validateStockChange(data)}catch(error){showBlockingError(error.message);return {ok:false}}
 const key=authorityIdentity()+':'+payload.p_inventory_id,previous=stockRequests.get(key)
 if(previous&&JSON.stringify(previous.payload)!==JSON.stringify(payload)){showBlockingError('The original stock change is unconfirmed. Retry its original values before making a different change.');return {ok:false}}
 const request=previous||{request_id:crypto.randomUUID(),payload};stockRequests.set(key,request)
 const clear=()=>{if(stockRequests.get(key)===request)stockRequests.delete(key)}
 let response
 try{response=await sb.rpc('change_inventory_stock',{p_request_id:request.request_id,...request.payload})}
 catch{if(!current())return {ok:false,detached:true};showBlockingError('Stock result is unconfirmed. Retry these original values; request '+request.request_id+'.');return {ok:false}}
 if(!current()){if(authority()&&(!response.error&&response.data?.requestId===request.request_id||response.error?.code&&/^(22|23|40|42|P0)/.test(response.error.code)))clear();return {ok:false,detached:true}}
 if(response.error){
  if(response.error.code&&/^(22|23|40|42|P0)/.test(response.error.code))clear()
  showBlockingError(response.error.message||'Stock result is unconfirmed. Retry the original request.');return {ok:false}
 }
 if(response.data?.requestId!==request.request_id){showBlockingError('Stock confirmation is incomplete. Retry the original request.');return {ok:false}}
 clear();showTransactionSuccess(payload.p_action==='retire'?'Item permanently retired. History is preserved.':'Stock updated.');return {ok:true}
}
