import {sb,CFG} from '../../shared.js'
import {readPage,readComplete,searchColumns} from '../../bounded-read.js'

export const inventoryColumns='id,name,sku,category,qty,price'
export function stockPage(search,offset,current) {
  return readPage(()=>searchColumns(sb.from('inventory').select(inventoryColumns,{count:'exact'})
    .gt('qty',0),['name','sku','category'],search).order('name').order('id'),{offset,size:24,current})
}
export function quickPage(search,offset,current) {
  return readPage(()=>searchColumns(sb.from('quick_items').select('id,name,prices,sort_order',{count:'exact'}),['name'],search)
    .order('sort_order').order('id'),{offset,size:25,current})
}
export function intakeComponents(current) {
  if(!CFG.repair_module_enabled)throw Error('Repair intake is unavailable.')
  return readComplete(()=>sb.from('repair_components').select('id,name,sort_order',{count:'exact'})
    .order('sort_order').order('id'),{current})
}
export async function completeTicketSelection(id,current) {
  const selected=await sb.from('tickets').select('*').eq('id',id).single()
  if(!current())throw Error('Read owner expired.')
  if(selected.error||!selected.data)throw Error('Selected repair is unavailable.')
  const rootId=selected.data.parent_ticket_id||selected.data.id
  const root=String(rootId)===String(id)?selected:await sb.from('tickets').select('*').eq('id',rootId).single()
  if(!current())throw Error('Read owner expired.')
  if(root.error||!root.data)throw Error('Parent repair is unavailable.')
  const children=await readComplete(()=>sb.from('tickets').select('*',{count:'exact'})
    .eq('parent_ticket_id',rootId).order('created_at').order('id'),{current})
  return {data:[root.data,...children.data],error:null}
}

// Compatibility read while the unified family-search contract awaits approval.
// Never present a capped member array as complete. No all-history paging at boot.
export async function legacyCompleteCollection(current) {
  const result=await sb.from('tickets').select('*',{count:'exact'}).order('id',{ascending:false}).range(0,999)
  if(!current())throw Error('Read owner expired.')
  if(result.error||!Array.isArray(result.data)||result.count!==result.data.length)
    throw Error('Complete repair search is unavailable for this history size. The family-page backend contract is required; no partial results are implied.')
  return result
}
