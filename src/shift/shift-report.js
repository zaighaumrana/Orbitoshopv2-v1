// Presentation for register shifts: the close-screen stats, the print slip and small formatters.
// Pure functions of a shift / summary object. Used by the POS dialogs and the Admin Shifts page.
import { escapeHTML as esc, safeImageURL } from '../html.js'
import { moneyHTML as m, currentTenant } from '../shared.js'

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
  return `<div class="rs-shift-stats-wrap"><div class="rs-shift-stats">
    <section class="rs-shift-card is-wide is-register" aria-label="Register cash">
      <h3>Register cash</h3>
      ${row('Opening cash', m(s.openingCash))}
      ${row('Cash sales', plus(s.cash.sales))}
      ${row('Repair payments received in cash', plus(s.cash.repair))}
      ${row('Credit paid at creation, in cash', plus(s.cash.udharAtCreation))}
      ${row('Credit repaid later, in cash', plus(s.cash.udharRepaid))}
      ${row('Returns paid from the register', minus(s.returns.cash))}
      ${row('Expected in the register', m(s.expectedCash), 'is-total')}
    </section>
    <section class="rs-shift-card is-online" aria-label="Online payments">
      <h3>Online payments <small>not in the register</small></h3>
      ${channels}
      ${row('Total online', m(s.online.total), 'is-total')}
    </section>
    <section class="rs-shift-card is-credit" aria-label="Credit (udhar)">
      <h3>Credit (udhar)</h3>
      ${row('Credit given (unpaid balance)', m(s.udhar.given))}
      ${row('Paid at creation', m(s.udhar.paidAtCreationCash + s.udhar.paidAtCreationOnline), 'is-sub')}
      ${row('Repaid later', m(s.udhar.repaidCash + s.udhar.repaidOnline), 'is-sub')}
    </section>
    <section class="rs-shift-card is-returns" aria-label="Returns">
      <h3>Returns</h3>
      ${row('Number of returns', String(s.returns.count))}
      ${row('Total returned', m(s.returns.total))}
      ${row('Paid back in cash', m(s.returns.cash), 'is-sub')}
      ${row('Refunded online', m(s.returns.online), 'is-sub')}
    </section>
    <section class="rs-shift-card is-sales" aria-label="Sales">
      <h3>Sales</h3>
      ${row('Invoiced', m(s.invoiced.total))}
      ${row('Retail', m(s.invoiced.retail), 'is-sub')}
      ${row('Repairs', m(s.invoiced.repair), 'is-sub')}
      ${row('Items sold', String(s.itemsSold))}
      ${row('Discounts given', m(s.discounts))}
    </section>
    <section class="rs-shift-card is-wide is-repairs" aria-label="Repairs">
      <h3>Repairs</h3>
      ${row('Tickets generated', String(s.tickets.created))}
      ${row('Phones repaired and handed back', String(s.tickets.handedBack))}
      ${row('Open tickets right now', String(s.tickets.openNow))}
    </section>
  </div></div>`
}

/** Print view for a closed shift. Uses only the classes the thermal print window defines
 *  (.c .b .lg .sm .row .ln), so spacing and column alignment survive printing. */
export function slipHTML(shift) {
  const s = shift.summary
  const shop = currentTenant()
  const row = (label, value, bold = false) =>
    `<div class="row${bold ? ' b' : ''}"><span>${label}</span><span>${value}</span></div>`
  const head = text => `<div class="b" style="margin-top:2px">${text}</div>`
  const rule = '<div class="ln"></div>'
  const diff = shift.difference
  const diffText = diff == null ? 'Not counted'
    : Math.abs(diff) < 0.005 ? 'Matches'
    : diff < 0 ? `SHORT ${m(-diff)}` : `Over ${m(diff)}`
  return `<div class="rs-shift-slip-body">
    ${shop.logo ? `<div class="c"><img src="${esc(safeImageURL(shop.logo))}" alt="" style="max-width:140px;max-height:50px;object-fit:contain"></div>` : ''}
    <div class="c b lg">${esc(shop.name || '')}</div>
    ${shop.address ? `<div class="c sm">${esc(shop.address)}</div>` : ''}
    ${shop.phone ? `<div class="c sm">${esc(shop.phone)}</div>` : ''}
    ${rule}
    <div class="c b">REGISTER CLOSE REPORT</div>
    <div class="c sm">${esc(shift.operatorName || '')} (${esc(roleLabel(shift.role))})</div>
    ${rule}
    ${row('Opened', esc(fmtDateTime(shift.startedAt)))}
    ${row('Closed', esc(fmtDateTime(shift.endedAt)))}
    ${row('Duration', esc(fmtDuration(shift.startedAt, shift.endedAt)))}
    ${shift.closeReason === 'manager_forced' ? row('Status', 'Closed by management') : ''}
    ${rule}
    ${head('REGISTER CASH')}
    ${row('Opening cash', m(s.openingCash))}
    ${row('Cash sales', m(s.cash.sales))}
    ${row('Repair payments', m(s.cash.repair))}
    ${row('Credit part-paid', m(s.cash.udharAtCreation))}
    ${row('Credit repaid', m(s.cash.udharRepaid))}
    ${row('Returns paid out', '-' + m(s.returns.cash))}
    ${row('Expected cash', m(s.expectedCash), true)}
    ${shift.countedCash == null ? '' : row('Cash counted', m(shift.countedCash), true)}
    ${row('Difference', diffText, true)}
    ${rule}
    ${head('ONLINE (NOT IN REGISTER)')}
    ${s.online.channels.map(c => row(esc(c.method), m(c.amount))).join('')}
    ${row('Total online', m(s.online.total), true)}
    ${rule}
    ${head('CREDIT (UDHAR)')}
    ${row('Credit given', m(s.udhar.given))}
    ${row('Paid at creation', m(s.udhar.paidAtCreationCash + s.udhar.paidAtCreationOnline))}
    ${row('Repaid later', m(s.udhar.repaidCash + s.udhar.repaidOnline))}
    ${rule}
    ${head('RETURNS')}
    ${row('Number of returns', String(s.returns.count))}
    ${row('Total returned', m(s.returns.total))}
    ${row('Paid back in cash', m(s.returns.cash))}
    ${row('Refunded online', m(s.returns.online))}
    ${rule}
    ${head('SALES AND REPAIRS')}
    ${row('Invoiced', m(s.invoiced.total))}
    ${row('Items sold', String(s.itemsSold))}
    ${row('Discounts given', m(s.discounts))}
    ${row('Tickets generated', String(s.tickets.created))}
    ${row('Phones handed back', String(s.tickets.handedBack))}
    ${row('Open tickets now', String(s.tickets.openNow))}
    ${shift.note ? `${rule}${head('NOTE')}<div>${esc(shift.note)}</div>` : ''}
    ${shift.approvedBy ? row('Approved by', esc(shift.approvedBy)) : ''}
    ${rule}
    <div class="c sm">Printed ${esc(new Date().toLocaleString())}</div>
  </div>`
}
