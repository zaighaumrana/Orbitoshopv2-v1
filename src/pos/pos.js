/* ═══════════════════════════════════════════════════════════════════
   RetailOS — pos.js
   Roles served: Cashier
   Single attachEvents() architecture, router-driven navigation.
═══════════════════════════════════════════════════════════════════ */
import {
  leaveRequestHTML,
  submitLeaveRequest,
  handleClockOut,
} from '../features/ems/index.js'

import {
  sb, state, CFG, loadConfig, applyBranding, currentTenant,
  _clearSession,
  money, fld, modalActions,
  openPinPrompt, pinPromptHTML, handlePpKey, cancelPinPrompt, normalizeModalControls,
  myAccountModalHTML, handleChangePasswordSubmit,
  matchesInvoiceSearch,
  showToast, confirmAction, runInstallPrompt,
} from '../shared.js'
import {
  getSubInvoices, createSubInvoice, markComponentNotNeeded, deliverRepair,
  getRepairFamilySummary,
} from '../features/repairs/api.js'
import { getRetailReturnContext, createRetailReturn } from '../features/pos/returns/api.js'
import {
  insertNewTicketFromCart, collectTicketPayment,
} from '../features/pos/repairs/api.js'
import {
  combinedBalance, repairRowHTML, compTagPickerHTML, ticketSlipPreview,
  repairTicketFormHTML, repairCollectionHTML,
} from '../features/pos/repairs/render.js'
import {
  getDraft, resetDraft, calcDraftTotal, calcDraftPaid,
} from '../features/pos/repairs/state.js'
import { receiptPreview } from '../features/pos/checkout/render.js'
import { finalizeCheckout } from '../features/pos/checkout/api.js'
import { settleUdhar } from '../features/checkout/udhar/api.js'

import { navigate } from '../router.js'
import { dlog, dstack, callerInfo } from '../debuglog.js'

/* ── POS-only state ── */
const posState = {
  cart:            [],
  checkoutPayment: 'Cash',
  cashTendered:    0,
  cartTicketId:    null,      // ticket id currently in cart (Place Order mode)
  cartIsNewTicket: false,     // true if this cart line is a brand-new ticket being placed
  cartAdvancePaid: 0,         // sum of payments already entered for this ticket
  udharName:       '',
  udharPhone:      '',
  udharPaidNow:    0,
  splitCash:       0,
  splitDigital:    0,
  splitMethod:     'Raast',
  splitCredit:     0,
  checkoutRequestId: null,
  invSearch:       '',
  repairSearch:    '',
}

let SESSION = {}
let _inv = null  // populated via dynamic import only when inventory_module_enabled
let _eventsAttached = false

/* ── Load ── */
async function load() {
  dlog('POS.load', 'ENTRY')
  await loadConfig()
  if (CFG.inventory_module_enabled && !_inv) {
    _inv = await import('../features/pos/inventory/render.js')
  }
  const fetchInv = CFG.inventory_module_enabled
    ? sb.from('inventory').select('*').order('name')
    : Promise.resolve({ data: [] })
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1)
  const [tickets, sales, udharAccounts, shiftFinancial, returns_, inv, quickItems, repairComponents] = await Promise.all([
    sb.from('tickets').select('*').order('id', { ascending: false }),
    sb.from('sales').select('*').order('id', { ascending: false }),
    sb.rpc('get_unified_udhar_accounts'),
    sb.rpc('get_financial_report', {
      p_from: todayStart.toISOString(), p_to: todayEnd.toISOString(), p_actor_only: true,
    }),
    sb.from('returns').select('*').order('id', { ascending: false }),
    fetchInv,
    sb.from('quick_items').select('*').order('sort_order'),
    sb.from('repair_components').select('*').order('sort_order'),
  ])
  state.data = {
    tickets:          tickets.data          || [],
    sales:            sales.data            || [],
    employees:        [],
    udharAccounts:    udharAccounts.data    || [],
    shiftFinancial:   shiftFinancial.data   || {},
    returns:          returns_.data         || [],
    inventory:        inv.data              || [],
    quickItems:       quickItems.data       || [],
    repairComponents: repairComponents.data || [],
  }
  applyBranding()
  dlog('POS.load', 'DATA READY (queries resolved) -- calling render()')
  render()

  // Handoff from admin "Collect" button
  const handoffId = sessionStorage.getItem('retailos_collect_ticket')
  if (handoffId) {
    sessionStorage.removeItem('retailos_collect_ticket')
    const found = state.data.tickets.find(t => String(t.id) === String(handoffId))
    if (found) openCollectTicket(found)
  }
}

/* ── Render ── */
function render() {
  dstack('POS.render', `*** #app REWRITE ***`)
  if (!SESSION.employee) { navigate('/login'); return }
  if (CFG.suspended) {
    document.getElementById('app').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  height:100vh;gap:16px;text-align:center;padding:24px">
        <div style="font-size:48px">🔒</div>
        <h2 style="color:var(--danger)">Account Suspended</h2>
        <p class="muted" style="max-width:360px;line-height:1.6">Contact your service provider.</p>
      </div>`
    return
  }
  const tenant = currentTenant()
  const _modalScroll = document.querySelector('.modal')?.scrollTop || 0
  const _activeEl   = document.activeElement
  const _focusAttr  = _activeEl?.hasAttribute('data-repair-search') ? 'data-repair-search'
                     : _activeEl?.hasAttribute('data-inv-search')    ? 'data-inv-search'
                     : null
  const _cursorPos  = _focusAttr ? _activeEl.selectionStart : null

  document.getElementById('app').innerHTML = `
    <div class="app-shell client-shell">
      <main class="main">
        <header class="topbar">
          <div class="brand top-brand">
            <div class="logo">${tenant.logo?`<img alt="" src="${tenant.logo}">`:tenant.name.slice(0,2).toUpperCase()}</div>
            <div>
              <strong>${tenant.name}</strong>
              <span class="muted" style="font-size:12px">Cashier · POS Counter</span>
            </div>
          </div>
          <div class="top-actions">
            <span class="chip"><strong style="font-size:12px">${SESSION.employee.name}</strong></span>
            <span class="chip"><i class="dot ${state.online?'':'offline'}"></i>${state.online?'Online':'Offline'}</span>
            ${(SESSION.isAdmin || SESSION.employee?.role === 'Business Owner') ? `
              <button class="secondary-button" data-action="go-admin">Admin</button>
              ${CFG.technician_module_enabled
                ? `<button class="secondary-button" data-action="go-workshop">Workshop</button>`
                : ''}
            ` : ''}
            <button class="icon-button" data-action="my-account" title="My Account">👤</button>
            <button class="icon-button" data-action="theme">${state.theme==='dark'?'Light':'Dark'}</button>
            ${CFG.ems_enabled && !(SESSION.isAdmin || SESSION.employee?.role === 'Business Owner') ? `
              <button class="secondary-button" style="font-size:12px" data-action="ems-clock-out">
                🕐 Clock Out
              </button>
            ` : ''}
            <button class="icon-button" data-action="logout" style="color:var(--danger)">Logout</button>
          </div>
        </header>
        <section class="content">${posView()}</section>
      </main>
    </div>
    ${renderModal()}`

  normalizeModalControls(document.getElementById('app'))

  if (!_eventsAttached) {
    attachEvents()
    _eventsAttached = true
  }
  if (_modalScroll) {
    const m = document.querySelector('.modal')
    if (m) m.scrollTop = _modalScroll
  }
  if (_focusAttr) {
    const el = document.querySelector(`[${_focusAttr}]`)
    if (el) { el.focus(); if (_cursorPos != null) el.setSelectionRange(_cursorPos, _cursorPos) }
  }
}

/* ── POS View ── */
function posView() {
  const tenant   = currentTenant()
  const subtotal = posState.cart.reduce((s,i) => s + i.soldPrice * i.qty, 0)
  const disc     = posState.cart.reduce((s,i) => s + (i.originalPrice - i.soldPrice) * i.qty, 0)
  const tax      = subtotal * (tenant.taxRate / 100)
  const grandTotal = subtotal + tax
  const tendered = posState.cashTendered || 0
  const change   = tendered - grandTotal
  const hasTicketInCart = posState.cart.some(i => i.isTicket)

  return `
    <div class="page-title">
      <div>
        <h1>Point of Sale</h1>
        <p class="muted">Counter · ${tenant.name} · <strong>${SESSION.employee.name}</strong></p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="secondary-button" data-action="shift-stats">📋 Shift Stats</button>
        ${CFG.repair_module_enabled ? `
          <button class="primary-button" data-modal="repair">+ New Ticket</button>
          <button class="secondary-button" data-action="open-repair-collection">🔧 Repairs</button>` : ''}
          <button class="secondary-button" data-action="open-return">↩ Return</button>
        <button class="secondary-button" data-action="open-udhar">₨ Credits</button>
      </div>
    </div>
    <div class="grid pos-layout">
      <div class="grid" style="align-content:start;gap:12px">
        ${quickItemsPanel()}
        ${CFG.inventory_module_enabled && _inv ? _inv.inventoryPanel(posState) : ''}
        ${recentRepairPanel()}
      </div>
      <aside class="card cart">
        <h2>Cart</h2>
        ${posState.cart.length ? posState.cart.map(item => `
          <div class="cart-line">
            <div>
              <strong>${item.name}</strong><br>
              ${item.variantName ? `<small class="muted">&nbsp;&nbsp;${item.variantName}</small><br>` : ''}
              <small class="muted">
                ${item.isTicket ? '' : money(item.soldPrice) + ' each'}
                ${item.reason?' · '+item.reason:''}
              </small>
            </div>
            ${item.isTicket ? `
              <div></div>
            ` : `
              <div class="qty-controls">
                <button data-qty="${item.productId}" data-delta="-1">−</button>
                <strong>${item.qty}</strong>
                <button data-qty="${item.productId}" data-delta="1">+</button>
              </div>`}
            ${item.isTicket ?
              `<button class="secondary-button" style="font-size:12px" data-remove-cart-item="${item.productId}">Remove</button>` :
              `<button class="secondary-button" data-modal="override" data-id="${item.productId}">Price</button>`}
          </div>`).join('') : `<div class="empty">No items in cart.</div>`}

        <div class="totals">
          <div class="total-row"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
          ${disc>0?`<div class="total-row"><span>Discounts</span><strong style="color:var(--success)">− ${money(disc)}</strong></div>`:''}
          ${tax>0?`<div class="total-row"><span>Tax ${tenant.taxRate}%</span><strong>${money(tax)}</strong></div>`:''}
          <div class="total-row grand"><span>Total</span><strong>${money(grandTotal)}</strong></div>
        </div>

        ${!hasTicketInCart ? `
        <select class="tenant-switcher" data-action="payment">
          ${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer','Split Payment','Udhar (Credit)'].map(m=>
            `<option ${posState.checkoutPayment===m?'selected':''}>${m}</option>`).join('')}
        </select>
        ${posState.checkoutPayment === 'Cash' ? `
          <div style="display:grid;gap:6px;margin-top:4px">
            <label style="font-size:13px;font-weight:500;color:var(--muted)">Cash Received</label>
            <input type="number" step="any" min="0" placeholder="Enter amount received"
              value="${tendered||''}" data-cash-tendered
              style="border:1px solid var(--border);border-radius:8px;padding:9px 12px;
                     background:var(--surface);color:var(--text);font-size:16px;width:100%">
            ${tendered>0?`
            <div style="display:flex;justify-content:space-between;padding:9px 12px;border-radius:8px;font-weight:600;font-size:15px;
                background:${change>=0?'color-mix(in srgb,#22c55e 12%,var(--surface))':'color-mix(in srgb,#ef4444 12%,var(--surface))'}">
              <span>${change>=0?'Change Due':'Short by'}</span>
              <span style="color:${change>=0?'#22c55e':'#ef4444'}">${money(Math.abs(change))}</span>
            </div>` : ''}
          </div>` : ''}
        ${posState.checkoutPayment === 'Udhar (Credit)' ? `
          <div style="display:grid;gap:8px;margin-top:4px">
            <input class="search" placeholder="Customer name *" data-udhar="name" value="${posState.udharName||''}">
            <input class="search" placeholder="Customer phone *" data-udhar="phone" value="${posState.udharPhone||''}">
            <label style="font-size:13px;font-weight:500;color:var(--muted)">Cash Paid Now (optional)</label>
            <input type="number" step="any" min="0" placeholder="0 — rest goes on credit"
              value="${posState.udharPaidNow||''}" data-udhar="paidNow"
              style="border:1px solid var(--border);border-radius:8px;padding:9px 12px;
                     background:var(--surface);color:var(--text);font-size:16px;width:100%">
          </div>` : ''}
        ${posState.checkoutPayment === 'Split Payment' ? `
          <div style="display:grid;gap:8px;margin-top:4px">
            <label style="font-size:13px;font-weight:500;color:var(--muted)">Cash amount</label>
            <input type="number" step="any" min="0" value="${posState.splitCash||''}" data-split="cash" class="search">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <select data-split="method" class="tenant-switcher">${['Raast','JazzCash','EasyPaisa','Bank Transfer'].map(m=>`<option ${posState.splitMethod===m?'selected':''}>${m}</option>`).join('')}</select>
              <input type="number" step="any" min="0" value="${posState.splitDigital||''}" data-split="digital" class="search" placeholder="Digital amount">
            </div>
            <label style="font-size:13px;font-weight:500;color:var(--muted)">Udhar amount (optional, PIN required)</label>
            <input type="number" step="any" min="0" value="${posState.splitCredit||''}" data-split="credit" class="search">
            <input class="search" placeholder="Customer name (required if Udhar)" data-udhar="name" value="${posState.udharName||''}">
            <input class="search" placeholder="Customer phone (required if Udhar)" data-udhar="phone" value="${posState.udharPhone||''}">
            <div style="display:flex;justify-content:space-between;padding:8px 10px;background:var(--surface-2);border-radius:8px"><span>Split total</span><strong>${money(Number(posState.splitCash||0)+Number(posState.splitDigital||0)+Number(posState.splitCredit||0))} / ${money(grandTotal)}</strong></div>
          </div>` : ''}
        ` : `
          <p class="muted" style="font-size:12px;margin-top:4px">
            Repair ticket — confirming this will place the order and print the ticket slip.
            Payment already recorded for this ticket is tracked separately.
          </p>
        `}

        <button class="primary-button" data-action="${hasTicketInCart ? 'place-order' : 'checkout'}"
          ${posState.cart.length?'':'disabled'}>
          ${hasTicketInCart ? 'Place Order' : 'Checkout & Receipt'}
        </button>
      </aside>
    </div>`
}

function quickItemsPanel() {
  if (!(state.data.quickItems||[]).length) return `
    <div class="card">
      <h2 style="margin-bottom:12px">Custom Item</h2>
      ${customItemEntry()}
    </div>`
  return `
    <div class="card">
      <h2 style="margin-bottom:12px">Quick Items</h2>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        ${state.data.quickItems.map(item=>`
          <button class="secondary-button" style="font-size:15px;padding:11px 18px;border-radius:10px;font-weight:500"
            data-qitem-id="${item.id}" data-qitem-name="${item.name}" data-qitem-prices='${JSON.stringify(item.prices)}'>
            ${item.name}
          </button>`).join('')}
      </div>
      <div style="border-top:1px solid var(--border);padding-top:12px">
        <p style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Custom / One-off Item</p>
        ${customItemEntry()}
      </div>
    </div>`
}

function customItemEntry() {
  return `
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:end">
      <label class="field" style="margin:0"><span style="font-size:12px">Item Name</span>
        <input id="custom-item-name" placeholder="e.g. Screen Guard" style="font-size:13px"></label>
      <label class="field" style="margin:0"><span style="font-size:12px">Price</span>
        <input id="custom-item-price" type="number" step="any" min="0" placeholder="0" style="width:90px;font-size:13px"></label>
      <button class="primary-button" style="padding:9px 14px;font-size:13px;white-space:nowrap" data-action="add-custom-item">+ Add</button>
    </div>`
}



/* Main screen — only 3 most recent PENDING (balance_due > 0) tickets */
function recentRepairPanel() {
  if (!CFG.repair_module_enabled) return `
    <div class="card"><h2>Quick Sale</h2>
      <p class="muted" style="font-size:13px">Add items using the cart panel.</p>
    </div>`
  const pending = (state.data.tickets||[])
    .filter(t => !t.parent_ticket_id) // only show parent/original tickets on this quick panel
    .filter(t => combinedBalance(t).total > 0 || !t.is_locked)
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 3)

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h2 style="margin:0">Recent Repair Tickets</h2>
        <button class="secondary-button" style="font-size:12px" data-action="open-repair-collection">View All</button>
      </div>
      ${pending.length ? pending.map(t => repairRowHTML(t)).join('') : `<div class="empty">No pending tickets.</div>`}
    </div>`
}

/* Combined balance across a parent ticket and any sub-invoices under it */
/* ── Sub-invoice draft helpers (workshop-off POS fallback) ── */
function readSubInvCompsFromDOM() {
  const comps = [...(state.modal?.draftComponents || [])]
  document.querySelectorAll('[data-subinv-comp-price]').forEach((inp, i) => {
    if (comps[i]) comps[i].price = Number(inp.value) || 0
  })
  return comps
}

function readSubInvLabourFromDOM() {
  return Number(document.querySelector('[data-subinv-labour]')?.value || 0)
}

function updateSubInvDraftTotal() {
  const prices = [...document.querySelectorAll('[data-subinv-comp-price]')]
    .reduce((s, inp) => s + (Number(inp.value) || 0), 0)
  const labour = readSubInvLabourFromDOM()
  const el = document.getElementById('subinv-draft-total')
  if (el) el.textContent = money(prices + labour)
}

function _addComponentToDraft(name, tag, customText) {
  const parentId = state.modal._parentId
  const draftComponents = [
    ...(state.modal._draftComponents || []),
    { name, tag, customText, price: 0 },
  ]
  state.modal = { type: 'create-sub-invoice', parentId, draftComponents, draftLabour: state.modal._draftLabour || 0 }
  render()
}

/* ── Shift stats ── */
function buildShiftStats() {
  const tenant    = currentTenant()
  const todayStr  = new Date().toISOString().slice(0,10)
  const empName   = SESSION.employee?.name || ''
  const shiftSales = (state.data.sales||[]).filter(s=>(s.created_at||'').slice(0,10)===todayStr&&(!empName||s.employee_name===empName))
  const itemsSold  = shiftSales.reduce((s,sale)=>s+(sale.items_sold||[]).reduce((x,i)=>x+(i.qty||1),0),0)
  const financial  = state.data.shiftFinancial || {}
  const invoiced   = Number(financial.invoiced || 0)
  const collected  = Number(financial.paymentsCollected || 0)
  const refunded   = Number(financial.refunds || 0)
  const netPayments= Number(financial.netPayments || 0)
  const cashOnly   = Number((financial.paymentMethods || []).find(x => x.method === 'Cash')?.amount || 0)
  const discounts  = shiftSales.reduce((s,sale)=>s+Number(sale.discount||0),0)
  const custCount  = new Set(shiftSales.map(s=>s.customer_name).filter(Boolean)).size
  const allTickets = state.data.tickets||[]
  const shiftTkts  = allTickets.filter(t=>(t.created_at||'').slice(0,10)===todayStr&&(!empName||t.created_by===empName))
  const pendingAll = allTickets.filter(t=>!t.parent_ticket_id && (Number(t.balance_due||0)>0 || !t.is_locked))
  return `
    <div class="shift-print">
      <center><strong>${tenant.name}</strong><br>Shift Summary — ${todayStr}<br>${empName||'All Staff'}</center>
      <hr style="border:none;border-top:1px dashed #bbb;margin:8px 0">
      <div class="stat-row"><span>Products sold</span><span>${itemsSold}</span></div>
      <div class="stat-row"><span>Invoiced</span><span>${money(invoiced)}</span></div>
      <div class="stat-row"><span>Payments collected</span><span>${money(collected)}</span></div>
      <div class="stat-row"><span>Refunds</span><span>-${money(refunded)}</span></div>
      <div class="stat-row"><span>Net payments</span><span>${money(netPayments)}</span></div>
      <div class="stat-row"><span>Cash collected</span><span>${money(cashOnly)}</span></div>
      <div class="stat-row"><span>Discounts given</span><span>${money(discounts)}</span></div>
      <div class="stat-row"><span>Customers served</span><span>${custCount}</span></div>
      ${CFG.repair_module_enabled?`
      <hr style="border:none;border-top:1px dashed #bbb;margin:8px 0">
      <div class="stat-row"><span>Tickets this shift</span><span>${shiftTkts.length}</span></div>
      <div class="stat-row"><span>All pending (shop)</span><span>${pendingAll.length}</span></div>
      `:''}
      <hr style="border:none;border-top:1px dashed #bbb;margin:8px 0">
      <center style="color:#888;font-size:11px">Printed ${new Date().toLocaleString()}</center>
    </div>`
}

/* ── Component tag picker (sub-modal) ── */
/* ── Repair Collection modal — unified dynamic search ── */
/* ── Ticket payment / collect modal — for adding a top-up payment to existing ticket ── */
function ticketPaymentModalHTML(modal) {
  const ticket = modal.ticket
  if (modal.summaryStatus === 'loading') return `<div class="modal-backdrop">
    <div class="modal modal-sm" aria-busy="true">
      <h2>Repair summary</h2>
      <p class="muted">Loading current repair-family totals…</p>
      <div class="summary-skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="modal-actions"><button class="secondary-button" data-close>Close</button></div>
    </div>
  </div>`
  if (modal.summaryStatus === 'error' || !modal.summary) return `<div class="modal-backdrop">
    <div class="modal modal-sm">
      <h2>Repair summary unavailable</h2>
      <p class="muted">${modal.summaryError || 'Current repair totals could not be loaded.'}</p>
      <div class="modal-actions">
        <button class="secondary-button" data-close>Close</button>
        <button class="primary-button" data-action="retry-repair-summary" data-ticket-id="${ticket.id}">Retry</button>
      </div>
    </div>
  </div>`

  const summary = modal.summary
  const root = summary.root || {}
  const invoices = summary.invoices || []
  const original = invoices.find(invoice => !invoice.parentTicketId) || invoices[0] || {}
  const subs = invoices.filter(invoice => invoice.parentTicketId)
  const originalTotal = Number(original.amount || 0)
  const effectiveTotal = Number(summary.effectiveObligation || 0)
  const netPaid = Number(summary.netPayments || 0)
  const outstanding = Number(summary.outstanding || 0)
  const status = root.status || ticket.status
  const terminal = status === 'Delivered' || status === 'Cancelled'
  const deliveredBy = root.deliveredByDisplayName || root.deliveredBy || ''
  const statusGuidance = status === 'Delivered'
    ? `<div class="terminal-state good"><strong>Delivery completed</strong><span>${root.deliveredAt ? new Date(root.deliveredAt).toLocaleString() : 'Delivered'}${deliveredBy ? ` · ${deliveredBy}` : ''}${outstanding > 0 ? ' · Remaining credit is managed from Outstanding Credits.' : ''}</span></div>`
    : status === 'Cancelled'
      ? `<div class="terminal-state bad"><strong>Repair cancelled</strong><span>${root.cancelledAt ? new Date(root.cancelledAt).toLocaleString() : ''}${root.cancellationReason ? `${root.cancelledAt ? ' · ' : ''}${root.cancellationReason}` : ''}</span></div>`
      : status === 'Ready'
        ? (outstanding > 0 ? `
          <button class="secondary-button" style="width:100%;margin-top:8px" data-action="deliver-repair-udhar" data-ticket-id="${root.id || ticket.id}">
            Approve Udhar & Deliver
          </button>` : `
          <button class="primary-button" style="width:100%;margin-top:8px" data-action="deliver-repair" data-ticket-id="${root.id || ticket.id}">
            Deliver Device
          </button>`)
        : `<p class="muted" style="font-size:12px;margin-top:8px">${status === 'In Progress' ? 'Repair work is in progress. Mark it Ready when collection can begin.' : 'Repair work must be completed and marked Ready before delivery.'}</p>`

  return `<div class="modal-backdrop">
    <div class="modal modal-sm">
      <h2>${root.invoiceNumber || root.ticketNumber || ticket.invoice_number || ticket.ticket_number} <span class="badge ${status === 'Delivered' || status === 'Ready' ? 'good' : status === 'Cancelled' ? 'bad' : 'warn'}">${status}</span></h2>
      <p class="muted">${root.customerName || ticket.customer_name} · ${root.deviceBrand || ticket.device_brand} ${root.deviceModel || ticket.device_model}</p>
      <div style="display:grid;gap:6px;padding:12px;background:var(--surface-2);border-radius:8px;margin:12px 0">
        <div style="display:flex;justify-content:space-between"><span>Original invoice</span><strong>${money(originalTotal)}</strong></div>
        ${subs.length ? `
          <div style="border-top:1px solid var(--border);margin-top:4px;padding-top:6px">
            ${subs.map(s => `
              <div style="display:flex;justify-content:space-between;font-size:13px">
                <span>${s.invoiceNumber || s.ticketNumber}</span><span>${money(s.amount)}</span>
              </div>`).join('')}
          </div>` : ''}
        <div style="display:flex;justify-content:space-between"><span>Current billed</span><strong>${money(effectiveTotal)}</strong></div>
        <div style="display:flex;justify-content:space-between;color:var(--success)"><span>Net paid</span><strong>${money(netPaid)}</strong></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid var(--border);padding-top:6px">
          <span>Total due</span><span>${money(outstanding)}</span>
        </div>
      </div>
      ${outstanding > 0 && !terminal ? `
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input type="number" step="any" min="0" placeholder="Amount to pay now" id="topup-amount"
            style="flex:1;border:1px solid var(--border);border-radius:6px;padding:8px 10px;background:var(--surface);color:var(--text)">
          <select id="topup-method" style="border:1px solid var(--border);border-radius:6px;padding:8px 10px;background:var(--surface);color:var(--text)">
            ${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer'].map(m => `<option>${m}</option>`).join('')}
          </select>
        </div>
        <button class="primary-button" style="width:100%" data-action="add-to-cart-for-payment" data-ticket-id="${root.id || ticket.id}">
          Add to Cart for Payment
        </button>
      ` : !terminal ? `<p class="muted">This repair is fully paid.</p>` : ''}
      ${statusGuidance}
      <div class="modal-actions">
        <button class="secondary-button" data-action="print-repair-summary" data-ticket-id="${root.id || ticket.id}">Print Summary</button>
        <button class="secondary-button" data-close>Close</button>
      </div>
    </div>
  </div>`
}

async function openCollectTicket(ticket) {
  if (!ticket.is_locked) {
    // Ticket was never placed (shouldn't normally happen) — open edit form
    showToast('This ticket has not been placed yet.', 'warning')
    return
  }
  const requestId = crypto.randomUUID()
  state.modal = { type: 'ticket-payment', ticket, summaryStatus:'loading', summary:null, requestId }
  render()
  const result = await getRepairFamilySummary(Number(ticket.id))
  if (state.modal?.type !== 'ticket-payment' || state.modal.requestId !== requestId) return
  if (!result.ok) {
    state.modal.summaryStatus = 'error'
    state.modal.summaryError = result.error
  } else {
    state.modal.summaryStatus = 'ready'
    state.modal.summary = result.data
  }
  render()
}

/* ── Modal dispatcher ── */
function renderModal() {
  if (!state.modal) return ''
  const { type } = state.modal

  if (type === 'leave-request') return leaveRequestHTML()

  if (type === 'myAccount') return myAccountModalHTML(SESSION)

  if (type === 'pinPrompt') return `<div class="modal-backdrop">${pinPromptHTML(state.modal.purpose)}</div>`

  if (type === 'edit-components') {
    const tk = (state.data.tickets||[]).find(t => String(t.id) === String(state.modal.id))
    if (!tk) return ''
    const comps      = tk.components_noted || []
    const partsTotal = comps.filter(c=>!c.removed).reduce((s,c) => s + Number(c.price||0), 0)
    const grandTotal = partsTotal + Number(tk.labour_cost||0)
    const subs       = state.modal.subInvoices || []
    const subsTotal  = subs.reduce((s,x) => s + Number(x.balance_due||0), 0)

    return `
      <div class="modal-backdrop" data-no-backdrop-close>
        <div class="modal modal-md" style="max-height:90vh;overflow-y:auto">
          <h2 style="margin-bottom:4px">${tk.customer_name}</h2>
          <p class="muted" style="font-size:13px;margin-bottom:16px">
            ${tk.invoice_number || tk.ticket_number}
            ${tk.invoice_number ? `<br><span style="font-size:11px">Ticket: ${tk.ticket_number}</span>` : ''}
            · ${tk.device_brand} ${tk.device_model}
          </p>

          <div style="display:grid;gap:8px;margin-bottom:14px">
            <strong style="font-size:13px">Original Issues (locked)</strong>
            ${comps.length ? comps.map((c,i) => `
              <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;
                          ${c.removed?'opacity:.55':''}">
                <div>
                  <span style="font-size:13px;${c.removed?'text-decoration:line-through':''}"><strong>${c.name}</strong></span>
                  <span class="badge warn" style="font-size:11px;margin-left:6px">${c.tag || ''}</span>
                  ${c.customText ? `<span class="muted" style="font-size:12px"> — ${c.customText}</span>` : ''}
                  ${c.removed ? `<br><span class="muted" style="font-size:11px">Not needed: ${c.removedReason||''}</span>` : ''}
                </div>
                <span style="font-size:13px;min-width:70px;text-align:right">${Number(c.price)>0?money(c.price):'—'}</span>
                ${!c.removed ? `<button type="button" class="secondary-button" style="font-size:11px;padding:4px 8px"
                  data-mark-not-needed="${i}">Not Needed</button>` : `<span></span>`}
              </div>`).join('') :
              `<p class="muted" style="font-size:13px">No components noted.</p>`}
          </div>

          <div style="display:flex;justify-content:space-between;padding:10px;background:var(--surface-2);
                      border-radius:8px;margin-bottom:8px;font-size:13px">
            <span>Labour Fee (locked)</span><span>${money(tk.labour_cost||0)}</span>
          </div>
          ${tk.technician_note ? `<p class="muted" style="font-size:12px;margin-bottom:12px">Note: ${tk.technician_note}</p>` : ''}

          <div style="display:flex;justify-content:space-between;font-weight:600;padding:10px;
                      background:var(--surface-2);border-radius:8px;margin-bottom:16px;font-size:15px">
            <span>Original Total</span><span>${money(grandTotal)}</span>
          </div>

          ${subs.length ? `
            <div style="margin-bottom:14px">
              <strong style="font-size:13px">Sub-Invoices</strong>
              <div style="display:grid;gap:6px;margin-top:6px">
                ${subs.map(s => `
                  <div style="display:flex;justify-content:space-between;font-size:12px;
                              padding:8px 10px;background:var(--surface-2);border-radius:6px">
                    <span>${s.invoice_number}</span>
                    <span>${money(s.estimated_quote)} · Bal: ${money(s.balance_due)}</span>
                  </div>`).join('')}
              </div>
              <p class="muted" style="font-size:12px;margin-top:6px">Combined outstanding balance: ${money(subsTotal)}</p>
            </div>` : ''}

          <div class="modal-actions">
            <button class="secondary-button" data-close>Close</button>
            <button class="primary-button" data-action="open-create-sub-invoice" data-ticket-id="${tk.id}">
              + Create Sub-Invoice
            </button>
          </div>
        </div>
      </div>`
  }

  if (type === 'mark-not-needed') {
    const tk = (state.data.tickets||[]).find(t => String(t.id) === String(state.modal.ticketId))
    const c  = tk?.components_noted?.[state.modal.index]
    if (!tk || !c) return ''
    return `<div class="modal-backdrop" data-no-backdrop-close>
      <div class="modal modal-xs">
        <h2>Mark "${c.name}" Not Needed</h2>
        <p class="muted" style="font-size:13px">E.g. "Only needed cleaning, no repair required." This stays visible on the ticket, it's not deleted.</p>
        <label class="field"><span>Reason</span><textarea id="not-needed-reason" style="min-height:56px"></textarea></label>
        <div class="modal-actions">
          <button type="button" class="secondary-button" data-close>Cancel</button>
          <button type="button" class="primary-button" data-action="confirm-not-needed">Confirm (PIN required)</button>
        </div>
      </div>
    </div>`
  }

  if (type === 'create-sub-invoice') {
    const parentId = state.modal.parentId
    const tk = (state.data.tickets||[]).find(t => String(t.id) === String(parentId))
    if (!tk) return ''
    const draft      = state.modal.draftComponents || []
    const labour     = state.modal.draftLabour ?? 0
    const compDefs   = state.data.repairComponents || []
    const partsTotal = draft.reduce((s,c) => s + Number(c.price||0), 0)
    const total      = partsTotal + labour

    return `
      <div class="modal-backdrop" data-no-backdrop-close>
        <div class="modal modal-md" style="max-height:90vh;overflow-y:auto">
          <h2 style="margin-bottom:4px">Create Sub-Invoice</h2>
          <p class="muted" style="font-size:13px;margin-bottom:16px">
            Linked to ${tk.invoice_number} — ${tk.customer_name}, ${tk.device_brand} ${tk.device_model}
          </p>

          <div style="display:grid;gap:8px;margin-bottom:14px">
            <strong style="font-size:13px">Additional Components</strong>
            ${draft.length ? draft.map((c,i) => `
              <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center">
                <div>
                  <span style="font-size:13px"><strong>${c.name}</strong></span>
                  <span class="badge warn" style="font-size:11px;margin-left:6px">${c.tag || ''}</span>
                  ${c.customText ? `<span class="muted" style="font-size:12px"> — ${c.customText}</span>` : ''}
                </div>
                <input type="number" step="any" min="0" value="${c.price || ''}" placeholder="Price"
                  data-subinv-comp-price="${i}"
                  style="width:110px;border:1px solid var(--border);border-radius:6px;
                         padding:6px 8px;background:var(--surface);color:var(--text);font-size:13px">
                <button type="button" data-subinv-comp-remove="${i}"
                  style="color:var(--danger);background:none;border:none;font-size:18px;cursor:pointer;padding:0 4px">×</button>
              </div>`).join('') : `<p class="muted" style="font-size:13px">No components added yet.</p>`}
          </div>

          <div style="margin-bottom:12px">
            <p class="muted" style="font-size:12px;margin-bottom:6px">Add component:</p>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
              ${compDefs.map(c => `<button type="button" class="secondary-button" style="font-size:12px;padding:5px 12px"
                data-add-draft-comp-name="${c.name}">${c.name}</button>`).join('')}
            </div>
            <div style="display:flex;gap:8px">
              <input id="custom-comp-name" class="search" placeholder="Custom component name" style="flex:1">
              <button type="button" class="secondary-button" data-action="add-custom-draft-comp">+ Add</button>
            </div>
          </div>

          <label style="display:flex;justify-content:space-between;align-items:center;padding:10px;
                        background:var(--surface-2);border-radius:8px;margin-bottom:8px;gap:12px">
            <span style="font-size:13px;font-weight:500">Labour Charge</span>
            <input type="number" step="any" min="0" value="${labour || ''}" placeholder="0" data-subinv-labour
              style="width:120px;border:1px solid var(--border);border-radius:6px;
                     padding:6px 8px;background:var(--surface);color:var(--text);font-size:13px">
          </label>

          <label class="field" style="margin-bottom:12px">
            <span>Note</span>
            <textarea id="sub-invoice-note" style="min-height:56px" placeholder="What was found / done…"></textarea>
          </label>

          <div style="display:flex;justify-content:space-between;font-weight:600;padding:10px;
                      background:var(--surface-2);border-radius:8px;margin-bottom:16px;font-size:15px">
            <span>Sub-Invoice Total</span><span id="subinv-draft-total">${money(total)}</span>
          </div>

          <div class="modal-actions">
            <button type="button" class="secondary-button" data-close>Cancel</button>
            <button type="button" class="primary-button" data-action="submit-sub-invoice" data-parent-id="${parentId}">
              Create & Print
            </button>
          </div>
        </div>
      </div>`
  }

  if (type === 'add-comp-tag') {
    const { compName } = state.modal
    return `
      <div class="modal-backdrop" data-no-backdrop-close>
        <div class="modal modal-xs">
          <h2>${compName}</h2>
          <p class="muted" style="font-size:13px">What's the issue?</p>
          <div style="display:grid;gap:8px;margin-top:10px">
            <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-select="Broken">Broken</button>
            <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-select="Not Working">Not Working</button>
            <button type="button" class="secondary-button" style="font-size:15px;min-height:48px" data-tag-select="Custom">Custom…</button>
            <div id="custom-tag-wrap" class="hidden" style="display:grid;gap:8px">
              <input id="custom-tag-text" class="search" placeholder="Describe the issue">
              <button type="button" class="primary-button" data-action="confirm-draft-custom-tag">Add</button>
            </div>
          </div>
          <div class="modal-actions"><button class="secondary-button" data-close>Cancel</button></div>
        </div>
      </div>`
  }

  if (type === 'shiftStats') return `<div class="modal-backdrop">
    <div class="modal modal-sm">
      <h2>Shift Stats</h2>
      <div class="shift-print-wrap">${buildShiftStats()}</div>
      <div class="modal-actions">
        <button class="secondary-button" data-close>Close</button>
        <button class="primary-button" data-action="print-shift">Print / Save PDF</button>
      </div>
    </div></div>`

  if (type === 'receipt') return `<div class="modal-backdrop">
    <div class="modal">
      <h2>${state.modal.isTicketSlip ? 'Repair Ticket Created' : 'Receipt'}</h2>
      ${state.modal.isTicketSlip ? ticketSlipPreview(state.modal.ticket) : receiptPreview(state.modal.sale)}
      <div class="modal-actions">
        <button class="secondary-button" data-close>Close</button>
        <button class="primary-button" data-action="${state.modal.isTicketSlip ? 'print-ticket-slip' : 'print-receipt'}">Print Receipt</button>
      </div>
    </div></div>`

  if (type === 'repair')          return repairTicketFormHTML(state.modal._info)
  if (type === 'comp-tag-picker') return compTagPickerHTML(state.modal.name)
  if (type === 'repair-collection') return repairCollectionHTML(posState.repairSearch)
  if (type === 'ticket-payment')  return ticketPaymentModalHTML(state.modal)

  if (type === 'override') {
    const cartItem = posState.cart.find(i=>i.productId===state.modal.id)
    return `<div class="modal-backdrop"><form class="modal" data-form="override">
      <h2>Price Override</h2>
      <p class="muted">Original: ${money(cartItem?.originalPrice||0)}</p>
      ${fld('Sold Price','soldPrice',cartItem?.soldPrice||0,'number')}
      <label class="field"><span>Reason for Discount</span><textarea name="reason">${cartItem?.reason||''}</textarea></label>
      ${modalActions()}
    </form></div>`
  }

  if (type === 'udharInfo') return `<div class="modal-backdrop"><form class="modal modal-sm" data-form="udharInfo">
    <h2>Credit Sale — Customer Details</h2>
    <div class="form-grid">${fld('Customer Name','udharName')}${fld('Customer Phone','udharPhone','','tel')}</div>
    ${modalActions()}
  </form></div>`

  if (type === 'udharList') {
    const outstanding = state.data.udharAccounts || []
    return `<div class="modal-backdrop"><div class="modal modal-lg">
      <h2>Outstanding Credits</h2>
      ${outstanding.length===0?`<div class="empty">No outstanding credits.</div>`:`<div style="display:grid;gap:10px">
        ${outstanding.map(u => `
          <div style="padding:12px;background:var(--surface-2);border-radius:8px;display:grid;gap:8px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div><strong>${u.customerName}</strong> · ${u.customerPhone}<br>
                <small class="muted">${u.kind === 'repair' ? 'Repair' : 'Retail'} · ${u.reference} · ${new Date(u.createdAt).toLocaleDateString()}</small></div>
              <span class="badge ${u.status==='Settled'?'good':'bad'}">${u.status}</span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span>Balance: <strong>${money(u.outstanding)}</strong></span>
              <span class="muted">Current total: ${money(u.effectiveObligation)}</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="number" step="any" min="0" max="${u.outstanding}" placeholder="Amount to settle" data-settle-amount="${u.kind}:${u.sourceId}"
                style="flex:1;border:1px solid var(--border);border-radius:6px;padding:7px 9px;background:var(--surface);color:var(--text)">
              <select data-settle-method="${u.kind}:${u.sourceId}"
                style="border:1px solid var(--border);border-radius:6px;padding:7px 9px;background:var(--surface);color:var(--text)">
                ${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer'].map(m => `<option>${m}</option>`).join('')}
              </select>
              <button class="primary-button" data-settle-id="${u.kind}:${u.sourceId}">Settle</button>
            </div>
          </div>`).join('')}
      </div>`}
      <div class="modal-actions"><button class="secondary-button" data-close>Close</button></div>
    </div></div>`
  }

  if (type === 'returnFlow') {
    const receiptInput = state.modal.receiptNo||''
    const context = state.modal.context
    if (!context) return `<div class="modal-backdrop"><form class="modal modal-sm" data-form="return-lookup">
      <h2>Process Return</h2>
      <p class="muted">Enter the invoice number from the original receipt (just the numbers — the "${CFG.invoice_prefix||'INV'}" prefix is added automatically).</p>
      ${fld('Invoice No.','receiptNo',receiptInput)}
      ${state.modal.notFound?`<p style="color:var(--danger);font-size:13px">Invoice not found.</p>`:''}
      <div class="modal-actions"><button class="secondary-button" data-close>Cancel</button><button class="primary-button">Look Up</button></div>
    </form></div>`
    const sale = context.sale
    const items = (context.lines||[]).filter(line => Number(line.remainingQuantity)>0)
    const financial = context.financial||{}
    const currentObligation = Number(financial.originalObligation||0)-Number(financial.commercialReduction||0)
    const netPaid = Number(financial.paymentsReceived||0)-Number(financial.refundsPaid||0)
    const currentOutstanding = Math.max(0,currentObligation-netPaid)
    return `<div class="modal-backdrop"><form class="modal modal-md" data-form="return-confirm">
      <h2>Return — ${sale.invoiceNumber}</h2>
      <p class="muted">${sale.customerName||'Walk-in'} · ${new Date(sale.createdAt).toLocaleDateString()}</p>
      <div style="display:grid;gap:8px;margin:10px 0">
        ${items.length ? items.map(item=>`
          <div style="padding:10px;background:var(--surface-2);border-radius:8px;display:grid;gap:8px">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <span><strong>${item.name}</strong>${item.variantName?` · ${item.variantName}`:''}<br>
                <small class="muted">Sold ${item.soldQuantity} · already returned ${item.alreadyReturned}</small></span>
              <strong>${money(item.remainingValue)} remaining</strong>
            </div>
            <div class="form-grid">
              <label class="field"><span>Return quantity (max ${item.remainingQuantity})</span>
                <input type="number" name="qty_${item.saleLineId}" min="0" max="${item.remainingQuantity}" step="1" value="0"
                  data-return-qty="${item.saleLineId}"></label>
              ${item.itemKind==='inventory'?`<label class="field"><span>Return to sellable stock?</span>
                <select name="restock_${item.saleLineId}"><option value="true">Yes</option><option value="false">No — damaged/non-sellable</option></select>
              </label>`:''}
            </div>
          </div>`).join('') : '<div class="empty">All quantities on this invoice have already been returned.</div>'}
      </div>
      <label class="field"><span>Refund Method</span>
        <select name="refundMethod">${['Cash','Raast','JazzCash','EasyPaisa','Bank Transfer'].map(m => `<option>${m}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Reason</span><textarea name="notes" required></textarea></label>
      <div style="padding:10px;background:var(--surface-2);border-radius:8px;display:grid;gap:4px">
        <div style="display:flex;justify-content:space-between"><span>Current obligation</span><strong>${money(currentObligation)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span>Net paid</span><strong>${money(netPaid)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span>Current outstanding</span><strong>${money(currentOutstanding)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span>Return value</span><strong id="return-value-preview">${money(0)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span>Actual refund due</span><strong id="refund-due-preview">${money(0)}</strong></div>
      </div>
      <input type="hidden" name="saleId" value="${sale.id}">
      <div class="modal-actions"><button class="secondary-button" data-close>Cancel</button><button class="primary-button" ${items.length?'':'disabled'}>Process Return</button></div>
    </form></div>`
  }

  if (type === 'qitem-pick') {
    const { name, prices } = state.modal
    return `<div class="modal-backdrop"><div class="modal modal-xs">
      <h2>${name}</h2><p class="muted">Select price:</p>
      <div style="display:grid;gap:8px;margin-top:8px">
        ${(prices||[]).map((p,i)=>`<button class="secondary-button" style="font-size:16px;min-height:48px" data-pick-price="${i}">${p.name ? `${p.name} — ${money(p.price)}` : money(p.price)}</button>`).join('')}
      </div>
      <div class="modal-actions"><button class="secondary-button" data-close>Cancel</button></div>
    </div></div>`
  }

  return ''
}

/* ── Cart helpers ── */
function updateQty(productId, delta) {
  const item = posState.cart.find(i=>i.productId===productId)
  if (!item) return
  item.qty += delta
  posState.cart = posState.cart.filter(i=>i.qty>0)
  render()
}

function removeCartItem(productId) {
  posState.cart = posState.cart.filter(i=>i.productId!==productId)
  if (!posState.cart.some(i => i.isTicket)) {
    posState.cartTicketId = null
    posState.cartIsNewTicket = false
  }
  render()
}

function retailReturnSelection(context) {
  const selected = []
  let reduction = 0
  for (const line of context?.lines||[]) {
    const input = document.querySelector(`[data-return-qty="${line.saleLineId}"]`)
    const quantity = Number(input?.value||0)
    if (!Number.isInteger(quantity) || quantity<=0) continue
    const remaining = Number(line.remainingQuantity||0)
    if (quantity>remaining) return { error:`Return quantity for ${line.name} exceeds ${remaining}.` }
    const lineReduction = quantity===remaining
      ? Number(line.remainingValue||0)
      : Math.round((Number(line.grossLineValue||0)*quantity/Number(line.soldQuantity||1))*100)/100
    reduction += lineReduction
    selected.push({
      saleLineId:Number(line.saleLineId), quantity,
      restock:line.itemKind==='inventory'
        ? document.querySelector(`[name="restock_${line.saleLineId}"]`)?.value==='true'
        : false,
      name:line.name, sold_price:lineReduction/quantity,
    })
  }
  const financial = context?.financial||{}
  const currentObligation = Number(financial.originalObligation||0)-Number(financial.commercialReduction||0)
  const netPaid = Number(financial.paymentsReceived||0)-Number(financial.refundsPaid||0)
  const newObligation = Math.max(0,currentObligation-reduction)
  return {
    lines:selected,
    reduction:Math.round(reduction*100)/100,
    refundDue:Math.round(Math.max(0,netPaid-newObligation)*100)/100,
  }
}

function refreshRetailReturnPreview() {
  if (state.modal?.type!=='returnFlow' || !state.modal.context) return
  const preview = retailReturnSelection(state.modal.context)
  if (preview.error) return
  const reductionEl = document.getElementById('return-value-preview')
  const refundEl = document.getElementById('refund-due-preview')
  if (reductionEl) reductionEl.textContent=money(preview.reduction)
  if (refundEl) refundEl.textContent=money(preview.refundDue)
}

/* ── Place Order: lock the ticket, create the invoice ── */
async function placeOrder() {
  dlog('POS.placeOrder', 'ENTRY')
  const ticketItem = posState.cart.find(i => i.isTicket)
  if (!ticketItem) { dlog('POS.placeOrder', 'no ticketItem in cart -- abort'); return }

  if (ticketItem.isNewTicket) {
    dlog('POS.placeOrder', 'isNewTicket branch -- calling repairs.insertNewTicketFromCart()')
    const res = await insertNewTicketFromCart(ticketItem)
    if (!res.ok) { dlog('POS.placeOrder', `INSERT FAILED: ${res.error}`); showToast('Error placing order: ' + res.error, 'error'); return }
    dlog('POS.placeOrder', `INSERT SUCCEEDED ticket_number=${res.data.ticket_number} id=${res.data.id} -- calling load() next`)

    posState.cart = posState.cart.filter(i => !i.isTicket)
    posState.cartTicketId = null
    posState.cartIsNewTicket = false
    await load()
    dlog('POS.placeOrder', 'load() returned -- setting state.modal=receipt and calling render() explicitly')
    state.modal = { type:'receipt', isTicketSlip:true, ticket: res.data }
    render()
    dlog('POS.placeOrder', 'DONE -- receipt modal should now be visible')
    return
  }

  // Existing ticket — this is a top-up payment being added via cart.
  const ticketId = ticketItem.ticketId
  const ticket = state.data.tickets.find(t => t.id === ticketId)
  if (!ticket) return

  const payAmount = ticketItem.topupAmount
  const payMethod = ticketItem.topupMethod
  dlog('POS.placeOrder', 'existing-ticket branch -- calling repairs.collectTicketPayment()')
  const res = await collectTicketPayment(ticket, payAmount, payMethod, ticketItem.requestId)
  if (!res.ok) { showToast('Error recording payment: ' + res.error, 'error'); return }

  posState.cart = posState.cart.filter(i => !i.isTicket)
  posState.cartTicketId = null
  posState.cartIsNewTicket = false
  await load()
  const leftoverBalance = combinedBalance(state.data.tickets.find(t=>t.id===ticketId)||ticket).total
  showToast(`Payment of ${money(payAmount)} recorded. Remaining balance: ${money(leftoverBalance)}`, 'success')
}


/* ── Standard checkout (retail items, no ticket in cart) ── */
async function doCheckout() {
  const isSplit = posState.checkoutPayment === 'Split Payment'
  const isUdhar = posState.checkoutPayment === 'Udhar (Credit)' || (isSplit && Number(posState.splitCredit||0)>0)
  if (isSplit) {
    const subtotal = posState.cart.reduce((sum,item)=>sum+Number(item.soldPrice||0)*Number(item.qty||0),0)
    const total = Math.round((subtotal + subtotal*Number(CFG.tax_rate||0)/100 + Number.EPSILON)*100)/100
    const splitTotal = Math.round((Number(posState.splitCash||0)+Number(posState.splitDigital||0)+Number(posState.splitCredit||0)+Number.EPSILON)*100)/100
    if (splitTotal !== total || Number(posState.splitCash||0)<0 || Number(posState.splitDigital||0)<0 || Number(posState.splitCredit||0)<0) {
      showToast(`Split amounts must add up to ${money(total)}.`, 'warning'); return
    }
  }

  if (isUdhar && (!posState.udharName?.trim()||!posState.udharPhone?.trim())) {
    state.modal = { type:'udharInfo' }; render(); return
  }

  if (isUdhar) {
    openPinPrompt('udhar', async (verified) => {
      if (!verified) return
      await _finalizeCheckout()
    }, render)
    return
  }

  await _finalizeCheckout()
}

async function _finalizeCheckout() {
  dlog('POS._finalizeCheckout', 'ENTRY -- calling checkout.finalizeCheckout()')
  posState.checkoutRequestId ||= crypto.randomUUID()
  const res = await finalizeCheckout({
    cart: posState.cart,
    checkoutPayment: posState.checkoutPayment,
    cashTendered: posState.cashTendered,
    udharName: posState.udharName,
    udharPhone: posState.udharPhone,
    udharPaidNow: posState.udharPaidNow,
    splitCash: posState.splitCash,
    splitDigital: posState.splitDigital,
    splitMethod: posState.splitMethod,
    splitCredit: posState.splitCredit,
    employeeName: SESSION.employee?.name,
    requestId: posState.checkoutRequestId,
  })
  if (!res.ok) { dlog('POS._finalizeCheckout', `FAILED: ${res.error}`); showToast('Sale error: ' + res.error, 'error'); return }

  posState.cart=[]
  posState.checkoutRequestId=null
  posState.cashTendered=0
  posState.splitCash=0; posState.splitDigital=0; posState.splitMethod='Raast'; posState.splitCredit=0
  posState.udharName=''; posState.udharPhone=''; posState.udharPaidNow=0; posState.checkoutPayment='Cash'
  state.modal = { type:'receipt', sale: res.sale }
  await load()
  dlog('POS._finalizeCheckout', `DONE receiptNo=${res.sale.receiptNo}`)
}

/* ═══════════════════════════════════════════════════════════════════
   EVENT DELEGATION — called exactly once in initPOS
═══════════════════════════════════════════════════════════════════ */
function attachEvents() {
  const app = document.getElementById('app')
  dlog('POS.attachEvents', 'listeners attached to #app (click + submit)')

  /* ── Click ── */
  app.addEventListener('click', async e => {
    // Route guard: see the matching comment in admin.js's attachEvents()
    // for the full explanation -- this listener stays attached for the
    // rest of the session once /pos has been visited, even after
    // navigating elsewhere. Only act when /pos is truly the current route.
    if (!window.location.pathname.startsWith('/pos')) return

    const el = e.target.closest(
      'button,[data-close],[data-action],[data-modal],[data-qty],' +
      '[data-collect-ticket],[data-inv-pos-add],[data-qitem-name],' +
      '[data-pick-price],[data-tag-pick],[data-settle-id],' +
      '[data-draft-comp-remove],[data-draft-payment-remove],[data-remove-cart-item],' +
      '[data-mark-not-needed],[data-subinv-comp-remove],[data-add-draft-comp-name],[data-tag-select],' +
      '[data-pp-key]'
    )
    if (!el) return
    dlog('POS.click', `el MATCHED selector -- action=${el.dataset.action} close=${el.dataset.close} tag=${el.tagName}`)

    /* PIN numpad */
    if (el.dataset.ppKey !== undefined) {
      handlePpKey(el.dataset.ppKey); return
    }

    /* Close modal */
    if (el.dataset.close !== undefined) {
      dlog('POS.click', `DATA-CLOSE branch firing -- state.modal was type=${state.modal?.type} -- about to call POS.render()`)
      if (state.modal?.type === 'pinPrompt') { cancelPinPrompt(render); return }
      state.modal = null; render(); return
    }

    /* Modal openers */
    if (el.dataset.modal) {
      if (el.dataset.modal === 'repair') resetDraft() // starting a genuinely new ticket, not a mid-flow modal switch
      state.modal = { type: el.dataset.modal, id: el.dataset.id }; render(); return
    }

    /* ── Top-bar ── */
    if (el.dataset.action === 'go-admin') {
      navigate('/admin'); return
    }
    if (el.dataset.action === 'go-workshop') {
      navigate('/workshop'); return
    }
    /* Workshop-off fallback: PIN-gated repair ticket editor */
    if (el.dataset.action === 'pos-edit-ticket') {
      const ticketId = el.dataset.ticketId
      openPinPrompt('admin', async (verified) => {
        if (!verified) return
        const subs = await getSubInvoices(ticketId)
        state.modal = { type: 'edit-components', id: ticketId, subInvoices: subs }
        render()
      }, render)
      return
    }

    /* Mark a component "not needed" — requires PIN, never deletes */
    if (el.dataset.markNotNeeded !== undefined) {
      const ticketId = state.modal?.id
      state.modal = { type: 'mark-not-needed', ticketId, index: Number(el.dataset.markNotNeeded) }
      render(); return
    }
    if (el.dataset.action === 'confirm-not-needed') {
      const reason = document.getElementById('not-needed-reason')?.value?.trim()
      if (!reason) { showToast('Enter a reason.', 'warning'); return }
      const { ticketId, index } = state.modal
      openPinPrompt('remove-component', async (verified) => {
        if (!verified) return
        const tk = state.data.tickets.find(t => String(t.id) === String(ticketId))
        if (!tk) return
        const res = await markComponentNotNeeded(Number(ticketId), index, reason)
        if (!res.ok) { showToast('Error: ' + res.error, 'error'); return }
        await load()
        const subs = await getSubInvoices(ticketId)
        state.modal = { type: 'edit-components', id: ticketId, subInvoices: subs }
        render()
      }, render)
      return
    }

    /* Open sub-invoice creation form */
    if (el.dataset.action === 'open-create-sub-invoice') {
      state.modal = { type: 'create-sub-invoice', parentId: el.dataset.ticketId, draftComponents: [], draftLabour: 0 }
      render(); return
    }

    /* Remove component from the sub-invoice draft */
    if (el.dataset.subinvCompRemove !== undefined) {
      const parentId = state.modal?.parentId
      const comps = readSubInvCompsFromDOM()
      comps.splice(Number(el.dataset.subinvCompRemove), 1)
      state.modal = { type: 'create-sub-invoice', parentId, draftComponents: comps, draftLabour: readSubInvLabourFromDOM() }
      render(); return
    }

    /* Add predefined component to the draft — opens tag picker */
    if (el.dataset.addDraftCompName) {
      state.modal = {
        type:     'add-comp-tag',
        compName: el.dataset.addDraftCompName,
        _parentId: state.modal?.parentId,
        _draftComponents: readSubInvCompsFromDOM(),
        _draftLabour: readSubInvLabourFromDOM(),
      }
      render(); return
    }

    /* Add custom component to the draft — opens tag picker */
    if (el.dataset.action === 'add-custom-draft-comp') {
      const name = document.getElementById('custom-comp-name')?.value?.trim()
      if (!name) { showToast('Enter a component name.', 'warning'); return }
      state.modal = {
        type:     'add-comp-tag',
        compName: name,
        _parentId: state.modal?.parentId,
        _draftComponents: readSubInvCompsFromDOM(),
        _draftLabour: readSubInvLabourFromDOM(),
      }
      render(); return
    }

    /* Tag selection for the sub-invoice draft — Broken / Not Working / Custom */
    if (el.dataset.tagSelect) {
      const tag = el.dataset.tagSelect
      if (tag === 'Custom') {
        const wrap = document.getElementById('custom-tag-wrap')
        if (wrap) wrap.classList.remove('hidden')
        return
      }
      _addComponentToDraft(state.modal.compName, tag, '')
      return
    }
    if (el.dataset.action === 'confirm-draft-custom-tag') {
      const text = document.getElementById('custom-tag-text')?.value?.trim()
      if (!text) { showToast('Describe the issue.', 'warning'); return }
      _addComponentToDraft(state.modal.compName, 'Custom', text)
      return
    }

    /* Create the sub-invoice — no PIN required, adding only increases what's owed */
    if (el.dataset.action === 'submit-sub-invoice') {
      const parentId = el.dataset.parentId
      const tk = state.data.tickets.find(t => String(t.id) === String(parentId))
      if (!tk) return
      const comps  = readSubInvCompsFromDOM()
      const labour = readSubInvLabourFromDOM()
      const note   = document.getElementById('sub-invoice-note')?.value || ''
      if (!comps.length && !labour) { showToast('Add at least one component or a labour charge.', 'warning'); return }

      const res = await createSubInvoice(tk, comps, labour, note, SESSION.employee?.name)
      if (!res.ok) { showToast('Error: ' + res.error, 'error'); return }

      const { buildSubInvoiceSlip, printThermal } = await import('../print/print.js')
      printThermal(buildSubInvoiceSlip(res.data, tk))

      state.modal = null
      await load(); return
    }

    if (el.dataset.action === 'my-account') {
      state.modal = { type: 'myAccount' }; render(); return
    }
    if (el.dataset.action === 'theme') {
      state.theme = state.theme==='dark'?'light':'dark'
      localStorage.setItem('retailos-theme', state.theme)
      applyBranding(); render(); return
    }
    if (el.dataset.action === 'ems-clock-out') {
      const { handleClockOut } = await import('../features/ems/index.js')
      handleClockOut(SESSION, async () => {
        await confirmAction({
          title: 'Log out?',
          message: 'Your shift is clocked out. Log out now?',
          confirmLabel: 'Log out',
          tone: 'danger',
          action: async () => { await _clearSession(); return true },
        })
      })
      return
    }
    if (el.dataset.action === 'logout') {
      await confirmAction({
        title: 'Log out?',
        message: 'Are you sure you want to log out?',
        confirmLabel: 'Log out',
        tone: 'danger',
        action: async () => { await _clearSession(); return true },
      })
      return
    }
    if (el.dataset.action === 'install' && state.installPrompt) {
      await runInstallPrompt(); render(); return
    }

    /* ── Shift stats ── */
    if (el.dataset.action === 'shift-stats')  { state.modal = { type:'shiftStats' }; render(); return }
    if (el.dataset.action === 'print-shift')  { const { printThermal } = await import('../print/print.js'); printThermal(buildShiftStats()); return }
    if (el.dataset.action === 'print-receipt') {
      if (state.modal?.sale) {
        const { buildReceiptSlip, printThermal } = await import('../print/print.js')
        printThermal(buildReceiptSlip(state.modal.sale))
      }
      return
    }
    if (el.dataset.action === 'print-ticket-slip') {
      dlog('POS.click', `PRINT-TICKET-SLIP branch firing -- state.modal.ticket=${JSON.stringify(state.modal?.ticket?.ticket_number)}`)
      if (state.modal?.ticket) {
        const { buildTicketSlip, printThermal } = await import('../print/print.js')
        printThermal(buildTicketSlip(state.modal.ticket))
      }
      return
    }

    /* ── Repair collection modal ── */
    if (el.dataset.action === 'open-repair-collection') {
      posState.repairSearch = ''
      state.modal = { type:'repair-collection' }; render(); return
    }
    if (el.dataset.action === 'retry-repair-summary') {
      const ticket = state.data.tickets.find(t => String(t.id) === String(el.dataset.ticketId)) || state.modal?.ticket
      if (ticket) await openCollectTicket(ticket)
      return
    }

    /* ── Quick collect from main screen row or repair collection modal ── */
    if (el.dataset.collectTicket) {
      const ticket = state.data.tickets.find(t => String(t.id) === String(el.dataset.collectTicket))
      if (!ticket) return
      state.modal = null; render()
      openCollectTicket(ticket); return
    }

    /* ── Add top-up payment to cart (from ticket-payment modal) ── */
    if (el.dataset.action === 'add-to-cart-for-payment') {
      const ticketId = el.dataset.ticketId
      const amount   = Number(document.getElementById('topup-amount')?.value || 0)
      const method   = document.getElementById('topup-method')?.value || 'Cash'
      if (!amount || amount <= 0) { showToast('Enter a payment amount.', 'warning'); return }
      const ticket = state.data.tickets.find(t => String(t.id) === String(ticketId))
      if (!ticket) return
      posState.cart = posState.cart.filter(i => !i.isTicket)
      posState.cart.push({
        productId:     `ticket-${ticket.id}`,
        name:          `Payment on ${ticket.invoice_number||ticket.ticket_number} (${ticket.device_brand} ${ticket.device_model})`,
        qty:           1,
        soldPrice:     amount,
        originalPrice: amount,
        discount:      0,
        reason:        '',
        isTicket:      true,
        isNewTicket:   false,
        ticketId:      ticket.id,
        topupAmount:   amount,
        topupMethod:   method,
        requestId:     crypto.randomUUID(),
      })
      posState.cartTicketId = ticket.id
      state.modal = null
      render(); return
    }

    if (el.dataset.action === 'deliver-repair') {
      const ticketId = Number(el.dataset.ticketId)
      await confirmAction({
        title: 'Deliver repair?',
        message: 'Mark this fully paid repair as delivered to the customer?',
        confirmLabel: 'Deliver device',
        action: async () => {
          const res = await deliverRepair(ticketId, false)
          if (!res.ok) { showToast('Delivery error: ' + res.error, 'error'); return false }
          state.modal = null
          await load()
          showToast('Device marked as Delivered.', 'success')
          return true
        },
      })
      return
    }
    if (el.dataset.action === 'print-repair-summary') {
      const summaryResult = await getRepairFamilySummary(Number(el.dataset.ticketId))
      if (!summaryResult.ok) { showToast('Summary error: ' + summaryResult.error, 'error'); return }
      const { buildRepairSummary, printThermal } = await import('../print/print.js')
      printThermal(buildRepairSummary(summaryResult.data)); return
    }

    if (el.dataset.action === 'deliver-repair-udhar') {
      const ticketId = Number(el.dataset.ticketId)
      openPinPrompt('udhar', async verified => {
        if (!verified) return
        const res = await deliverRepair(ticketId, true)
        if (!res.ok) { showToast('Delivery error: ' + res.error, 'error'); return }
        state.modal = null
        await load()
        showToast('Device delivered with the remaining balance approved as Udhar.', 'success')
      }, render)
      return
    }

    /* ── Place Order (ticket in cart) ── */
    if (el.dataset.action === 'place-order') {
      await placeOrder(); return
    }

    /* ── Standard Checkout ── */
    if (el.dataset.action === 'checkout') {
      const hasDiscount = posState.cart.some(i => i.discount > 0)
      if (hasDiscount && CFG.discount_pin_required) {
        openPinPrompt('discount', async (verified) => {
        if (!verified) return
        await doCheckout()
      }, render); return
      }
      await doCheckout(); return
    }

    /* ── Cart qty + remove ── */
    if (el.dataset.qty) { updateQty(el.dataset.qty, Number(el.dataset.delta)); return }
    if (el.dataset.removeCartItem) { removeCartItem(el.dataset.removeCartItem); return }

    /* ── Custom item ── */
    if (el.dataset.action === 'add-custom-item') {
      const name  = document.getElementById('custom-item-name')?.value?.trim()
      const price = parseFloat(document.getElementById('custom-item-price')?.value || '0')
      if (!name)    { showToast('Enter item name.', 'warning'); return }
      if (price<=0) { showToast('Enter valid price.', 'warning'); return }
      posState.cart.push({ productId:`custom-${Date.now()}`, name, qty:1, originalPrice:price, soldPrice:price, discount:0, reason:'', isCustom:true })
      document.getElementById('custom-item-name').value = ''
      document.getElementById('custom-item-price').value = ''
      render(); return
    }

    /* ── Inventory POS tap ── */
    if (el.dataset.invPosAdd && _inv) {
      _inv.handleInvPosAdd(el, posState)
      render(); return
    }

    /* ── Quick items ── */
    if (el.dataset.qitemName) {
      const raw = JSON.parse(el.dataset.qitemPrices||'[]'), name = el.dataset.qitemName
      const quickItemId = Number(el.dataset.qitemId)
      const prices = raw.map(p => (typeof p === 'object' && p !== null) ? p : { name:'', price:p })
      if (prices.length === 1) {
        const pv = prices[0]
        posState.cart.push({ productId:`qi-${quickItemId}-${Date.now()}`, name, variantName: pv.name||'', qty:1, originalPrice:pv.price, soldPrice:pv.price, discount:0, reason:'', isQuick:true, quickItemId })
        render()
      } else { state.modal = { type:'qitem-pick', name, prices, quickItemId }; render() }
      return
    }
    if (el.dataset.pickPrice !== undefined) {
      const { name, prices, quickItemId } = state.modal
      const pv = prices[Number(el.dataset.pickPrice)]
      posState.cart.push({ productId:`qi-${quickItemId}-${Date.now()}`, name, variantName: pv.name||'', qty:1, originalPrice:pv.price, soldPrice:pv.price, discount:0, reason:'', isQuick:true, quickItemId })
      state.modal = null; render(); return
    }

    /* ── Component tag picker ── */
    if (el.dataset.pickComp) {
      // Snapshot current form field values before switching to tag picker
      const form = document.querySelector("[data-form='repair']")
      if (form) {
        state.modal._info = Object.fromEntries(new FormData(form).entries())
      }
      state.modal = { type:'comp-tag-picker', name:el.dataset.pickComp, _info:state.modal?._info }
      render(); return
    }
    if (el.dataset.tagPick) {
      const tag      = el.dataset.tagPick
      const compName = state.modal.name
      const parentDraft = getDraft()
      const parentInfo  = state.modal._info
      if (tag === 'Custom') {
        document.getElementById('tag-custom-wrap')?.classList.remove('hidden')
        return
      }
      if (!parentDraft) { state.modal = null; render(); return }
      parentDraft.components.push({ name:compName, tag, customText:'', price:0 })
      state.modal = { type:'repair', _info:parentInfo }
      render(); return
    }
    if (el.dataset.action === 'confirm-custom-tag') {
      const text     = document.getElementById('tag-custom-text')?.value?.trim()
      const compName = state.modal.name
      const parentDraft = getDraft()
      const parentInfo  = state.modal._info
      if (!text) { showToast('Describe the issue.', 'warning'); return }
      parentDraft.components.push({ name:compName, tag:'Custom', customText:text, price:0 })
      state.modal = { type:'repair', _info:parentInfo }
      render(); return
    }

    /* ── Draft form actions ── */
    if (el.dataset.draftCompRemove !== undefined) {
      const form = document.querySelector("[data-form='repair']")
      if (form) state.modal._info = Object.fromEntries(new FormData(form).entries())
      getDraft().components.splice(Number(el.dataset.draftCompRemove), 1); render(); return
    }
    if (el.dataset.draftPaymentRemove !== undefined) {
      const form = document.querySelector("[data-form='repair']")
      if (form) state.modal._info = Object.fromEntries(new FormData(form).entries())
      getDraft().payments.splice(Number(el.dataset.draftPaymentRemove), 1); render(); return
    }
    if (el.dataset.action === 'draft-add-payment') {
      const amount = Number(document.getElementById('draft-pay-amount')?.value||0)
      const method = document.getElementById('draft-pay-method')?.value||'Cash'
      if (!amount||amount<=0) { showToast('Enter a payment amount.', 'warning'); return }
      const form = document.querySelector("[data-form='repair']")
      if (form) state.modal._info = Object.fromEntries(new FormData(form).entries())
      getDraft().payments.push({ amount, method })
      document.getElementById('draft-pay-amount').value = ''
      render(); return
    }
    if (el.dataset.action === 'draft-set-override') {
      getDraft().overridePrice = ''
      render(); return
    }
    if (el.dataset.action === 'draft-clear-override') {
      getDraft().overridePrice = null
      render(); return
    }

    /* ── Udhar / Return ── */
    if (el.dataset.action === 'open-udhar')   { state.modal = { type:'udharList' };  render(); return }
    if (el.dataset.action === 'open-leave-request') {
      state.modal = { type: 'leave-request' }; render(); return
    }
  
    if (el.dataset.action === 'open-return')  { state.modal = { type:'returnFlow' }; render(); return }

    /* ── Settle Udhar ── */
    if (el.dataset.settleId) {
      const accountKey = el.dataset.settleId
      const amount  = Number(document.querySelector(`[data-settle-amount="${accountKey}"]`)?.value)
      const method  = document.querySelector(`[data-settle-method="${accountKey}"]`)?.value||'Cash'
      if (!amount||amount<=0) { showToast('Enter a valid amount.', 'warning'); return }
      openPinPrompt('settle', async (verified) => {
        if (!verified) return
        const rec = (state.data.udharAccounts || []).find(u => `${u.kind}:${u.sourceId}` === accountKey)
        const res = await settleUdhar(rec, amount, method)
        if (!res.ok) { showToast('Settle error: ' + res.error, 'error'); return }
        await load()
        state.modal = { type:'udharList' }
        render()
      }, render); return
    }
  })

  /* ── Input ── */
  app.addEventListener('input', e => {
    const t = e.target
    if (t.dataset.cashTendered !== undefined) {
      posState.cashTendered = Number(t.value)||0
      const subtotal = posState.cart.reduce((s,i)=>s+i.soldPrice*i.qty,0)
      const tax = subtotal*(Number(CFG.tax_rate||0)/100)
      const change = posState.cashTendered-(subtotal+tax)
      const existing = document.getElementById('change-display')
      if (existing) existing.remove()
      if (posState.cashTendered > 0) {
        const div = document.createElement('div')
        div.id = 'change-display'
        div.style.cssText = `display:flex;justify-content:space-between;padding:9px 12px;border-radius:8px;font-weight:600;font-size:15px;margin-top:4px;background:${change>=0?'color-mix(in srgb,#22c55e 12%,var(--surface))':'color-mix(in srgb,#ef4444 12%,var(--surface))'}`
        div.innerHTML = `<span>${change>=0?'Change Due':'Short by'}</span><span style="color:${change>=0?'#22c55e':'#ef4444'}">${money(Math.abs(change))}</span>`
        t.parentNode.insertBefore(div, t.nextSibling)
      }
    }
    if (t.dataset.split === 'cash') posState.splitCash = Number(t.value)||0
    if (t.dataset.split === 'digital') posState.splitDigital = Number(t.value)||0
    if (t.dataset.split === 'credit') posState.splitCredit = Number(t.value)||0
    if (t.dataset.invSearch !== undefined)    { posState.invSearch = t.value; render() }
    if (t.dataset.repairSearch !== undefined) { posState.repairSearch = t.value; render() }
    if (t.dataset.returnQty !== undefined) refreshRetailReturnPreview()
    if (t.dataset.draftCompPrice !== undefined) {
      const idx = Number(t.dataset.draftCompPrice)
      const draft = getDraft()
      if (draft.components[idx]) { draft.components[idx].price = Number(t.value)||0; _refreshDraftTotals() }
    }
    if (t.dataset.draftLabour !== undefined) {
      getDraft().labour = Number(t.value)||0; _refreshDraftTotals()
    }
    if (t.dataset.subinvCompPrice !== undefined || t.dataset.subinvLabour !== undefined) {
      updateSubInvDraftTotal()
    }
    if (t.dataset.draftOverride !== undefined) {
      getDraft().overridePrice = t.value; _refreshDraftTotals()
    }
  })

  /* ── Enter key submits quick-add inputs that aren't inside a <form> ── */
  app.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return
    const map = {
      'tag-custom-text':  'confirm-custom-tag',
      'custom-tag-text':  'confirm-draft-custom-tag',
      'custom-comp-name': 'add-custom-draft-comp',
    }
    const action = map[e.target.id]
    if (!action) return
    e.preventDefault()
    document.querySelector(`[data-action="${action}"]`)?.click()
  })

  /* ── Change ── */
  app.addEventListener('change', e => {
    const t = e.target
    if (t.dataset.action === 'payment') {
      posState.checkoutPayment = t.value; posState.cashTendered = 0; render(); return
    }
    if (t.dataset.split === 'method') { posState.splitMethod = t.value; return }
    if (t.dataset.udhar === 'name')  { posState.udharName  = t.value; return }
    if (t.dataset.udhar === 'phone') { posState.udharPhone = t.value; return }
    if (t.dataset.udhar === 'paidNow') { posState.udharPaidNow = Number(t.value)||0; return }
  })

  /* ── Submit ── */
  app.addEventListener('submit', async e => {
    if (!window.location.pathname.startsWith('/pos')) return
    e.preventDefault()
    const form = e.target
    const data = Object.fromEntries(new FormData(form).entries())
    const type = form.dataset.form
    dlog('POS.submit', `ENTRY form.dataset.form=${type}`)

    if (type === 'repair') {
      dlog('POS.submit', 'repair branch -- adding draft ticket to cart (no DB write yet)')
      const draft = getDraft()
      if (!data.customerName?.trim()) { showToast('Customer name is required.', 'warning'); return }
      if (!data.customerPhone?.trim()) { showToast('Customer phone is required.', 'warning'); return }
      if (!data.deviceBrand?.trim())  { showToast('Device brand is required.', 'warning'); return }
      if (!data.deviceModel?.trim())  { showToast('Device model is required.', 'warning'); return }

      const total = calcDraftTotal(draft)
      const paid  = calcDraftPaid(draft)

      // Don't actually save to DB yet — just add to cart as "new ticket"
      // Saving happens when "Place Order" is clicked
      posState.cart = posState.cart.filter(i => !i.isTicket)
      posState.cart.push({
        productId:     `new-ticket-${Date.now()}`,
        name:          `Repair: ${data.deviceBrand} ${data.deviceModel} (${data.customerName})`,
        qty:           1,
        soldPrice:     Math.max(0, total - paid),
        originalPrice: Math.max(0, total - paid),
        discount:      0,
        reason:        '',
        isTicket:      true,
        isNewTicket:   true,
        requestId:     crypto.randomUUID(),
        customerName:  data.customerName,
        customerPhone: data.customerPhone,
        deviceBrand:   data.deviceBrand,
        deviceModel:   data.deviceModel,
        imei:          data.imei||'',
        technicianNote:data.technicianNote||'',
        draftData:     { ...draft },
      })
      posState.cartIsNewTicket = true
      state.modal = null
      render(); return
    }

    if (type === 'udharInfo') {
      posState.udharName  = data.udharName
      posState.udharPhone = data.udharPhone
      state.modal = null
      await doCheckout(); return
    }

    if (type === 'return-lookup') {
      const found = (state.data.sales||[]).find(s => matchesInvoiceSearch(s.invoice_number, data.receiptNo, CFG.invoice_prefix))
      if (!found) {
        state.modal = { type:'returnFlow', notFound:true, receiptNo:data.receiptNo }
        render(); return
      }
      const lookup = await getRetailReturnContext(found.id)
      if (!lookup.ok) { showToast('Return lookup failed: '+lookup.error, 'error'); return }
      state.modal = { type:'returnFlow', receiptNo:found.invoice_number, context:lookup.data }
      render(); return
    }

    if (type === 'return-confirm') {
      const saleId   = Number(data.saleId)
      const context  = state.modal?.context
      const preview  = retailReturnSelection(context)
      if (preview.error) { showToast(preview.error, 'warning'); return }
      if (!preview.lines.length) { showToast('Enter a return quantity for at least one item.', 'warning'); return }
      const reason = String(data.notes||'').trim()
      if (!reason) { showToast('Enter a return reason.', 'warning'); return }
      openPinPrompt('return', async (verified) => {
        if (!verified) return
        const result = await createRetailReturn(saleId,preview.lines.map(({saleLineId,quantity,restock}) => ({saleLineId,quantity,restock})),data.refundMethod,reason)
        if (!result.ok) { showToast('Return error: '+result.error, 'error'); return }
        const refund = Number(result.data?.return?.refund_amount||0)
        const { buildReturnSlip, printThermal } = await import('../print/print.js')
        printThermal(buildReturnSlip({
          invoiceNumber:context?.sale?.invoiceNumber||`#${saleId}`,
          items:preview.lines.map(line => ({ name:line.name, qty:line.quantity, sold_price:line.sold_price })),
          refund, method:refund>0?data.refundMethod:'No cash refund',
        }))
        state.modal = null; await load()
        showToast(`Return completed. Refund: ${money(refund)}`, 'success')
      }, render); return
    }

    if (type === 'change-password') {
      const result = await handleChangePasswordSubmit(SESSION, data)
      const errEl = document.getElementById('change-password-error')
      if (!result.ok) {
        if (errEl) { errEl.textContent = result.error; errEl.classList.remove('hidden') }
        return
      }
      state.modal = null
      showToast('Password updated.', 'success')
      render(); return
    }

    if (type === 'leave-request') {
      const result = await submitLeaveRequest(SESSION, data)
      if (!result.ok) { showToast('Error: ' + result.error, 'error'); return }
      state.modal = null
      showToast('Leave request submitted. Your manager will review it.', 'success')
      render(); return
    }
    if (type === 'override') {
      const item = posState.cart.find(i=>i.productId===state.modal?.id)
      if (item) {
        item.soldPrice  = Number(data.soldPrice)
        item.discount   = Math.max(0, item.originalPrice - item.soldPrice)
        item.reason     = data.reason
      }
      state.modal = null; render(); return
    }
  })

}

/* ── Live draft total refresh (no full re-render — just update the display) ── */
function _refreshDraftTotals() {
  try {
    const draft   = getDraft()
    const total   = calcDraftTotal(draft)
    const paid    = calcDraftPaid(draft)
    const balance = Math.max(0, total - paid)
    const tEl = document.querySelector('[data-draft-total]')
    const pEl = document.querySelector('[data-draft-paid]')
    const bEl = document.querySelector('[data-draft-balance]')
    if (tEl) tEl.textContent = money(total)
    if (pEl) pEl.textContent = money(paid)
    if (bEl) bEl.textContent = money(balance)
  } catch {}
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC ENTRY POINT
═══════════════════════════════════════════════════════════════════ */
export async function initPOS(sess) {
  dlog('POS.initPOS', `ENTRY _eventsAttached=${_eventsAttached} caller=[${callerInfo()}]`)
  SESSION = sess
  state.role = sess.employee?.role || null
  await load()
}
