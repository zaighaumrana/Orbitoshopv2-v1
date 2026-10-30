import registry from './registry-v1.json' with {type:'json'}
import {artwork} from './artwork.js'
import {escapeHTML} from '../html.js'
import {iconLabel,iconOffered} from './icon-preferences.js'
export {registry}
export const metadata=new Map(registry.assets.map(a=>[a.id,a]))
export {artwork}
export const normalizeBrand=value=>String(value||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/gu,' ')
export const iconAllowed=(id,categories)=>!id||metadata.has(id)&&categories.includes(metadata.get(id).category)
export function resolveIcon(id,category='generic',bundled=artwork,entries=metadata){
 const fallback=registry.categories[category]?.fallbackId||'generic.item'
 let next=entries.has(id)&&[category,'generic'].includes(entries.get(id).category)?id:fallback
 const visited=new Set()
 while(next&&!visited.has(next)){
  visited.add(next)
  if(Object.hasOwn(bundled,next))return {id:next,svg:bundled[next]}
  if(next==='generic.item')break
  next=entries.get(next)?.fallbackId||'generic.item'
 }
 if(!visited.has('generic.item')&&Object.hasOwn(bundled,'generic.item'))return {id:'generic.item',svg:bundled['generic.item']}
 return {id:fallback,svg:null}
}
export function itemCategory(id,allowed=['accessory','repair','service','generic']){
 const category=metadata.get(id)?.category
 return allowed.includes(category)?category:'generic'
}
export function iconHTML(id,category='generic'){
 const icon=resolveIcon(id,category)
 return icon.svg?icon.svg.replace('<svg ','<svg class="rs-item-icon" aria-hidden="true" focusable="false" '):'<span class="rs-item-icon rs-icon-placeholder" aria-hidden="true">â–¡</span>'
}
export function iconSelector(name,value='',categories=['accessory','repair','service','generic'],context='catalog'){
 const assets=registry.assets.filter(a=>categories.includes(a.category)&&(a.id===value||iconOffered(a,context)))
 const current=metadata.get(value),label=value?(current?iconLabel(current):'Keep existing assignment'):'Generic fallback'
 const choice=(id,text,category)=>`<label class="rs-icon-choice"><input type="radio" name="${escapeHTML(name)}" value="${escapeHTML(id)}" ${id===value?'checked':''}><span class="rs-icon-choice-content">${iconHTML(id,category)}<span>${escapeHTML(text)}</span></span></label>`
 return `<div class="field"><span>Icon</span><details class="rs-icon-picker" data-ui-key="icon-picker-${escapeHTML(name)}"><summary aria-label="Choose icon"><span class="rs-icon-choice-content">${iconHTML(value,current?.category||'generic')}<span>${escapeHTML(label)}</span></span></summary><div class="rs-icon-options" role="group" aria-label="Icon choices">${choice('','Generic fallback','generic')}${value&&!assets.some(a=>a.id===value)?choice(value,'Keep existing assignment',current?.category||'generic'):''}${assets.map(a=>choice(a.id,iconLabel(a),a.category)).join('')}</div></details></div>`
}
// Native details + radios keep keyboard access and ordinary FormData submission.
if(typeof document!=='undefined')document.addEventListener('change',event=>{
 const picker=event.target.closest?.('.rs-icon-picker')
 if(!picker||event.target.type!=='radio')return
 const summary=picker.querySelector('summary')
 summary.replaceChildren(event.target.closest('label').querySelector('.rs-icon-choice-content').cloneNode(true))
 picker.open=false;summary.focus()
})
export function brandIcon(text,brands=[]){
 const normalized=normalizeBrand(text),configured=brands.find(b=>normalizeBrand(b.display_name)===normalized)
 if(configured)return configured.icon_id||'brand.generic_phone'
 return registry.assets.find(a=>a.category==='brand'&&a.aliases.includes(normalized))?.id||'brand.generic_phone'
}
export function brandChoices(brands){
 return brands===null?registry.assets.filter(a=>a.category==='brand'&&a.id!=='brand.generic_phone').map(a=>({display_name:a.displayName,aliases:a.aliases})):brands.filter(b=>b.enabled).map(b=>({...b,aliases:(metadata.get(b.icon_id)?.aliases||[]).filter(a=>a!==normalizeBrand(b.display_name))}))
}
