import {sb,CFG} from './shared.js'
import {readPage,readComplete} from './bounded-read.js'
import {buildReceiptRecords,filterReceiptRecords} from './features/admin/checkout/receipts.js'

// Bootstrap availability only. Every RPC independently enforces the current
// native actor, role, modules, lifecycle, consent and table RLS on the server.
export const hasReadContract=name=>CFG.read_contracts?.[name]===1
export function decodeReadPage(body,{offset=0,size=25}={}) {
  if(body?.contract!==1||body.offset!==offset||body.size!==size||!Number.isSafeInteger(body.count)||body.count<0||!Array.isArray(body.rows)||body.rows.length>size)
    throw Error('Read contract could not be verified.')
  if(offset>body.count||body.count<offset+body.rows.length||(offset<body.count&&!body.rows.length&&body.mode!=='family'))throw Error('Matching records changed. Retry reads.')
  const seen=new Set()
  for(const row of body.rows){const key=row.key??row.id;if(typeof row.id==='number'&&!Number.isSafeInteger(row.id))throw Error('Read identity exceeds the verified numeric bound.');if(key===undefined||seen.has(String(key)))throw Error('Read contract returned duplicate identities.');seen.add(String(key))}
  return {data:body.rows,count:body.count,offset,size,hasMore:offset+body.rows.length<body.count,nextOffset:offset+body.rows.length,error:null}
}
async function invoke(name,args,current){
  if(!current())throw Error('Read owner expired.')
  const result=await sb.rpc(name,args)
  if(!current())throw Error('Read owner expired.')
  if(result.error)throw result.error
  return result.data
}
async function families(ids,current) {
  if(!ids.length)return []
  if(ids.length>50||ids.some(id=>!/^\d+$/.test(String(id))||typeof id==='number'&&!Number.isSafeInteger(id)))throw Error('Invalid family selection.')
  const roots=await readComplete(()=>sb.from('tickets').select('*',{count:'exact'}).in('id',ids).is('parent_ticket_id',null).order('id'),{current,maxRows:50})
  if(roots.data.length!==ids.length)throw Error('Selected roots changed. Retry reads.')
  const children=await readComplete(()=>sb.from('tickets').select('*',{count:'exact'}).in('parent_ticket_id',ids).order('created_at').order('id'),{current})
  const byId=new Map(roots.data.map(row=>[String(row.id),row]))
  if(ids.some(id=>!byId.has(String(id))))throw Error('Selected roots changed. Retry reads.')
  return [...ids.map(id=>byId.get(String(id))),...children.data]
}
export async function repairFamilyPage({search='',context='admin',status='all',offset=0,size=25,current=()=>true}={}) {
  if(!hasReadContract('repair_families'))throw Error('Complete family paging is unavailable on this backend.')
  const body=await invoke('get_repair_family_page',{p_search:search.trim(),p_context:context,p_status:status,p_offset:offset,p_limit:size},current)
  const counts=body.statusCounts
  if(!counts||typeof counts!=='object'||Array.isArray(counts)||Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0))throw Error('Family status counts could not be verified.')
  const scopeCount=Object.values(counts).reduce((sum,n)=>sum+n,0)
  if(!Number.isSafeInteger(scopeCount)||(status==='all'?scopeCount!==body.count:(counts[status]||0)!==body.count))throw Error('Family status counts changed. Retry reads.')
  const page=decodeReadPage(body,{offset,size}),ids=page.data.map(r=>r.id)
  return {...page,rootIds:ids,statusCounts:body.statusCounts||{},data:await families(ids,current)}
}
export function receiptPeriod(filters) {
  const date=value=>{const parts=String(value).split('-').map(Number);return new Date(parts[0],parts[1]-1,parts[2])}
  const from=filters.receiptDateFrom?date(filters.receiptDateFrom):null,to=filters.receiptDateTo?date(filters.receiptDateTo):null
  if(to)to.setDate(to.getDate()+1)
  return {p_from:from?.toISOString()||null,p_to:to?.toISOString()||null}
}
export async function receiptArchivePage(filters,{offset=0,size=25,current=()=>true}={}) {
  if(!hasReadContract('receipt_archive'))throw Error('Receipt paging is unavailable on this backend.')
  const body=await invoke('get_receipt_archive_page',{p_search:String(filters.receiptSearch||'').trim(),p_type:filters.receiptType||'all',...receiptPeriod(filters),p_offset:offset,p_limit:size},current)
  const page=decodeReadPage(body,{offset,size})
  if(body.mode==='family'){
    if(!Array.isArray(body.matches)||body.matches.length>50)throw Error('Family selection could not be verified.')
    const ids=[...new Set(body.matches.map(m=>m.rootTicketId))]
    const selected=await families(ids,current)
    const records=filterReceiptRecords(buildReceiptRecords([],selected.sort((a,b)=>Number(b.id)-Number(a.id))),filters)
    if(records.length!==body.count)throw Error('Selected invoice family changed. Retry reads.')
    return {...page,data:records,offset:0,hasMore:false,nextOffset:records.length,mode:'family'}
  }
  if(body.mode!=='page')throw Error('Unknown receipt read contract.')
  return {...page,mode:'page'}
}

// Compatibility for older releases: complete small histories remain searchable;
// larger histories use root pages and explicit exact identifiers, never a capped
// array presented as a complete family/archive. No new backend RPC is required.
const exactPattern=value=>'"'+String(value||'').trim().replace(/[\\%_"*]/g,'\\$&')+'"'
export async function legacyMembers(table,current=()=>true){
  const query=()=>sb.from(table).select('*',{count:'exact'}).order('id',{ascending:false})
  const first=await readPage(query,{size:1000,current})
  if(first.count>1000){const error=Error('Use an exact ticket or invoice number to search this history.');error.code='HISTORY_REQUIRES_LOOKUP';throw error}
  let initial=true
  return readComplete(()=>{if(initial){initial=false;return {range:async()=>({data:first.data,count:first.count})}}return query()},{current,size:1000,maxRows:1000})
}
export async function legacyFamilyPage({search='',context='admin',offset=0,size=25,current=()=>true,exactOnly=false}={}){
  if(!exactOnly){try{return await legacyMembers('tickets',current)}catch(error){if(error.code!=='HISTORY_REQUIRES_LOOKUP')throw error}}
  let page,ids
  if(String(search).trim()){
    const pattern=exactPattern(search)
    const selected=await readComplete(()=>sb.from('tickets').select('id,parent_ticket_id',{count:'exact'})
      .or(`invoice_number.ilike.${pattern},ticket_number.ilike.${pattern}`).order('id'),{current,maxRows:50})
    ids=[...new Set(selected.data.map(t=>t.parent_ticket_id||t.id))]
    page={count:ids.length,offset:0,size:50,hasMore:false,nextOffset:ids.length}
  }else{
    page=await readPage(()=>sb.from('tickets').select('id',{count:'exact'}).is('parent_ticket_id',null)
      .order('created_at',{ascending:false}).order('id',{ascending:false}),{offset,size,current})
    ids=page.data.map(t=>t.id)
  }
  return {...page,data:await families(ids,current),rootIds:ids,mode:'exact-identifiers',error:null}
}
export async function legacyReceiptLookup(filters,{current=()=>true}={}){
  const search=String(filters.receiptSearch||'').trim(),pattern=exactPattern(search)
  if(!search)return {data:[],count:0,offset:0,size:25,hasMore:false,nextOffset:0,mode:'exact-lookup',error:null}
  const legacyId=/^INV-(\d+)$/i.exec(search)?.[1]
  const sales=await readComplete(()=>{
    let query=sb.from('sales').select('*',{count:'exact'})
    return (legacyId?query.or(`invoice_number.ilike.${pattern},id.eq.${legacyId}`):query.ilike('invoice_number',search.replace(/[\\%_*]/g,'\\$&'))).order('id',{ascending:false})
  },{current,maxRows:50})
  const exactSales=sales.data.filter(s=>String(s.invoice_number||`INV-${s.id}`).trim().toLowerCase()===search.toLowerCase())
  let tickets=[]
  if(CFG.repair_module_enabled){
    const matching=await readComplete(()=>sb.from('tickets').select('id,parent_ticket_id',{count:'exact'})
      .ilike('invoice_number',search.replace(/[\\%_*]/g,'\\$&')).order('id'),{current,maxRows:50})
    const linkedIds=[...new Set(exactSales.map(s=>s.ticket_id).filter(Boolean))]
    const linked=linkedIds.length?await readComplete(()=>sb.from('tickets').select('id,parent_ticket_id',{count:'exact'})
      .in('id',linkedIds).order('id'),{current,maxRows:50}):{data:[]}
    if(linked.data.length!==linkedIds.length)throw Error('Linked receipt identity could not be verified.')
    const ids=[...new Set([...matching.data,...linked.data].map(t=>t.parent_ticket_id||t.id))]
    tickets=await families(ids,current)
  }
  const records=filterReceiptRecords(buildReceiptRecords(exactSales,tickets.sort((a,b)=>Number(b.id)-Number(a.id))),filters)
  return {data:records,count:records.length,offset:0,size:records.length||25,hasMore:false,nextOffset:records.length,mode:'exact-lookup',error:null}
}