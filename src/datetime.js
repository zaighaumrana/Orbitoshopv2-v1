/** Legacy timestamp-without-time-zone fields are stored in UTC by the DB.
 * Preserve explicit offsets and let the browser format in its local timezone. */
export function databaseDate(value) {
  if (value instanceof Date) return value
  let raw = String(value || '')
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw) && !/(Z|[+-]\d{2}(?::?\d{2})?)$/i.test(raw)) raw = raw.replace(' ', 'T') + 'Z'
  return new Date(raw)
}
export function localDateTime(value) {
  const date = databaseDate(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], {year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'})
}
export function localDateKey(value) {
  const date = databaseDate(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

// The existing financial report uses browser-local midnight and a half-open
// ISO interval. Share that same scope; this adds no timezone setting/policy.
export function localReportPeriod(now=new Date()) {
  const start=new Date(now);start.setHours(0,0,0,0)
  const end=new Date(start);end.setDate(end.getDate()+1)
  return {from:start.toISOString(),to:end.toISOString(),label:localDateKey(start)}
}
export function actorPeriodRows(rows,period,actor) {
  const from=databaseDate(period.from).getTime(),to=databaseDate(period.to).getTime()
  return rows.filter(row=>row.created_by_auth_user_id===actor&&databaseDate(row.created_at).getTime()>=from&&databaseDate(row.created_at).getTime()<to)
}
