import registry from './registry-v1.json' with {type:'json'}
export const iconContexts={catalog:'Catalog items',repair:'Repair components',inventory:'Inventory items',brands:'Device brands'}
export const contextCategories={catalog:['accessory','repair','service','generic'],repair:['repair','generic'],inventory:['accessory','repair','service','generic'],brands:['brand','generic']}
let preferences=new Map()
export const allowedContexts=asset=>Object.keys(iconContexts).filter(context=>contextCategories[context].includes(asset.category))
// Isolated Shop configuration only; no browser storage or mutable artwork.
export function setIconPreferences(rows=[]){
 preferences=new Map()
 if(!Array.isArray(rows))return
 for(const row of rows){
  const asset=registry.assets.find(a=>a.id===row.icon_id)
  if(!asset||typeof row.display_name!=='string'||!row.display_name.trim()||row.display_name.length>80||!Array.isArray(row.enabled_contexts))continue
  preferences.set(asset.id,{display_name:row.display_name.trim(),enabled_contexts:row.enabled_contexts.filter(c=>allowedContexts(asset).includes(c))})
 }
}
export const iconLabel=asset=>preferences.get(asset.id)?.display_name||asset.displayName
export const enabledContexts=asset=>preferences.get(asset.id)?.enabled_contexts??allowedContexts(asset)
export const iconOffered=(asset,context)=>enabledContexts(asset).includes(context)
