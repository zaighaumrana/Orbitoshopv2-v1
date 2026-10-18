import {CONTRACT,UUID,fields,jsonBody,bearer,project,endpoint,actor,rpc,http,proof,sha,SupportError,fail} from './protocol.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
export function ticketHandler(env: (key:string)=>string|undefined,fetcher: typeof fetch=fetch) {
 return async(req: Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return Response.json({error:'POST required'},{status:405,headers:cors});
  try {
   const raw=await jsonBody(req),url=env('SUPABASE_URL')||'',ref=project(url),key=env('SUPABASE_ANON_KEY')||'';
   const secret=env('PLATFORM_SUPPORT_TICKETS_SECRET')||'',target=endpoint(env('PLATFORM_SUPPORT_TICKETS_ENDPOINT')||'',url);
   if(!/^[a-f0-9]{64}$/.test(secret)||[env('PLATFORM_BRIDGE_CALL_SECRET'),env('PLATFORM_BRIDGE_SOURCE_SECRET')].includes(secret))throw new SupportError(503);
   // Dedicated installation proof does not confer customer request authority.
   if(req.headers.has('x-support-probe')){
    const supplied=req.headers.get('x-support-probe')||'';
    if(supplied.length!==64 || await sha(supplied)!==await sha(await sha(secret)))throw new SupportError(401);
    if(!raw || raw.action!=='capability'||!UUID.test(raw.challenge||'')||Object.keys(raw).some(k=>!['action','challenge'].includes(k)))throw new SupportError(400);
    const service=env('SUPABASE_SERVICE_ROLE_KEY')||'';
    const c=await rpc(fetcher,url,service,service,'support_ticket_capability_context',{});
    const signed=[CONTRACT,raw.challenge,ref,c.source_id,c.client_binding,c.platform_client_id,target];
    return Response.json({contract:CONTRACT,challenge:raw.challenge,project_ref:ref,...c,endpoint:target,proof:await proof(await sha(secret),signed)},{headers:cors});
   }
   const body=fields(raw),token=bearer(req),context=await actor(fetcher,url,key,token);
   const forwarded={...body,contract:CONTRACT,project_ref:ref,source_id:context.source_id,client_binding:context.client_binding};
   const response=await http(fetcher,target,{Authorization:'Bearer '+secret,'X-Shop-User-Authorization':'Bearer '+token},forwarded);
   if(!response.ok)throw new SupportError([400,401,403,404,409,413,429,503].includes(response.status)?response.status:503);
   // Only fixed customer fields may reach the browser, even if upstream expands.
   const ticket=(t:any)=>{if(!t||!UUID.test(t.ticket_id||''))throw new SupportError(503);return Object.fromEntries(['ticket_id','subject','category','message','status','created_at','resolved_at','revision','resolution'].map(k=>[k,t[k]]));};
   let result:any;
   if(body.action==='create'){if(response.data?.accepted!==true||!UUID.test(response.data.ticket_id||''))throw new SupportError(503);result={accepted:true,ticket_id:response.data.ticket_id,status:response.data.status};}
   else if(body.action==='get')result={ticket:ticket(response.data?.ticket)};
   else{if(!Array.isArray(response.data?.tickets)||response.data.tickets.length>50)throw new SupportError(503);result={tickets:response.data.tickets.map(ticket),offset:body.offset,has_more:response.data.has_more===true};}
   return Response.json(result,{status:body.action==='create'?202:200,headers:cors});
  }catch(error){return fail(error,cors);}
 };
}
