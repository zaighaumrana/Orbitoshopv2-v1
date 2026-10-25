import {sb} from '../../shared.js'
import {readPage,searchColumns} from '../../bounded-read.js'

export function flatResource(module,tab) {
  return module==='inventory'?'inventory':module==='employees'?'employees':module==='catalog'?(tab==='components'?'repairComponents':'quickItems'):null
}
export function adminPage(module,tab,search,offset,current,size=25) {
  const key=flatResource(module,tab)
  const specs={
    inventory:['inventory','id,name,sku,category,qty,price,cost,min_qty',['name','sku','category'],'name'],
    employees:['employees','id,name,role,status,email',['name','email','role'],'name'],
    quickItems:['quick_items','id,name,prices,sort_order',['name'],'sort_order'],
    repairComponents:['repair_components','id,name,sort_order',['name'],'sort_order'],
  }
  const [table,columns,searchable,order]=specs[key]||[]
  if(!table)throw Error('This screen has no flat resource.')
  return readPage(()=>searchColumns(sb.from(table).select(columns,{count:'exact'}),searchable,search)
    .order(order).order('id'),{offset,size,current})
}
export async function verifiedLegacyMembers(table,current) {
  const result=await sb.from(table).select('*',{count:'exact'}).order('id',{ascending:false}).range(0,999)
  if(!current())throw Error('Read owner expired.')
  if(result.error||!Array.isArray(result.data)||result.count!==result.data.length)
    throw Error('Complete history is unavailable. No truncated list or family count is implied.')
  return result
}
