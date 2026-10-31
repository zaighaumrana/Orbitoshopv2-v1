import {registry,iconHTML} from './icons.js'
import {allowedContexts,enabledContexts,iconLabel,iconContexts} from './icon-preferences.js'
import {escapeHTML} from '../html.js'
export function iconSettingsHTML(available){
 return `<section class="card rs-icon-settings"><h2>Icons</h2><p class="muted">Rename icon labels and choose where they are offered. Item names, existing assignments and the approved artwork stay unchanged. Generic fallback is always available.</p>${available?'':'<p role="status">Saving icon preferences requires the reviewed Shop backend upgrade. Default icons remain available.</p>'}<form data-form="icon-settings"><fieldset ${available?'':'disabled'}><legend class="rs-icon-settings-legend">Icon labels and form choices</legend><div class="rs-icon-settings-grid">${registry.assets.map(a=>`<section class="rs-icon-settings-row" data-icon-id="${a.id}"><div class="rs-icon-preview">${iconHTML(a.id,a.category)}</div><label class="field"><span>${escapeHTML(a.displayName)}</span><input name="label:${a.id}" value="${escapeHTML(iconLabel(a))}" maxlength="80" required></label><div class="rs-icon-contexts">${allowedContexts(a).map(context=>`<label><input type="checkbox" name="contexts:${a.id}" value="${context}" ${enabledContexts(a).includes(context)?'checked':''}>${iconContexts[context]}</label>`).join('')}</div></section>`).join('')}</div><div class="modal-actions"><button class="primary-button">Save icon preferences</button></div></fieldset></form></section>`
}
export function iconSettingsValues(form){
 const data=new FormData(form)
 return registry.assets.map(a=>{
  const display_name=String(data.get('label:'+a.id)||'').trim()
  if(!display_name||display_name.length>80)throw Error('Enter a label of 1–80 characters for every icon.')
  return {icon_id:a.id,display_name,enabled_contexts:data.getAll('contexts:'+a.id).filter(c=>allowedContexts(a).includes(c))}
 })
}
