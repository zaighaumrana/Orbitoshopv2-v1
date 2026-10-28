// Existing authenticated PostgREST reads only. The caller supplies a fresh,
// filtered, projected query with count:'exact' and a unique final order column.
// A smaller API cap advances by actual rows, never assumes a short page is EOF.
export async function readPage(query,{offset=0,size=25,current=()=>true}={}) {
  if(!current())throw Error('Read owner expired.')
  const result=await query().range(offset,offset+size-1)
  if(!current())throw Error('Read owner expired.')
  if(result.error)throw result.error
  const {data,count}=result
  if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||data.length>size)
    throw Error('Page completeness could not be verified. Retry reads.')
  if(offset>count||count<data.length||(offset<count&&!data.length))throw Error('Matching records were not returned. Retry reads.')
  const hasMore=offset+data.length<count
  return {data,count,offset,size:hasMore?Math.min(size,data.length):size,hasMore,nextOffset:offset+data.length}
}

// For a selected family/payroll period, never for all history on screen entry.
// Count drift, duplicate IDs or a failed page makes the whole selection unavailable.
export async function readComplete(query,{current=()=>true,size=100,maxRows=10000}={}) {
  let offset=0,total=null;const rows=[],seen=new Set()
  do {
    const page=await readPage(query,{offset,size,current})
    if(total===null)total=page.count
    if(total!==page.count||total>maxRows)throw Error('Selected data changed or exceeds the verified detail bound. Retry or narrow the selection.')
    for(const row of page.data){
      if(row.id===undefined||seen.has(String(row.id)))throw Error('Selected data changed during paging. Retry reads.')
      seen.add(String(row.id));rows.push(row)
    }
    offset=page.nextOffset
    if(!page.hasMore)break
  } while(offset<total)
  if(rows.length!==total)throw Error('Selected data is incomplete. Retry reads.')
  return {data:rows,count:total,error:null}
}

// A recent preview is bounded independently of total history and API row cap.
// Keep reading at most `limit` records; a short nonempty page is not EOF.
export async function readPreview(query,limit,current=()=>true) {
  const rows=[],seen=new Set()
  while(rows.length<limit){
    if(!current())throw Error('Read owner expired.')
    const result=await query().range(rows.length,limit-1)
    if(!current())throw Error('Read owner expired.')
    if(result.error||!Array.isArray(result.data))throw result.error||Error('Recent records unavailable.')
    if(!result.data.length)break
    for(const row of result.data){if(seen.has(String(row.id)))throw Error('Recent records changed. Retry reads.');seen.add(String(row.id));rows.push(row)}
    if(rows.length>limit)throw Error('Recent response exceeded its bound.')
  }
  return {data:rows,error:null}
}

export function searchPattern(value) {
  // Quote PostgREST OR values and escape SQL LIKE metacharacters. User text
  // cannot add filters; a comma/quote remains literal text inside the value.
  return '"%'+String(value||'').trim().replace(/[\\%_"*]/g,'\\$&')+'%"'
}
export function searchColumns(query,columns,value) {
  if(!String(value||'').trim())return query
  const pattern=searchPattern(value)
  return query.or(columns.map(column=>`${column}.ilike.${pattern}`).join(','))
}

export function pageControls(page,attribute='data-read-page') {
  if(!page)return ''
  return `<div class="rs-pagination" role="group" aria-label="List pages"><button type="button" class="secondary-button" ${attribute}="previous" ${page.offset?'':'disabled'}>Previous</button><span class="muted rs-pagination-summary">${page.data.length? page.offset+1:0}–${page.offset+page.data.length} of ${page.count} matching records</span><button type="button" class="secondary-button" ${attribute}="next" ${page.hasMore?'':'disabled'}>Next</button></div>`
}
