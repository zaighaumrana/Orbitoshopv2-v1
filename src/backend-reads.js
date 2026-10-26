import {sb,CFG} from './shared.js'
import {readComplete} from './bounded-read.js'
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
