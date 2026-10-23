import {rpc,http,SupportError,UUID} from './protocol.ts';
// Durable Shop acceptance is separate from verified Platform acceptance. Retries
// always revalidate a live original actor; no JWT is saved for a background worker.
export async function deliverSubmission(fetcher:typeof fetch,url:string,key:string,service:string,token:string,target:string,secret:string,body:any,context:any){
 const fields={subject:body.subject,category:body.category,message:body.message};
 const saved=await rpc(fetcher,url,key,token,'support_submission',{p_request:body.request_id,p_fields:fields});
 if(saved.state==='acknowledged'&&UUID.test(saved.ticket_id||''))return {accepted:true,ticket_id:saved.ticket_id,status:saved.status};
 const pending=(state:string)=>({persisted:true,accepted:false,request_id:body.request_id,delivery_state:state});
 const claim=await rpc(fetcher,url,key,token,'support_delivery_claim',{p_request:body.request_id});
 if(!claim.dispatch)return pending(claim.state);
 let outcome='uncertain',ticket:string|null=null,status:string|null=null;
 try{
  const response=await http(fetcher,target,{Authorization:'Bearer '+secret,'X-Shop-User-Authorization':'Bearer '+token},{...body,contract:'retrasell-support-v1',project_ref:new URL(url).hostname.split('.')[0],source_id:context.source_id,client_binding:context.client_binding});
  if(response.ok&&response.data?.accepted===true&&UUID.test(response.data.ticket_id||'')&&['Open','Resolved'].includes(response.data.status)){outcome='acknowledged';ticket=response.data.ticket_id;status=response.data.status;}
  else if([400,401,403,404,409].includes(response.status))outcome='review';
 }catch{/* A lost response never proves rejection; persist original identity. */}
 try{
  const done=await rpc(fetcher,url,service,service,'support_delivery_finish',{p_request:body.request_id,p_lease:claim.lease_id,p_outcome:outcome,p_ticket:ticket,p_status:status});
  if(done===true&&outcome==='acknowledged')return {accepted:true,ticket_id:ticket,status};
 }catch{/* The sending lease remains durable; later original-ID replay deduplicates. */}
 return pending(outcome==='review'?'review':'uncertain');
}
