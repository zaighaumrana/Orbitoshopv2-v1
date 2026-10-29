import {captureAuthority} from './ui-authority.js'
import {captureNavigation} from './router.js'
const modalWork=new WeakMap()
export class ViewExpired extends Error {}
export function captureView(){const authority=captureAuthority(),navigation=captureNavigation();return ()=>authority()&&navigation()}
export async function viewAwait(current,start,modal){
 if(!current())throw new ViewExpired()
 const selected=modal?.()
 let value
 try{value=await start()}catch(error){if(!current() || (modal&&selected!==modal()))throw new ViewExpired();throw error}
 if(!current() || (modal&&selected!==modal()))throw new ViewExpired()
 return value
}
export function listenOwned(target,type,owns,handler,onError){
 target.addEventListener(type,event=>{
  if(!owns())return
  const view=captureView(),current=()=>view()&&owns()
  let result
  const modal=['submit','click'].includes(type)?event.target?.closest?.('.modal'):null
  try{result=handler(event,current)}catch(error){if(current())onError?.(error);return}
  const busy=modal&&result?.then
  if(busy){modalWork.set(modal,(modalWork.get(modal)||0)+1);modal.dataset.uiBusy='true'}
  Promise.resolve(result).catch(error=>{
   if(current()&&!(error instanceof ViewExpired))onError?.(error)
  }).finally(()=>{if(busy){const remaining=modalWork.get(modal)-1;if(remaining)modalWork.set(modal,remaining);else{modalWork.delete(modal);delete modal.dataset.uiBusy}}})
 })
}
