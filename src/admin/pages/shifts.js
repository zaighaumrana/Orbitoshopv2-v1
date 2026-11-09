// Admin → Shift Stats (Business Owner). One subsection per operator, with a detail view and reprint.
// STAGE 1: reads the browser-local preview store; Stage 4 switches it to the server ledger.
import { escapeHTML as esc } from '../../html.js'
import { moneyHTML as m, confirmAction, showToast } from '../../shared.js'
import { onPrivateReset } from '../../ui-authority.js'
import * as store from '../../shift/shift-store.js'
import { statsHTML, slipHTML, roleLabel, fmtDateTime, fmtDuration, statusLabel, differenceBadge } from '../../shift/shift-report.js'

const view = { selectedId: null }
onPrivateReset(() => { view.selectedId = null })

const summaryOf = shift => (shift.endedAt ? shift.summary : store.previewSummary(shift))

function statusBadge(shift) {
  const label = statusLabel(shift)
  const tone = !shift.endedAt ? 'warn' : shift.closeReason === 'manager_forced' ? 'warn' : 'good'
  return `<span class="badge ${tone}">${esc(label)}</span>`
}

function groupByOperator(shifts) {
  const groups = new Map()
  for (const shift of shifts) {
    if (!groups.has(shift.operatorId)) groups.set(shift.operatorId, { name: shift.operatorName, role: shift.role, shifts: [] })
    groups.get(shift.operatorId).shifts.push(shift)
  }
  // Owner first, then cashiers alphabetically.
  return [...groups.values()].sort((a, b) =>
    (a.role === 'Business Owner' ? 0 : 1) - (b.role === 'Business Owner' ? 0 : 1) || a.name.localeCompare(b.name))
}

function shiftRow(shift) {
  const summary = summaryOf(shift)
  const open = !shift.endedAt
  return `<tr>
    <td>${esc(fmtDateTime(shift.startedAt))}${shift.sample ? ' <span class="badge">Sample</span>' : ''}</td>
    <td>${esc(open ? 'Open now' : fmtDateTime(shift.endedAt))}</td>
    <td>${esc(fmtDuration(shift.startedAt, shift.endedAt))}</td>
    <td>${m(summary.expectedCash)}</td>
    <td>${shift.countedCash == null ? '<span class="muted">—</span>' : m(shift.countedCash)}</td>
    <td>${open ? '<span class="muted">—</span>' : differenceBadge(shift)}</td>
    <td>${statusBadge(shift)}</td>
    <td class="rs-shifts-actions">
      <button type="button" class="secondary-button" data-action="shifts-detail" data-shift-id="${esc(shift.id)}">View</button>
      ${open && !shift.sample ? `<button type="button" class="secondary-button" data-action="shifts-force-close" data-shift-id="${esc(shift.id)}">Force close</button>` : ''}
    </td>
  </tr>`
}

function listHTML(shifts, usingSamples) {
  const groups = groupByOperator(shifts)
  return `<div class="rs-shifts-page">
    <p class="muted rs-shifts-note" role="note">Preview: the shift stats on this page are stored in this browser only until the server version is connected.${usingSamples ? ' The rows below are samples; close a register on the POS to see your own.' : ''}</p>
    ${groups.map(group => `<section class="card rs-shifts-group" aria-label="${esc(group.name)}">
      <header>
        <h2>${esc(group.name || 'Unnamed')} <span class="badge">${esc(roleLabel(group.role))}</span></h2>
        <span class="muted">${group.shifts.length} shift${group.shifts.length === 1 ? '' : 's'}</span>
      </header>
      <div class="table-wrap"><table>
        <thead><tr><th>Opened</th><th>Closed</th><th>Duration</th><th>Expected cash</th><th>Counted</th><th>Difference</th><th>Status</th><th></th></tr></thead>
        <tbody>${group.shifts.map(shiftRow).join('')}</tbody>
      </table></div>
    </section>`).join('')}
  </div>`
}

function detailHTML(shift) {
  const open = !shift.endedAt
  return `<div class="rs-shifts-page">
    <div class="rs-shifts-actions">
      <button type="button" class="secondary-button" data-action="shifts-back">← All shift stats</button>
      ${open ? '' : `<button type="button" class="primary-button" data-action="shifts-reprint" data-shift-id="${esc(shift.id)}">Reprint</button>`}
      ${open && !shift.sample ? `<button type="button" class="secondary-button" data-action="shifts-force-close" data-shift-id="${esc(shift.id)}">Force close</button>` : ''}
    </div>
    <section class="card rs-shifts-group">
      <header><h2>${esc(shift.operatorName || 'Unnamed')} <span class="badge">${esc(roleLabel(shift.role))}</span> ${statusBadge(shift)}</h2></header>
      <div class="rs-shifts-facts">
        <div><span class="muted">Opened</span><br><strong>${esc(fmtDateTime(shift.startedAt))}</strong></div>
        <div><span class="muted">Closed</span><br><strong>${esc(open ? 'Still open' : fmtDateTime(shift.endedAt))}</strong></div>
        <div><span class="muted">Duration</span><br><strong>${esc(fmtDuration(shift.startedAt, shift.endedAt))}</strong></div>
        <div><span class="muted">Cash counted</span><br><strong>${shift.countedCash == null ? '—' : m(shift.countedCash)}</strong></div>
        <div><span class="muted">Difference</span><br>${open ? '—' : differenceBadge(shift)}</div>
        <div><span class="muted">Approved by</span><br><strong>${esc(shift.approvedBy || '—')}</strong></div>
      </div>
      ${shift.note ? `<p><span class="muted">Note</span><br>${esc(shift.note)}</p>` : ''}
      ${open ? '<p class="muted">This register is still open, so these figures are live and may change.</p>' : ''}
    </section>
    <section class="card">${statsHTML(summaryOf(shift))}</section>
  </div>`
}

export function shiftsPage(role) {
  if (role !== 'Business Owner') return '<div class="card"><p class="muted">Shift Stats are available to the Business Owner.</p></div>'
  const real = store.listShifts()
  const all = real.length ? real : store.listSamples()
  if (view.selectedId) {
    const selected = all.find(s => s.id === view.selectedId)
    if (selected) return detailHTML(selected)
    view.selectedId = null
  }
  return listHTML(all, real.length === 0)
}

/** Handles the page's buttons. Returns true when the click belonged to this page. */
export async function shiftsAction(el, render) {
  const action = el.dataset.action
  const id = el.dataset.shiftId
  if (action === 'shifts-detail') { view.selectedId = id; render(); return true }
  if (action === 'shifts-back') { view.selectedId = null; render(); return true }
  if (action === 'shifts-reprint') {
    const shift = store.getShift(id)
    if (!shift?.endedAt) return true
    const { printThermal } = await import('../../print/print.js')
    printThermal(slipHTML(shift))
    return true
  }
  if (action === 'shifts-force-close') {
    const shift = store.getShift(id)
    if (!shift || shift.endedAt || shift.sample) return true
    const result = await confirmAction({
      title: 'Force close this register?',
      message: `${shift.operatorName}'s register has been open since ${fmtDateTime(shift.startedAt)}.\n\nIt will be closed without a cash count, so no difference can be worked out. Use this only for a register that was left open by mistake.`,
      confirmLabel: 'Force close',
      tone: 'danger',
      action: async () => { store.forceCloseShift(id); return true },
    })
    if (result?.confirmed) { showToast('Register closed by management.', 'success'); render() }
    return true
  }
  return false
}
