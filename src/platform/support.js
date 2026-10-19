import {recoveryStore} from './support-recovery.js';
// Unsent drafts remain in memory. An attempted request can survive this tab's
// refresh only after live Auth AND the canonical Shop actor/binding RPC agree.
export function createSupportClient(sb, options={}) {
 let owner=null,epoch=0,scope=null;
 let storage;try{storage=options.storage??globalThis.sessionStorage;}catch{}
 const recoverable=!!storage&&!!sb.auth.getUser&&!!sb.rpc;
 const recovery=recoveryStore(storage,options.now);
 const identityOf=s=>{try{const c=JSON.parse(atob(s.access_token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));return s.user.id+':'+c.session_id;}catch{return null;}};
 const view={tickets:[],offset:0,has_more:false,detail:null,error:'',busy:false,pending:null,draft:{subject:'',category:'technical',message:''},receipt:null};
 function reset(clear=true){epoch++;scope=null;if(clear)recovery.clear();Object.assign(view,{tickets:[],offset:0,has_more:false,detail:null,error:'',busy:false,pending:null,draft:{subject:'',category:'technical',message:''},receipt:null});}
 async function session(){const {data}=await sb.auth.getSession();const s=data?.session;
  // Refreshes preserve session_id; no JWT is retained as application state.
  const identity=identityOf(s);
  if(identity!==owner){reset(owner!==null||!identity);owner=identity;}
  if(!s||!identity)throw Error('Sign in again to use Support.');
  if(recoverable){
   const generation=epoch;
   let user,userError,actor,error;
   try{({data:user,error:userError}=await sb.auth.getUser());({data:actor,error}=await sb.rpc('support_ticket_actor_context'));}
   catch{reset(false);throw Error('Support authorization is unavailable. Reconnect before recovering this request.');}
   const {data:latest}=await sb.auth.getSession();
   if(generation!==epoch||identityOf(latest?.session)!==identity)throw Error('Support session changed.');
   if(userError||error||user?.user?.id!==s.user.id||actor?.auth_user_id!==s.user.id||identity!==actor.auth_user_id+':'+actor.session_id||!['Business Owner','Manager'].includes(actor.role)||!actor.source_id||!actor.client_binding||!Number.isSafeInteger(actor.platform_client_id)){
    reset();throw Error('Support authorization could not be verified. Sign in again.');
   }
   const verified=JSON.stringify([options.project??globalThis.location?.origin,identity,actor.role,actor.employee_id,actor.platform_client_id,actor.source_id,actor.client_binding]);
   if(scope!==verified){if(scope!==null)reset();scope=verified;view.pending=recovery.restore(scope);if(view.pending)view.draft={subject:view.pending.subject,category:view.pending.category,message:view.pending.message};}
  }
  return identity;
 }
 sb.auth.onAuthStateChange?.((_event,s)=>{const identity=identityOf(s);if(identity!==owner){reset(owner!==null||!identity);owner=identity;}});
 async function call(body){const identity=await session(),generation=epoch;
  const {data,error}=await sb.functions.invoke('support-tickets',{body});
  let failure;
  if(error||data?.error){let message=data?.error;try{message=(await error?.context?.json())?.error||message;}catch{}
   failure=Error(message||'Support is unavailable or not enabled. Retry the same request when access is restored.');failure.status=error?.context?.status;}
  // Error body parsing can yield too. Recheck AFTER every asynchronous response
  // step, before a stale 400 can clear a replacement account's pending request.
  await session();if(owner!==identity||epoch!==generation)throw Error('Support session changed.');
  if(failure){if([401,403].includes(failure.status))reset();throw failure;}
  return data;
 }
 return {view,reset,
  async list(offset=0){await session();const result=await call({action:'list',offset});Object.assign(view,{tickets:result.tickets,offset,has_more:result.has_more,detail:null});},
  async get(ticket_id){view.detail=(await call({action:'get',ticket_id})).ticket;},
  async create(){await session();if(!view.pending)view.pending={action:'create',request_id:crypto.randomUUID(),subject:view.draft.subject.trim(),category:view.draft.category,message:view.draft.message.trim()};
   if(recoverable)recovery.save(scope,view.pending);
   let result;try{result=await call(view.pending);}catch(error){if(error.status===400){view.pending=null;recovery.clear();}throw error;}view.receipt=result.ticket_id;view.pending=null;recovery.clear();view.draft={subject:'',category:'technical',message:''};return result;},
 };
}
