import {iconColumns} from '../../catalog/data.js'
import {sb,CFG} from '../../shared.js'
import {readPage,readComplete,searchColumns} from '../../bounded-read.js'

export const inventoryColumns='id,name,sku,category,qty,price'
export function stockPage(search,offset,current,size=24) {
  return readPage(()=>searchColumns(sb.from('inventory').select(iconColumns(inventoryColumns),{count:'exact'})
    .gt('qty',0),['name','sku','category'],search).order('name').order('id'),{offset,size,current})
}
export function quickPage(search,offset,current,size=25) {
  return readPage(()=>searchColumns(sb.from('quick_items').select(iconColumns('id,name,prices,sort_order'),{count:'exact'}),['name'],search)
    .order('sort_order').order('id'),{offset,size,current})
}
export function intakeComponents(current) {
  if(!CFG.repair_module_enabled)throw Error('Repair intake is unavailable.')
  return readComplete(()=>sb.from('repair_components').select(iconColumns('id,name,sort_order'),{count:'exact'})
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

