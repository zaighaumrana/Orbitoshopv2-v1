import {retirementAvailable} from '../../inventory-state.js'
import {iconColumns,deviceBrands} from '../../catalog/data.js'
import {sb} from '../../shared.js'
import {legacyMembers} from '../../backend-reads.js'
import {readPage,searchColumns} from '../../bounded-read.js'

export function flatResource(module,tab) {
  return module==='inventory'?'inventory':module==='employees'?'employees':module==='catalog'?(tab==='brands'?'deviceBrands':tab==='components'?'repairComponents':'quickItems'):null
}
export function adminPage(module,tab,search,offset,current,size=25) {
  const key=flatResource(module,tab)
  if(key==='deviceBrands')return deviceBrands(current,{search,offset,size})
  const specs={
    inventory:['inventory','id,name,sku,category,qty,price,cost,min_qty',['name','sku','category'],'name'],
    employees:['employees','id,name,role,status,email',['name','email','role'],'name'],
    quickItems:['quick_items','id,name,prices,sort_order',['name'],'sort_order'],
    repairComponents:['repair_components','id,name,sort_order',['name'],'sort_order'],
  }
  const [table,columns,searchable,order]=specs[key]||[]
  if(!table)throw Error('This screen has no flat resource.')
  return readPage(()=>{const retirement=key==='inventory'&&retirementAvailable();let query=sb.from(table).select(key==='employees'?columns:iconColumns(columns)+(retirement?',retired_at,retirement_reason':''),{count:'exact'});if(retirement)query=tab==='retired'?query.not('retired_at','is',null):query.is('retired_at',null);return searchColumns(query,searchable,search).order(order).order('id')},{offset,size,current})
}
export async function verifiedLegacyMembers(table,current) {
  return legacyMembers(table,current)
}
