// Presentation for register shifts: the close-screen stats, the print slip and small formatters.
// Pure functions of a shift / summary object. Used by the POS dialogs and the Admin Shifts page.
import { escapeHTML as esc } from '../html.js'
import { moneyHTML as m } from '../shared.js'

export const roleLabel = role => ({ 'Business Owner': 'Owner', Cashier: 'Cashier', Manager: 'Manager' }[role] || role || '')
export const fmtDateTime = iso => (iso ? new Date(iso).toLocaleString() : '—')

export function fmtDuration(startIso, endIso = null) {
  const ms = (endIso ? new Date(endIso) : new Date()) - new Date(startIso)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const minutes = Math.round(ms / 60000)
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

export const statusLabel = shift =>
  !shift.endedAt ? 'Open' : shift.closeReason === 'manager_forced' ? 'Closed by management' : 'Closed'

/** Table-friendly cash difference. */
export function differenceBadge(shift) {
  if (shift.difference == null) return '<span class="muted">Not counted</span>'
  if (Math.abs(shift.difference) < 0.005) return '<span class="badge good">Matches</span>'
  return shift.difference < 0
    ? `<span class="badge warn">Short ${m(-shift.difference)}</span>`
    : `<span class="badge">Over ${m(shift.difference)}</span>`
}

const row = (label, value, cls = '') =>
  `<div class="rs-shift-row${cls ? ' ' + cls : ''}"><span>${label}</span><strong>${value}</strong></div>`

/** Stats panel shown when closing a register and in the Admin detail view. */
export function statsHTML(s) {
  const plus = v => `+ ${m(v)}`
  const minus = v => `− ${m(v)}`
  const channels = s.online.channels.map(c => row(esc(c.method), m(c.amount))).join('')
  return `<div class="rs-shift-stats">
    <section class="rs-shift-card is-wide" aria-label="Register cash">
      <h3>Register cash</h3>
      ${row('Opening cash', m(s.openingCash))}
      ${row('Cash sales', plus(s.cash.sales))}
      ${row('Repair payments received in cash', plus(s.cash.repair))}
      ${row('Credit paid at creation, in cash', plus(s.cash.udharAtCreation))}
      ${row('Credit repaid later, in cash', plus(s.cash.udharRepaid))}
      ${row('Returns paid from the register', minus(s.returns.cash))}
      ${row('Expected in the register', m(s.expectedCash), 'is-total')}
    </section>
    <section class="rs-shift-card" aria-label="Online payments">
      <h3>Online payments <small>not in the register</small></h3>
      ${channels}
      ${row('Total online', m(s.online.total), 'is-total')}
    </section>
    <section class="rs-shift-card" aria-label="Credit (udhar)">
      <h3>Credit (udhar)</h3>
      ${row('Credit given (unpaid balance)', m(s.udhar.given))}
      ${row('Paid at creation', m(s.udhar.paidAtCreationCash + s.udhar.paidAtCreationOnline), 'is-sub')}
      ${row('Repaid later', m(s.udhar.repaidCash + s.udhar.repaidOnline), 'is-sub')}
    </section>
    <section class="rs-shift-card" aria-label="Returns">
      <h3>Returns</h3>
      ${row('Number of returns', String(s.returns.count))}
      ${row('Total returned', m(s.returns.total))}
      ${row('Paid back in cash', m(s.returns.cash), 'is-sub')}
      ${row('Refunded online', m(s.returns.online), 'is-sub')}
    </section>
    <section class="rs-shift-card" aria-label="Sales">
      <h3>Sales</h3>
      ${row('Invoiced', m(s.invoiced.total))}
      ${row('Retail', m(s.invoiced.retail), 'is-sub')}
      ${row('Repairs', m(s.invoiced.repair), 'is-sub')}
      ${row('Items sold', String(s.itemsSold))}
      ${row('Discounts given', m(s.discounts))}
    </section>
    <section class="rs-shift-card is-wide" aria-label="Repairs">
      <h3>Repairs</h3>
      ${row('Tickets generated', String(s.tickets.created))}
      ${row('Phones repaired and handed back', String(s.tickets.handedBack))}
      ${row('Open tickets right now', String(s.tickets.openNow))}
    </section>
  </div>`
}

/** Print view for a closed shift (thermal slip). */
export function slipHTML(shift, shopName) {
  const s = shift.summary
  const line = (label, value) => `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-val">${value}</span></div>`
  const head = text => `<div class="section-head">${text}</div>`
  const diff = shift.difference
  const diffText = diff == null ? 'Not counted'
    : Math.abs(diff) < 0.005 ? 'Matches'
    : diff < 0 ? `Short ${m(-diff)}` : `Over ${m(diff)}`
  return `<div class="shift-print">
    <center><strong>${esc(shopName || '')}</strong><br>Register Close Report<br>${esc(shift.operatorName || '')} (${esc(roleLabel(shift.role))})</center>
    <hr>
    ${line('Opened', esc(fmtDateTime(shift.startedAt)))}
    ${line('Closed', esc(fmtDateTime(shift.endedAt)))}
    ${line('Duration', esc(fmtDuration(shift.startedAt, shift.endedAt)))}
    ${shift.closeReason === 'manager_forced' ? line('Status', 'Closed by management') : ''}
    <hr>
    ${head('Register cash')}
    ${line('Opening cash', m(s.openingCash))}
    ${line('Cash sales', m(s.cash.sales))}
    ${line('Repair payments (cash)', m(s.cash.repair))}
    ${line('Credit paid at creation (cash)', m(s.cash.udharAtCreation))}
    ${line('Credit repaid later (cash)', m(s.cash.udharRepaid))}
    ${line('Returns paid from register', '-' + m(s.returns.cash))}
    ${line('Expected in register', m(s.expectedCash))}
    ${shift.countedCash == null ? '' : line('Cash counted', m(shift.countedCash))}
    ${line('Difference', diffText)}
    <hr>
    ${head('Online payments (not in register)')}
    ${s.online.channels.map(c => line(esc(c.method), m(c.amount))).join('')}
    ${line('Total online', m(s.online.total))}
    <hr>
    ${head('Credit (udhar)')}
    ${line('Credit given', m(s.udhar.given))}
    ${line('Paid at creation', m(s.udhar.paidAtCreationCash + s.udhar.paidAtCreationOnline))}
    ${line('Repaid later', m(s.udhar.repaidCash + s.udhar.repaidOnline))}
    <hr>
    ${head('Returns')}
    ${line('Returns', String(s.returns.count))}
    ${line('Total returned', m(s.returns.total))}
    ${line('Paid back in cash', m(s.returns.cash))}
    ${line('Refunded online', m(s.returns.online))}
    <hr>
    ${head('Sales and repairs')}
    ${line('Invoiced', m(s.invoiced.total))}
    ${line('Items sold', String(s.itemsSold))}
    ${line('Discounts given', m(s.discounts))}
    ${line('Tickets generated', String(s.tickets.created))}
    ${line('Phones handed back', String(s.tickets.handedBack))}
    ${line('Open tickets now', String(s.tickets.openNow))}
    ${shift.note ? `<hr>${head('Note')}<div>${esc(shift.note)}</div>` : ''}
    ${shift.approvedBy ? line('Approved by', esc(shift.approvedBy)) : ''}
    <hr>
    <center style="color:#888;font-size:11px">Printed ${esc(new Date().toLocaleString())}</center>
  </div>`
}
