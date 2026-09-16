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
