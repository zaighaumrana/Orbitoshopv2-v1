/** Escape untrusted text for HTML text or quoted attributes. */
export function escapeHTML(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

/** Logos are images, never executable URLs or arbitrary data documents. */
export function safeImageURL(value) {
  const url = String(value ?? '').trim()
  if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url
  if (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url)) return url
  return ''
}
