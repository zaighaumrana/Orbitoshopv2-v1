import { escapeHTML as esc } from '../../html.js'

const unavailable = 'Unavailable'
const amount = (value, currency) => typeof value === 'number' && Number.isFinite(value)
  ? esc(`${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
  : unavailable
const count = value => typeof value === 'number' && Number.isFinite(value) ? esc(value.toLocaleString()) : unavailable

export function billingUsagePage(result, busy = false, now = Date.now()) {
  if (!result?.available) return '<div class="card"><h2>Billing &amp; Usage</h2><p>Unavailable</p><p class="muted">Billing information has not been synced. This does not mean there is no outstanding balance.</p></div>'
  const p = result.projection
  const synced = Date.parse(result.last_synced_at)
  const published = Date.parse(p.platform_updated_at)
  const stale = !Number.isFinite(synced) || !Number.isFinite(published)
    || now - Math.min(synced, published) > 24 * 60 * 60 * 1000
  const invoices = p.invoices || []
  return `<div class="card">
    <h2>Current Usage</h2>
    <p>BILL: ${count(p.usage?.BILL)} · INVENTORY: ${count(p.usage?.INVENTORY)}</p>
    <h2>Outstanding Invoice</h2>
    <p>Issued outstanding total: ${amount(p.outstanding_total, p.currency)}</p>
    ${invoices.length ? `<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Period</th><th>Status</th><th>Outstanding</th></tr></thead><tbody>${invoices.map(i => `<tr><td>${esc(i.reference)}</td><td>${esc(i.period)}</td><td>${esc(i.status)}</td><td>${amount(i.outstanding, p.currency)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No invoice references supplied by Platform.</p>'}
    <h2>Estimated Current Charges</h2>
    <p>${amount(p.estimated_current_charges, p.currency)}</p>
    <p class="muted">Un-invoiced usage estimate, separate from issued invoices.</p>
    <h2>Recent Billing</h2><p>${p.recent_billing ? esc(p.recent_billing) : unavailable}</p>
    <p class="muted">Last synced: ${Number.isFinite(synced) ? esc(new Date(synced).toLocaleString()) : unavailable}</p>
    ${stale ? '<p role="status">Billing information may be out of date.</p>' : ''}
    ${p.paper_resupply_enabled === true ? `<h2>Paper Resupply</h2><button class="primary-button" data-action="paper-resupply" ${busy ? 'disabled' : ''}>${busy ? 'Requesting…' : 'Request Resupply'}</button>` : ''}
  </div>`
}
