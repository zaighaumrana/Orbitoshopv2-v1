import {captureAuthority} from './ui-authority.js'
import {captureNavigation} from './router.js'
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
  try{result=handler(event,current)}catch(error){if(current())onError?.(error);return}
  Promise.resolve(result).catch(error=>{
   if(current()&&!(error instanceof ViewExpired))onError?.(error)
  })
 })
}
