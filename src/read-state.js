import {escapeHTML} from './html.js'
export async function settleRead(read){try{return await read}catch(error){return {data:null,error}}}
export function readStates(results,objects=[]){
 const values={},resources={}
 for(const [key,result] of Object.entries(results)){
  const valid=objects.includes(key)?result?.data&&typeof result.data==='object'&&!Array.isArray(result.data):Array.isArray(result?.data)
  const ready=!result?.error&&!!valid
  values[key]=ready?result.data:null
  resources[key]={status:ready?'ready':'unavailable'}
 }
 return {values,resources}
}
export function resourceReady(resources,...keys){return keys.every(k=>!resources?.[k]||resources[k].status==='ready'||resources[k].status==='disabled')}
export function resourceNotice(label,status='unavailable'){
 return `<div class="card" role="${status==='loading'?'status':'alert'}"><h2>${escapeHTML(label)} ${status==='loading'?'loading':'unavailable'}</h2><p>${status==='loading'?'Loading current data.':'Required data could not be verified completely. No empty or zero result is implied.'}</p>${status==='loading'?'':'<button type="button" class="secondary-button" data-action="retry-resources">Retry reads</button>'}</div>`
}
