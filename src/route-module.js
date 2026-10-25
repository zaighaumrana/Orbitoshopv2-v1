// A failed module fetch is cached by browsers. Retry only that same-origin
// operational module with a fresh URL, then retain its successful namespace.
export function routeModule(loader,name){
 let loaded=null,failedURL=null,attempt=0
 return async()=>{
  if(loaded)return loaded
  try{
   loaded=failedURL?await import(/* @vite-ignore */ retryURL(failedURL,++attempt)):await loader()
   return loaded
  }catch(error){
   const candidate=String(error?.message||'').match(/https?:\/\/[^\s"'<>]+/)?.[0]
   if(/fetch dynamically imported module|importing a module script/i.test(error?.message||'')&&candidate){
    const url=new URL(candidate,location.origin)
    if(url.origin===location.origin&&(url.pathname===`/src/${name==='admin'?'admin':'pos'}/${name}.js`||new RegExp(`^/assets/${name}-[A-Za-z0-9_-]+\\.js$`).test(url.pathname)))failedURL=url
   }
   throw error
  }
 }
}
function retryURL(url,attempt){const next=new URL(url);next.searchParams.set('shop_route_retry',String(attempt));return next.href}
