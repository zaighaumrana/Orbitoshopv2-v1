// Extends the existing real-entry Auth fixture with existing-query semantics.
// Synthetic I/O only; it is not evidence of hosted RLS or database performance.
export function resourceFixture(){
 const sdk=window.fixtureSDK,originalFrom=sdk.from,originalRPC=sdk.rpc;
 window.resourceCalls=[];window.fixtureReleases=[];window.fixtureRPCReleases=[];window.fixtureWrites=[];
 const field=(row,path)=>path.split('.').reduce((value,key)=>value?.[key],row);
 const like=(value,pattern)=>{
  let regex='';const text=String(pattern).replace(/^"|"$/g,'');
  for(let i=0;i<text.length;i++){let c=text[i];if(c==='\\'&&i+1<text.length){c=text[++i];regex+=c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}else regex+=c==='%'||c==='*'?'.*':c==='_'?'.':c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
  return new RegExp('^'+regex+'$','i').test(String(value??''));
 };
 const orMatch=(row,value)=>{
  const parts=String(value).match(/(?:"(?:\\.|[^"])*"|[^,])+/g)||[];
  return parts.some(part=>{const m=/^(.*)\.(ilike|eq|is|gt)\.(.*)$/.exec(part);if(!m)return false;const [,column,op,argument]=m,v=field(row,column);return op==='ilike'?like(v,argument):op==='is'?argument==='null'?v==null:v===argument:op==='gt'?Number(v)>Number(argument):String(v)===argument});
 };
 sdk.from=table=>{
  if(table==='app_users')return originalFrom(table);
  const ops=[],q={};
  for(const name of ['select','eq','is','in','neq','gt','gte','lt','lte','not','order','limit','range','ilike','or','abortSignal','update','insert','upsert','delete','single','maybeSingle'])q[name]=(...args)=>{ops.push([name,...args]);return q};
  q.then=(yes,no)=>{
   const work=async()=>{
    const child=ops.some(([op,column])=>(op==='in'||op==='eq')&&column==='parent_ticket_id');
    window.fixtureCalls.push({table,child});window.resourceCalls.push({table,ops:structuredClone(ops)});
    if(window.fixtureReadFailures?.includes(table)||(child&&window.fixtureFailChildren))return {data:null,error:Error('synthetic denied read'),count:null};
    let rows=[...(window.fixtureRows?.[table]||[])],countRequested=false,head=false,projection='*',offset=0,size=window.fixtureCap||1000,single=false,maybe=false;
    const orders=[];let mutation=null;
    for(const [op,...a] of ops){
     if(op==='select'){projection=a[0]||'*';countRequested=!!a[1]?.count;head=!!a[1]?.head}
     if(op==='eq')rows=rows.filter(r=>String(field(r,a[0]))===String(a[1]));
     if(op==='is')rows=rows.filter(r=>(field(r,a[0])??null)===a[1]);
     if(op==='in')rows=rows.filter(r=>a[1].includes(field(r,a[0])));
     if(op==='neq')rows=rows.filter(r=>field(r,a[0])!==a[1]);
     if(op==='gt')rows=rows.filter(r=>field(r,a[0])>a[1]);
     if(op==='gte')rows=rows.filter(r=>field(r,a[0])>=a[1]);
     if(op==='lt')rows=rows.filter(r=>field(r,a[0])<a[1]);
     if(op==='lte')rows=rows.filter(r=>field(r,a[0])<=a[1]);
     if(op==='not'&&a[1]==='in'){const values=a[2].replace(/[()\"]/g,'').split(',');rows=rows.filter(r=>!values.includes(field(r,a[0])))}
     if(op==='ilike')rows=rows.filter(r=>like(field(r,a[0]),a[1]));
     if(op==='or')rows=rows.filter(r=>orMatch(r,a[0]));
     if(op==='order')orders.push(a);
     if(op==='range'){offset=a[0];size=Math.min(size,a[1]-a[0]+1)}
     if(op==='limit')size=Math.min(size,a[0]);
     if(op==='single')single=true;
     if(op==='maybeSingle'){single=true;maybe=true}
     if(['update','insert','upsert','delete'].includes(op))mutation={kind:op,values:a[0]};
    }
    if(mutation){window.fixtureWrites.push({table,...mutation});rows=mutation.values?[{id:900001,...mutation.values}]:[]}
    rows.sort((x,y)=>{for(const [column,options] of orders){const a=field(x,column),b=field(y,column);if(a<b)return options?.ascending===false?1:-1;if(a>b)return options?.ascending===false?-1:1}return 0});
    const count=rows.length;rows=rows.slice(offset,offset+size);
    if(projection!=='*'&&!projection.includes('*')&&!projection.includes('(')){const columns=projection.split(',').map(c=>c.trim());rows=rows.map(row=>Object.fromEntries(columns.map(c=>[c,row[c]])))}
    const result=single&&rows.length!==1&&(!maybe||rows.length)?{data:null,error:Error('expected one selected record'),count:null}:{data:head?null:single?rows[0]||null:rows,error:null,count:countRequested?count:null};
    const snapshot=structuredClone({...result,error:result.error?{message:result.error.message}:null});
    if(window.fixtureHoldTable===table){window.fixtureHoldTable=null;return new Promise(resolve=>window.fixtureReleases.push(()=>resolve(snapshot)))}
    return snapshot;
   };return work().then(yes,no);
  };return q;
 };
 sdk.rpc=async(name,args)=>{
  window.resourceCalls.push({rpc:name,args:structuredClone(args)});
  let result;
  if(window.fixtureReadFailures?.includes(name))result={data:null,error:Error('synthetic denied read')};
  else if(name==='get_financial_report')result={data:{invoiced:999,paymentsCollected:800,netPayments:750,udharOutstanding:30,invoiceCount:123,period:{from:args.p_from,to:args.p_to,actorOnly:args.p_actor_only}}};
  else if(name==='get_retail_return_context')result={data:{sale:{id:args.p_sale_id,invoiceNumber:'INV2026102500',createdAt:'2026-10-25T12:00:00Z'},items:[],financial:{}}};
  else if(name==='get_repair_family_summary'){
   const root=(window.fixtureRows?.tickets||[]).find(r=>String(r.id)===String(args.p_ticket_id));
   result=window.fixtureRevokeConsent?{data:null,error:Error('consent revoked')}:{data:{root,invoices:root?[root]:[],effectiveObligation:100,netPayments:58,outstanding:42}};
  }else result=await originalRPC(name,args);
  if(window.fixtureHoldRPC===name){window.fixtureHoldRPC=null;return new Promise(resolve=>window.fixtureRPCReleases.push(()=>resolve(result)))}
  return result;
 };
}
