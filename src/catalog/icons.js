import registry from './registry-v1.json' with {type:'json'}
import {escapeHTML} from '../html.js'
export {registry}
export const metadata=new Map(registry.assets.map(a=>[a.id,a]))
// Artwork intake is pending. Populate only with reviewed, literal local imports.
export const artwork=Object.freeze({})
export const normalizeBrand=value=>String(value||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/gu,' ')
export const iconAllowed=(id,categories)=>!id||metadata.has(id)&&categories.includes(metadata.get(id).category)
export function resolveIcon(id,category='generic',bundled=artwork,entries=metadata){
 const fallback=registry.categories[category]?.fallbackId||'generic.item'
 let next=entries.has(id)&&[category,'generic'].includes(entries.get(id).category)?id:fallback
 const visited=new Set()
 while(next&&!visited.has(next)){
  visited.add(next)
  if(Object.hasOwn(bundled,next))return {id:next,url:bundled[next]}
  if(next==='generic.item')break
  next=entries.get(next)?.fallbackId||'generic.item'
 }
 if(!visited.has('generic.item')&&Object.hasOwn(bundled,'generic.item'))return {id:'generic.item',url:bundled['generic.item']}
 return {id:fallback,url:null}
}
export function itemCategory(id,allowed=['accessory','repair','service','generic']){
 const category=metadata.get(id)?.category
 return allowed.includes(category)?category:'generic'
}
export function iconHTML(id,category='generic'){
 const icon=resolveIcon(id,category)
 return icon.url?'<img class="rs-item-icon" alt="" src="'+escapeHTML(icon.url)+'">':'<span class="rs-item-icon rs-icon-placeholder" aria-hidden="true">□</span>'
}
export function iconSelector(name,value='',categories=['accessory','repair','service','generic']){
 const unknown=value&&!iconAllowed(value,categories)
 return '<label class="field"><span>Icon · artwork pending</span><select name="'+escapeHTML(name)+'"><option value="">Generic fallback</option>'+
  (unknown?'<option selected value="'+escapeHTML(value)+'">Keep existing assignment</option>':'')+
  registry.assets.filter(a=>categories.includes(a.category)).map(a=>'<option value="'+a.id+'" '+(value===a.id?'selected':'')+'>'+escapeHTML(a.displayName)+'</option>').join('')+'</select></label>'
}
export function brandIcon(text,brands=[]){
 const normalized=normalizeBrand(text),configured=brands.find(b=>normalizeBrand(b.display_name)===normalized)
 if(configured)return configured.icon_id||'brand.generic_phone'
 return registry.assets.find(a=>a.category==='brand'&&a.aliases.includes(normalized))?.id||'brand.generic_phone'
}
export function brandChoices(brands){
 return brands===null?registry.assets.filter(a=>a.category==='brand'&&a.id!=='brand.generic_phone').map(a=>({display_name:a.displayName,aliases:a.aliases})):brands.filter(b=>b.enabled).map(b=>({...b,aliases:(metadata.get(b.icon_id)?.aliases||[]).filter(a=>a!==normalizeBrand(b.display_name))}))
}
