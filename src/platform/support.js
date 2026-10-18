// Drafts and uncertain request identities live only in this tab's current session.
// No central client, server credential or transient access token is stored here.
export function createSupportClient(sb) {
 let owner=null,epoch=0;
 const identityOf=s=>{try{const c=JSON.parse(atob(s.access_token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));return s.user.id+':'+c.session_id;}catch{return null;}};
 const view={tickets:[],offset:0,has_more:false,detail:null,error:'',busy:false,pending:null,draft:{subject:'',category:'technical',message:''},receipt:null};
 function reset(){epoch++;Object.assign(view,{tickets:[],offset:0,has_more:false,detail:null,error:'',busy:false,pending:null,draft:{subject:'',category:'technical',message:''},receipt:null});}
 async function session(){const {data}=await sb.auth.getSession();const s=data?.session;
  // Refreshes preserve session_id; no JWT is retained as application state.
  const identity=identityOf(s);
  if(identity!==owner){reset();owner=identity;}
  if(!s||!identity)throw Error('Sign in again to use Support.');return identity;
 }
 sb.auth.onAuthStateChange?.((_event,s)=>{const identity=identityOf(s);if(identity!==owner){reset();owner=identity;}});
 async function call(body){const identity=await session(),generation=epoch;
  const {data,error}=await sb.functions.invoke('support-tickets',{body});
  await session();if(owner!==identity||epoch!==generation)throw Error('Support session changed.');
  if(error||data?.error){let message=data?.error;try{message=(await error?.context?.json())?.error||message;}catch{}
   const failure=Error(message||'Support is unavailable or not enabled. Retry the same request when access is restored.');failure.status=error?.context?.status;throw failure;}
  return data;
 }
 return {view,reset,
  async list(offset=0){await session();const result=await call({action:'list',offset});Object.assign(view,{tickets:result.tickets,offset,has_more:result.has_more,detail:null});},
  async get(ticket_id){view.detail=(await call({action:'get',ticket_id})).ticket;},
  async create(){await session();if(!view.pending)view.pending={action:'create',request_id:crypto.randomUUID(),subject:view.draft.subject.trim(),category:view.draft.category,message:view.draft.message.trim()};
   let result;try{result=await call(view.pending);}catch(error){if(error.status===400)view.pending=null;throw error;}view.receipt=result.ticket_id;view.pending=null;view.draft={subject:'',category:'technical',message:''};return result;},
 };
}
