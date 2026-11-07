// Register shift flow for POS operators (Owner and Cashier).
//   • Opening: the first financial action on the POS asks whether to start register operations.
//   • Closing: logging out asks whether the shop is closing; Yes shows the day's figures and a cash count.
// STAGE 1: dialogs and rules are real; data comes from ./shift-store.js (browser-local preview).
import { currentTenant, money, showToast, showBlockingError, verifyStepUpPin } from '../shared.js'
import { escapeHTML as esc } from '../html.js'
import { ownDialog } from '../ui-dialog.js'
import { onPrivateReset } from '../ui-authority.js'
import * as store from './shift-store.js'
import { statsHTML, slipHTML, fmtDateTime, fmtDuration } from './shift-report.js'

let session = null
let active = null
let replaying = false

/** The open dialog, or null. Self-heals if something else removed it from the page. */
const live = () => (active && active.backdrop.isConnected ? active : (active = null))

/** Called by main.js whenever the signed-in session is established. */
export function setShiftSession(next) { session = next }
onPrivateReset(() => { session = null; closeDialog() })

/** Only the Owner and Cashiers run the register; Support sessions never do. */
function operator() {
  if (!session || session.isSupportAdmin) return null
  const role = session.employee?.role
  if (role !== 'Business Owner' && role !== 'Cashier') return null
  const id = session.authUserId
  return id ? { id: String(id), name: session.employee?.name || '', role } : null
}

/* ── Financial controls that stay locked until the register is open ── */
const FINANCIAL = [
  '[data-modal="repair"]',                       // New Ticket
  '[data-qitem-id]',                             // catalog item
  '[data-inv-pos-add]',                          // inventory item
  '[data-action="add-custom-item"]',             // custom item
  '[data-action="open-udhar"]',                  // credit (udhar) payment
  '[data-action="open-return"]',                 // return
  '[data-action="open-repair-collection"]',      // phone handed back
  '[data-action="deliver-repair"]',
  '[data-action="deliver-repair-udhar"]',
  '[data-action="add-to-cart-for-payment"]',
  '[data-action="open-create-sub-invoice"]',
  '[data-action="checkout"]',
  '[data-action="place-order"]',
].join(',')

// Capture phase: runs before any view handler, so a locked action never starts.
document.addEventListener('click', event => {
  if (replaying || live()) return
  const target = event.target
  if (!(target instanceof Element) || target.closest('.rs-shift-dialog')) return
  const op = operator()
  if (!op) return

  const logout = target.closest('[data-action="logout"]')
  if (logout) {
    const shift = store.getOpenShift(op.id)
    if (!shift) return
    // stopPropagation (not immediate) lets the account menu still close itself.
    event.preventDefault(); event.stopPropagation()
    setTimeout(() => openDialog('close-ask', { kind: 'close', op, shift, trigger: logout }), 0)
    return
  }

  if (!window.location.pathname.startsWith('/pos')) return
  const trigger = target.closest(FINANCIAL)
  if (!trigger || !trigger.closest('.app-shell')) return
  if (store.getOpenShift(op.id)) return
  event.preventDefault(); event.stopPropagation()
  setTimeout(() => openDialog('start-ask', { kind: 'start', op, trigger }), 0)
}, true)

function replay(element) {
  if (!element || !element.isConnected) return
  replaying = true
  try { element.click() } finally { replaying = false }
}

/* ── Dialog host (same ownership rules as the app's own dialogs) ── */
function openDialog(step, ctx) {
  if (live()) return
  const backdrop = document.createElement('div')
  backdrop.className = 'modal-backdrop rs-shift-backdrop' + (document.querySelector('.app-shell.rs-shop') ? ' rs-shop' : '')
  backdrop.dataset.noBackdropClose = ''
  const modal = document.createElement('div')
  modal.className = 'modal rs-shift-dialog'
  backdrop.append(modal)
  document.body.append(backdrop)

  const dlg = { backdrop, modal, step, ctx, busy: false }
  active = dlg
  ownDialog(modal, { close: () => dismiss(dlg), busy: () => dlg.busy, escape: false })

  modal.addEventListener('click', event => {
    if (event.target.closest('[data-close]')) { event.preventDefault(); dismiss(dlg); return }
    const button = event.target.closest('[data-sf]')
    if (button) { event.preventDefault(); onAction(dlg, button.dataset.sf) }
  })
  modal.addEventListener('submit', event => {
    event.preventDefault()
    if (!dlg.busy) onSubmit(dlg, event.target.dataset.sfForm, new FormData(event.target))
  })
  modal.addEventListener('input', event => {
    if (event.target.name === 'counted') updateDifference(dlg, event.target.value)
  })
  render(dlg)
}

function closeDialog() {
  if (!active) return
  const { backdrop } = active
  active = null
  backdrop.remove()
}

function go(dlg, step) { dlg.step = step; render(dlg) }

function setBusy(dlg, busy) {
  dlg.busy = busy
  dlg.modal.dataset.uiBusy = String(busy)
  dlg.modal.setAttribute('aria-busy', String(busy))
  dlg.modal.querySelectorAll('button, input, textarea, select').forEach(el => { el.disabled = busy })
}

function showError(dlg, message) {
  const box = dlg.modal.querySelector('.rs-shift-error')
  if (!box) return
  box.textContent = message
  box.classList.remove('hidden')
}

const parseMoney = value => {
  const text = String(value ?? '').trim()
  if (text === '') return null
  const n = Number(text)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

/* ── Steps ── */
const X = '<button type="button" class="modal-close-button" data-close aria-label="Close dialog" title="Close">×</button>'

function stepHTML(dlg) {
  const { ctx } = dlg
  switch (dlg.step) {
    case 'start-ask': return `${X}
      <h2>Start register operations?</h2>
      <p class="rs-shift-lede">To record sales, repairs, returns or credit, the register has to be open. Do you want to start now?</p>
      <p class="muted rs-shift-hint">If you choose No you can still look around the app, but anything involving money stays locked.</p>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-sf="start-no">No</button>
        <button type="button" class="primary-button" data-sf="start-yes">Yes</button>
      </div>`
    case 'start-cash': return `${X}
      <h2>Cash in the register</h2>
      <p class="rs-shift-lede">Is there any cash in the register right now?</p>
      <p class="muted rs-shift-hint">If yes, enter it so the day's cash can be balanced when you close.</p>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-sf="start-nocash">No cash</button>
        <button type="button" class="primary-button" data-sf="start-cashyes">Yes, enter amount</button>
      </div>`
    case 'start-amount': return `${X}
      <h2>Opening cash</h2>
      <form data-sf-form="open" class="rs-shift-form">
        <label class="field"><span>Cash in the register</span>
          <input name="amount" type="number" inputmode="decimal" step="any" min="0" placeholder="0" required autofocus></label>
        <div class="rs-shift-error hidden" role="alert"></div>
        <div class="modal-actions">
          <button type="button" class="secondary-button" data-sf="start-back">Back</button>
          <button class="primary-button">Open Register</button>
        </div>
      </form>`
    case 'close-ask': return `${X}
      <h2>Closing shop operations?</h2>
      <p class="rs-shift-lede">Choose Yes if you are finished for the day and want to close the register and count the cash.</p>
      <p class="muted rs-shift-hint">Choose No if this is only a break. The register stays open and you can log in again later.</p>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-sf="close-no">No</button>
        <button type="button" class="primary-button" data-sf="close-yes">Yes</button>
      </div>`
    case 'close-summary': return `${X}
      <h2>Close the register</h2>
      <p class="muted rs-shift-hint">${esc(ctx.op.name)} · open since ${esc(fmtDateTime(ctx.shift.startedAt))} (${esc(fmtDuration(ctx.shift.startedAt))})</p>
      <p class="muted rs-shift-hint">Preview figures: the totals below are placeholders until the server version is connected. The cash maths is real.</p>
      <div class="rs-shift-scroll">${statsHTML(ctx.summary)}</div>
      <form data-sf-form="count" class="rs-shift-count">
        <label class="field"><span>Cash counted in the register</span>
          <input name="counted" type="number" inputmode="decimal" step="any" min="0" placeholder="0" required value="${ctx.counted ?? ''}"></label>
        <p class="rs-shift-diff" data-sf-diff aria-live="polite">Expected in the register: ${esc(money(ctx.expected))}</p>
        <div class="rs-shift-error hidden" role="alert"></div>
        <div class="modal-actions">
          <button type="button" class="secondary-button" data-sf="close-abort">Not yet</button>
          <button class="primary-button">Close Register</button>
        </div>
      </form>`
    case 'close-short': return `${X}
      <h2>Cash is short</h2>
      <p class="rs-shift-lede">You counted ${esc(money(ctx.counted))}. The system expects ${esc(money(ctx.expected))}, so the register is short by ${esc(money(ctx.expected - ctx.counted))}.</p>
      <form data-sf-form="short" class="rs-shift-form">
        <label class="field"><span>Reason for the difference</span>
          <textarea name="reason" rows="3" required minlength="3" autofocus placeholder="For example: cash given back to a customer without a return entry">${esc(ctx.reason || '')}</textarea></label>
        <div class="rs-shift-error hidden" role="alert"></div>
        <div class="modal-actions">
          <button type="button" class="secondary-button" data-sf="short-back">Back</button>
          <button class="primary-button">Continue</button>
        </div>
      </form>`
    case 'close-pin': return `${X}
      <h2>Approval needed</h2>
      <p class="rs-shift-lede">Closing with a shortage needs the owner's approval. Ask the owner to enter the override PIN.</p>
      <form data-sf-form="pin" class="rs-shift-form">
        <label class="field"><span>Override PIN</span>
          <input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" required autofocus></label>
        <div class="rs-shift-error hidden" role="alert"></div>
        <div class="modal-actions">
          <button type="button" class="secondary-button" data-sf="pin-back">Back</button>
          <button class="primary-button">Approve and Close</button>
        </div>
      </form>`
    case 'close-receipt': return `${X}
      <h2>Register closed</h2>
      <p class="muted rs-shift-hint">Preview figures: placeholder totals until the server version is connected.</p>
      <div class="rs-shift-scroll"><div class="shift-print-wrap">${slipHTML(ctx.closed, currentTenant().name)}</div></div>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-sf="receipt-done">Close</button>
        <button type="button" class="primary-button" data-sf="receipt-print">Print</button>
      </div>`
    default: return ''
  }
}

function render(dlg) {
  dlg.modal.innerHTML = stepHTML(dlg)
  queueMicrotask(() => {
    if (active !== dlg) return
    const target = dlg.modal.querySelector('[autofocus]') || dlg.modal.querySelector('.primary-button')
    target?.focus({ preventScroll: true })
  })
}

/* ── Actions ── */
function dismiss(dlg) {
  if (dlg.busy) return
  if (dlg.step === 'close-receipt') return finishLogout(dlg)   // already closed: carry on to log out
  closeDialog()                                                // otherwise abandon and stay in the app
}

function onAction(dlg, action) {
  const { ctx } = dlg
  switch (action) {
    case 'start-no':
      closeDialog()
      showToast('The register is not open. Sales, repairs, returns and credit stay locked until you start it.', 'info')
      return
    case 'start-yes': return go(dlg, 'start-cash')
    case 'start-nocash': return openRegister(dlg, 0)
    case 'start-cashyes': return go(dlg, 'start-amount')
    case 'start-back': return go(dlg, 'start-cash')
    case 'close-no': return finishLogout(dlg)                  // a break: log out, register stays open
    case 'close-yes':
      ctx.summary = store.previewSummary(ctx.shift)
      ctx.expected = ctx.summary.expectedCash
      return go(dlg, 'close-summary')
    case 'close-abort': return closeDialog()
    case 'short-back': return go(dlg, 'close-summary')
    case 'pin-back': return go(dlg, 'close-short')
    case 'receipt-print': return printSlip(dlg)
    case 'receipt-done': return finishLogout(dlg)
  }
}

function onSubmit(dlg, name, form) {
  const { ctx } = dlg
  if (name === 'open') {
    const amount = parseMoney(form.get('amount'))
    if (amount == null) return showError(dlg, 'Enter the cash amount as a number, or go back and choose No cash.')
    return openRegister(dlg, amount)
  }
  if (name === 'count') {
    const counted = parseMoney(form.get('counted'))
    if (counted == null) return showError(dlg, 'Enter the cash you counted, as a number.')
    ctx.counted = counted
    const short = counted + store.SHIFT_TOLERANCE < ctx.expected
    if (short && ctx.op.role === 'Cashier') return go(dlg, 'close-short')   // needs a reason and approval
    ctx.reason = ''
    return finalizeClose(dlg, short ? { approvedBy: 'owner (own adjustment)' } : {})
  }
  if (name === 'short') {
    const reason = String(form.get('reason') || '').trim()
    if (reason.length < 3) return showError(dlg, 'Please write a short reason.')
    ctx.reason = reason
    return go(dlg, 'close-pin')
  }
  if (name === 'pin') return submitPin(dlg, String(form.get('pin') || '').trim())
}

function openRegister(dlg, amount) {
  const { op, trigger } = dlg.ctx
  store.startShift({ operatorId: op.id, operatorName: op.name, role: op.role, openingCash: amount })
  closeDialog()
  showToast(amount > 0 ? `Register open with ${money(amount)} cash.` : 'Register open.', 'success')
  setTimeout(() => replay(trigger), 0)       // carry on with what the operator was doing
}

async function submitPin(dlg, pin) {
  if (!/^\d{4}$/.test(pin)) return showError(dlg, 'Enter the 4-digit PIN.')
  setBusy(dlg, true)
  // Stage 1 verifies against the shop's existing override PIN using the existing 'admin' purpose.
  // Stage 3 adds a dedicated 'shift-close' purpose to the database and this call switches to it.
  const result = await verifyStepUpPin(pin, 'admin')
  if (active !== dlg) return
  setBusy(dlg, false)
  if (!result.ok) {
    return showError(dlg, result.kind === 'incorrect' ? 'Incorrect PIN.' : (result.error || 'PIN check is unavailable. Try again.'))
  }
  finalizeClose(dlg, { approvedBy: 'override PIN' })
}

function finalizeClose(dlg, { approvedBy = null } = {}) {
  const { ctx } = dlg
  const closed = store.closeShift(ctx.shift.id, { countedCash: ctx.counted, note: ctx.reason || '', approvedBy })
  if (!closed) {
    closeDialog()
    showBlockingError('This register was already closed.')
    return
  }
  ctx.closed = closed
  go(dlg, 'close-receipt')
}

async function printSlip(dlg) {
  const { printThermal } = await import('../print/print.js')
  printThermal(slipHTML(dlg.ctx.closed, currentTenant().name))
}

function finishLogout(dlg) {
  const trigger = dlg.ctx.trigger || document.querySelector('[data-action="logout"]')
  closeDialog()
  setTimeout(() => replay(trigger), 0)       // the app's own "Log out?" confirmation takes over
}

function updateDifference(dlg, value) {
  const line = dlg.modal.querySelector('[data-sf-diff]')
  if (!line) return
  const { expected, op } = dlg.ctx
  const counted = parseMoney(value)
  if (counted == null) { line.textContent = `Expected in the register: ${money(expected)}`; line.dataset.state = ''; return }
  const diff = Math.round((counted - expected) * 100) / 100
  if (Math.abs(diff) < store.SHIFT_TOLERANCE) { line.textContent = 'Matches the system figure.'; line.dataset.state = 'ok'; return }
  if (diff < 0) {
    line.textContent = `Short by ${money(-diff)}. ` + (op.role === 'Cashier' ? 'A reason and the owner’s approval will be needed.' : 'This will be recorded as your own adjustment.')
    line.dataset.state = 'short'
    return
  }
  line.textContent = `Over by ${money(diff)}. This will be recorded as an overage.`
  line.dataset.state = 'over'
}
