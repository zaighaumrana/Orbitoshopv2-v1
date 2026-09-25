import { escapeHTML, safeImageURL } from '../html.js'
import { createSubInvoiceModalHTML, rememberAdditionalWorkInput, submitAdditionalWorkDraft } from '../features/repairs/additional-work.js'
/* ═══════════════════════════════════════════════════════════════════
   RetailOS — workshop.js
   Roles served: Technician, Business Owner (when switching to workshop)
   Single attachEvents() architecture, router-driven navigation.
═══════════════════════════════════════════════════════════════════ */
import {
  leaveRequestHTML,
  submitLeaveRequest,
  handleClockOut,
} from '../features/ems/index.js'

import {
  sb, state, CFG, loadConfig, applyBranding, currentTenant,
  _clearSession, can, modalEntitled, money, moneyHTML, fld, modalActions,
  openPinPrompt, pinPromptHTML, handlePpKey, cancelPinPrompt, normalizeModalControls,
  myAccountModalHTML, handleChangePasswordSubmit,
  showTransactionSuccess, showBlockingError, showToast, confirmAction, runInstallPrompt,
} from '../shared.js'
import {
  getSubInvoices, markComponentNotNeeded, getRepairFamilySummary,
} from '../features/repairs/api.js'
import { findRepairFamilies, groupRepairFamilies, matchedRepairChild, repairFamilyWork } from '../features/repairs/family.js'

import { navigate } from '../router.js'
import { dlog, dstack, callerInfo } from '../debuglog.js'

/* ── Workshop state ── */
const wsState = {
  familySummaries: new Map(),
  filter:      '',
  statusFilter: 'all',  // 'all' | 'Pending' | 'In Progress' | 'Ready'
}

let SESSION        = {}
let _eventsAttached = false

/* ── Load ── */
async function load() {
  const loadSession = SESSION
  dlog('WORKSHOP.load', 'ENTRY')
  await loadConfig()
  if (window.location.pathname !== '/workshop' || state.role !== SESSION.employee?.role) return
  if (!can('workshop', state.role)) {
    state.modal = null
    document.getElementById('app').textContent = 'Workshop is unavailable for this client. Contact your administrator.'
    return
  }
  const [tickets, repairComponents] = await Promise.all([
    sb.from('tickets')
      .select('*')
      .is('parent_ticket_id', null)
      .not('status', 'in', '("Delivered","Declined","Cancelled")')
      .order('created_at', { ascending: false }),
    sb.from('repair_components').select('*').order('sort_order'),
  ])
  // Child lifecycle may differ from its active root. Fetch those children
  // without loading unrelated closed families or consulting financial RPCs.
  const roots = tickets.data || []
  const children = roots.length ? await sb.from('tickets').select('*')
    .in('parent_ticket_id', roots.map(ticket => ticket.id))
    .order('created_at', {ascending:true}) : {data:[]}
  if (tickets.error || children.error) showBlockingError('Repair work could not be loaded completely. Reload to retry.')
  if (SESSION !== loadSession || state.role !== loadSession.employee?.role || window.location.pathname !== '/workshop' || !can('workshop', state.role)) return
  state.data.tickets = [...roots, ...(children.data || [])]
  state.data.repairComponents = repairComponents.data || []
  wsState.familySummaries = new Map()
  if (['Business Owner','Manager','Cashier','Orbito Support'].includes(SESSION.employee?.role)) {
    const roots = groupRepairFamilies(state.data.tickets)
    await Promise.all(roots.map(async ({root}) => {
      const result = await getRepairFamilySummary(root.id)
      if (result.ok) wsState.familySummaries.set(String(root.id), result.data)
    }))
  }
  applyBranding()
  dlog('WORKSHOP.load', 'DATA READY -- calling render()')
  render()
}

/* ── Render ── */
function render() {
  if (window.location.pathname !== '/workshop' || !can('workshop', state.role) || state.role !== SESSION.employee?.role) return
  dstack('WORKSHOP.render', '*** #app REWRITE ***')
  if (!SESSION.employee) { navigate('/login'); return }

  const tenant = currentTenant()
  const isAdmin = SESSION.isAdmin || state.role === 'Business Owner'
  const _modalScroll = document.querySelector('.modal')?.scrollTop || 0

  document.getElementById('app').innerHTML = `
    <div class="app-shell client-shell">
      <main class="main">
        <header class="topbar">
          <div class="brand top-brand">
            <div class="logo">
              ${tenant.logo
                ? `<img alt="" src="${escapeHTML(safeImageURL(tenant.logo))}">`
                : escapeHTML(tenant.name.slice(0,2).toUpperCase())}
            </div>
            <div>
              <strong>${escapeHTML(tenant.name)}</strong>
              <span class="muted" style="font-size:12px">
                ${escapeHTML(state.role)} · Workshop
              </span>
            </div>
          </div>
          <div class="top-actions">
            <span class="chip">
              <strong style="font-size:12px">${escapeHTML(SESSION.employee.name)}</strong>
            </span>
            <span class="chip">
              <i class="dot ${state.online ? '' : 'offline'}"></i>
              ${state.online ? 'Online' : 'Offline'}
            </span>
            ${isAdmin ? `
              <button class="secondary-button" data-action="go-pos">POS</button>
              <button class="secondary-button" data-action="go-admin">Admin</button>
            ` : ''}
            <button class="icon-button" data-action="my-account" title="My Account">👤</button>
            <button class="icon-button" data-action="theme">
              ${state.theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            ${CFG.ems_enabled && !isAdmin ? `
              <button class="secondary-button" style="font-size:12px"
                data-action="ems-clock-out">🕐 Clock Out</button>
            ` : ''}
            <button class="icon-button" data-action="logout"
              style="color:var(--danger)">Logout</button>
          </div>
        </header>
        <section class="content">${workshopView()}</section>
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
}

/* ── Workshop View ── */
function workshopView() {
  const all    = state.data.tickets || []
  const roots = groupRepairFamilies(all).map(family => family.root)
  const filtered = findRepairFamilies(all, wsState.filter)
    .filter(family => wsState.statusFilter === 'all' || family.root.status === wsState.statusFilter)
    .map(family => ({ ...family.root, _matchedChild:matchedRepairChild(family), _work:repairFamilyWork(family) }))

  const counts = {
    Pending:     roots.filter(t => t.status === 'Pending').length,
    'In Progress': roots.filter(t => t.status === 'In Progress').length,
    Ready:       roots.filter(t => t.status === 'Ready').length,
  }

  const statusColors = {
    'Pending':     'warn',
    'In Progress': 'warn',
    'Ready':       'good',
    'Delivered':   'good',
    'Declined':    'bad',
  }

  return `
    <div style="display:grid;gap:16px;padding:16px">

      <!-- Header -->
      <div style="display:flex;justify-content:space-between;
                  align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <h1 style="margin:0;font-size:20px">Workshop — Repair Queue</h1>
          <p class="muted" style="font-size:13px;margin:4px 0 0">
            ${filtered.length} ticket${filtered.length !== 1 ? 's' : ''}
            · ${new Date().toLocaleDateString()}
          </p>
        </div>
        <!-- Status count badges -->
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${Object.entries(counts).map(([s, n]) => `
            <button class="${wsState.statusFilter === s
              ? 'primary-button' : 'secondary-button'}"
              style="font-size:12px;padding:5px 12px"
              data-status-filter="${s}">
              ${s}: ${n}
            </button>`).join('')}
          <button class="${wsState.statusFilter === 'all'
            ? 'primary-button' : 'secondary-button'}"
            style="font-size:12px;padding:5px 12px"
            data-status-filter="all">
            All: ${roots.length}
          </button>
        </div>
      </div>

      <!-- Search -->
      <input class="search" placeholder="Search name, phone, device, IMEI, ticket #…"
        data-ws-filter value="${escapeHTML(wsState.filter)}"
        style="font-size:14px;padding:10px 14px">

      <!-- Ticket Cards -->
      ${filtered.length ? filtered.map(t => `
        <div class="card" style="display:grid;gap:12px">

          <!-- Top row: customer + status -->
          <div style="display:flex;justify-content:space-between;
                      align-items:start;gap:12px">
            <div style="display:grid;gap:3px">
              <strong style="font-size:16px">${escapeHTML(t.customer_name)}</strong>
              <span class="muted" style="font-size:12px">
                ${escapeHTML(t.invoice_number || t.ticket_number)}
                ${t.customer_phone ? '· ' + escapeHTML(t.customer_phone) : ''}
                ${t._matchedChild ? `<br><span style="color:var(--primary)">Matched: ${escapeHTML(t._matchedChild.invoice_number || t._matchedChild.ticket_number)}</span>` : ''}
              </span>
            </div>
            <span class="badge ${statusColors[t.status] || 'warn'}"
              style="flex-shrink:0;font-size:12px">${escapeHTML(t.status)}</span>
          </div>

          <!-- Device info -->
          <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px">
            <span>📱 <strong>${escapeHTML(t.device_brand)} ${escapeHTML(t.device_model)}</strong></span>
            ${t.imei ? `<span class="muted">IMEI: ${escapeHTML(t.imei)}</span>` : ''}
          </div>

          <!-- Components -->
          ${t._work.some(work => work.components.length || work.hasLabour || work.note) ? t._work.map(work => `
            <div style="display:grid;gap:6px">
              ${t._work.length > 1 ? `<small class="muted">${work.additional ? 'Additional Work' : 'Original Repair'} · ${escapeHTML(work.invoice || '')}</small>` : ''}
              ${work.components.map(c => `
                <div style="display:flex;justify-content:space-between;
                            align-items:center;padding:7px 10px;
                            background:var(--surface-2);border-radius:8px;font-size:13px">
                  <span>
                    <strong>${escapeHTML(c.name)}</strong>
                    <span class="badge warn" style="font-size:11px;margin-left:6px">
                      ${escapeHTML(c.tag || c.condition || '')}${c.removed ? ' · Not needed' : ''}
                    </span>
                    ${c.customText ? `<span class="muted" style="font-size:12px"> — ${escapeHTML(c.customText)}</span>` : ''}
                  </span>
                  <span style="color:var(--muted)">
                    ${Number(c.price||0) > 0 ? moneyHTML(c.price) : 'Not priced'}
                  </span>
                </div>`).join('')}
              ${work.hasLabour ? '<small class="muted">Labour included</small>' : ''}
              ${work.additional && work.note ? `<small class="muted">${escapeHTML(work.note)}</small>` : ''}
            </div>`).join('') : `
            <p class="muted" style="font-size:13px">No components logged yet.</p>`}

          <!-- Labour + Quote -->
          <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:13px">
            ${SESSION.employee?.role === 'Technician' ? '<span class="muted">Financial summary unavailable for this role.</span>' :
              wsState.familySummaries.has(String(t.id)) ? `
                <span>${wsState.familySummaries.get(String(t.id)).invoices?.length > 1 ? 'Family total billed' : 'Total billed'}: <strong>${moneyHTML(wsState.familySummaries.get(String(t.id)).effectiveObligation)}</strong></span>
                <span>Paid: <strong>${moneyHTML(wsState.familySummaries.get(String(t.id)).netPayments)}</strong></span>
                <span>Outstanding: <strong>${moneyHTML(wsState.familySummaries.get(String(t.id)).outstanding)}</strong></span>` :
                '<span class="muted">Financial summary unavailable. Reload to retry.</span>'}
          </div>

          <!-- Technician note -->
          ${t.technician_note ? `
            <div style="background:color-mix(in srgb,var(--warning) 10%,var(--surface));
                        border-left:3px solid var(--warning);
                        padding:8px 12px;border-radius:0 8px 8px 0;font-size:13px">
              <strong>Note:</strong> ${escapeHTML(t.technician_note)}
            </div>` : ''}

          <!-- Action buttons -->
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${['Pending','In Progress','Ready'].map(s => s !== t.status ? `
              <button class="secondary-button" style="font-size:12px;padding:6px 12px"
                data-ws-status="${t.id}" data-ws-new-status="${s}">
                → ${s}
              </button>` : '').join('')}
            <button class="primary-button" style="font-size:12px;padding:6px 12px"
              data-action="edit-components" data-ticket-id="${t.id}">
              ✏️ Edit Components
            </button>
            ${(SESSION.isAdmin || state.role === 'Business Owner') ? `
              <button class="secondary-button" style="font-size:12px;padding:6px 12px"
                data-action="ws-collect" data-ticket-id="${t.id}">
                💳 Collect → POS
              </button>` : ''}
          </div>
        </div>`).join('') : `
        <div class="card" style="text-align:center;padding:48px;color:var(--muted)">
          <div style="font-size:48px;margin-bottom:12px">✅</div>
          <strong>All clear</strong>
          <p style="font-size:13px;margin:6px 0 0">
            ${wsState.filter || wsState.statusFilter !== 'all'
              ? 'No tickets match your search.'
              : 'No active repair tickets right now.'}
          </p>
        </div>`}
    </div>`
}

/* ═══════════════════════════════════════════════════════════════════
   MODALS
═══════════════════════════════════════════════════════════════════ */
function renderModal() {
  if (!state.modal) return ''
  if (!modalEntitled(state.modal.type)) { state.modal = null; return '' }
  const { type, id } = state.modal

  if (type === 'leave-request') return leaveRequestHTML()

  if (type === 'myAccount') return myAccountModalHTML(SESSION)

  if (type === 'pinPrompt') {
    return `<div class="modal-backdrop">${pinPromptHTML(state.modal.purpose)}</div>`
  }

  if (type === 'edit-components') {
    const tk = (state.data.tickets||[]).find(t => String(t.id) === String(id))
    if (!tk) return ''
    const comps      = tk.components_noted || []
    const partsTotal = comps.filter(c=>!c.removed).reduce((s,c) => s + Number(c.price||0), 0)
    const grandTotal = partsTotal + Number(tk.labour_cost||0)
    const subs       = state.modal.subInvoices || []
    const subsTotal  = subs.reduce((s,x) => s + Number(x.balance_due||0), 0)

    return `
      <div class="modal-backdrop" data-no-backdrop-close>
        <div class="modal modal-md" style="max-height:90vh;overflow-y:auto">
          <h2 style="margin-bottom:4px">${escapeHTML(tk.customer_name)}</h2>
          <p class="muted" style="font-size:13px;margin-bottom:16px">
            ${escapeHTML(tk.invoice_number || tk.ticket_number)}
            ${tk.invoice_number ? `<br><span style="font-size:11px">Ticket: ${escapeHTML(tk.ticket_number)}</span>` : ''}
            · ${escapeHTML(tk.device_brand)} ${escapeHTML(tk.device_model)}
          </p>

          <div style="display:grid;gap:8px;margin-bottom:14px">
            <strong style="font-size:13px">Original Issues (locked)</strong>
            ${comps.length ? comps.map((c,i) => `
              <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;
                          ${c.removed?'opacity:.55':''}">
                <div>
                  <span style="font-size:13px;${c.removed?'text-decoration:line-through':''}"><strong>${escapeHTML(c.name)}</strong></span>
                  <span class="badge warn" style="font-size:11px;margin-left:6px">${escapeHTML(c.tag || '')}</span>
                  ${c.customText ? `<span class="muted" style="font-size:12px"> — ${escapeHTML(c.customText)}</span>` : ''}
                  ${c.removed ? `<br><span class="muted" style="font-size:11px">Not needed: ${escapeHTML(c.removedReason||'')}</span>` : ''}
                </div>
                <span style="font-size:13px;min-width:70px;text-align:right">${Number(c.price)>0?moneyHTML(c.price):'—'}</span>
                ${!c.removed ? `<button type="button" class="secondary-button" style="font-size:11px;padding:4px 8px"
                  data-mark-not-needed="${i}">Not Needed</button>` : `<span></span>`}
              </div>`).join('') :
              `<p class="muted" style="font-size:13px">No components noted.</p>`}
          </div>

          <div style="display:flex;justify-content:space-between;padding:10px;background:var(--surface-2);
                      border-radius:8px;margin-bottom:8px;font-size:13px">
            <span>Labour Fee (locked)</span><span>${moneyHTML(tk.labour_cost||0)}</span>
          </div>
          ${tk.technician_note ? `<p class="muted" style="font-size:12px;margin-bottom:12px">Note: ${escapeHTML(tk.technician_note)}</p>` : ''}

          <div style="display:flex;justify-content:space-between;font-weight:600;padding:10px;
                      background:var(--surface-2);border-radius:8px;margin-bottom:16px;font-size:15px">
            <span>Original Total</span><span>${moneyHTML(grandTotal)}</span>
          </div>

          ${subs.length ? `
            <div style="margin-bottom:14px">
              <strong style="font-size:13px">Sub-Invoices</strong>
              <div style="display:grid;gap:6px;margin-top:6px">
                ${subs.map(s => `
                  <div style="display:flex;justify-content:space-between;font-size:12px;
                              padding:8px 10px;background:var(--surface-2);border-radius:6px">
                    <span>${escapeHTML(s.invoice_number)}</span>
                    <span>${moneyHTML(s.estimated_quote)} · Bal: ${moneyHTML(s.balance_due)}</span>
                  </div>`).join('')}
              </div>
              <p class="muted" style="font-size:12px;margin-top:6px">Combined outstanding balance: ${moneyHTML(subsTotal)}</p>
            </div>` : ''}

          <div class="modal-actions">
            <button class="secondary-button" data-close>Close</button>
            <button class="primary-button" data-action="open-create-sub-invoice" data-ticket-id="${tk.id}">
              + Additional Work
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
        <h2>Mark "${escapeHTML(c.name)}" Not Needed</h2>
        <p class="muted" style="font-size:13px">E.g. "Only needed cleaning, no repair required." This stays visible on the ticket, it's not deleted.</p>
        <label class="field"><span>Reason</span><textarea id="not-needed-reason" style="min-height:56px"></textarea></label>
        <div class="modal-actions">
          <button type="button" class="secondary-button" data-close>Cancel</button>
          <button type="button" class="primary-button" data-action="confirm-not-needed">Confirm (PIN required)</button>
        </div>
      </div>
    </div>`
  }

  if (type === 'create-sub-invoice') return createSubInvoiceModalHTML(state.modal, {technician:SESSION.employee?.role === 'Technician', workshop:true})

  if (type === 'add-comp-tag') {
    const { compName } = state.modal
    return `
      <div class="modal-backdrop" data-no-backdrop-close>
        <div class="modal modal-xs">
          <h2>${escapeHTML(compName)}</h2>
          <p class="muted" style="font-size:13px">What's the issue?</p>
          <div style="display:grid;gap:8px;margin-top:10px">
            <button type="button" class="secondary-button"
              style="font-size:15px;min-height:48px" data-tag-select="Broken">
              Broken
            </button>
            <button type="button" class="secondary-button"
              style="font-size:15px;min-height:48px" data-tag-select="Not Working">
              Not Working
            </button>
            <button type="button" class="secondary-button"
              style="font-size:15px;min-height:48px" data-tag-select="Custom">
              Custom…
            </button>
            <div id="custom-tag-wrap" class="hidden" style="display:grid;gap:8px">
              <input id="custom-tag-text" class="search"
                placeholder="Describe the issue">
              <button type="button" class="primary-button"
                data-action="confirm-custom-tag">
                Add
              </button>
            </div>
          </div>
          <div class="modal-actions">
            <button class="secondary-button" data-close>Cancel</button>
          </div>
        </div>
      </div>`
  }

  return ''
}

/* ═══════════════════════════════════════════════════════════════════
   EVENTS — called exactly once
═══════════════════════════════════════════════════════════════════ */
function attachEvents() {
  const app = document.getElementById('app')
  dlog('WORKSHOP.attachEvents', 'listeners attached to #app (click + submit + input)')

  /* ── Helpers to read the sub-invoice draft from the DOM ── */
  function readDraftCompsFromDOM() {
    const comps = [...(state.modal?.draftComponents || [])]
    document.querySelectorAll('[data-draft-comp-price]').forEach((inp, i) => {
      if (comps[i]) comps[i].price = Number(inp.value) || 0
    })
    return comps
  }

  function readDraftLabourFromDOM() {
    return Number(document.querySelector('[data-draft-labour]')?.value || 0)
  }

  function updateDraftTotal() {
    const prices = [...document.querySelectorAll('[data-draft-comp-price]')]
      .reduce((s, inp) => s + (Number(inp.value) || 0), 0)
    const labour = readDraftLabourFromDOM()
    const el = document.getElementById('draft-total')
    if (el) el.textContent = money(prices + labour)
  }

  /* ── Click ── */
  app.addEventListener('click', async e => {
    if (!can('workshop', state.role) || !modalEntitled(state.modal?.type)) return
    // Route guard: see the matching comment in admin.js's attachEvents()
    // for the full explanation -- this is the listener whose collision
    // with admin.js's own sub-invoice actions (same data-action strings,
    // both permanently bound to #app) caused the "modal closes on any
    // click" bug. Only act when /workshop is truly the current route.
    if (!window.location.pathname.startsWith('/workshop')) return

    const el = e.target.closest(
      'button,[data-close],[data-action],[data-ws-status],' +
      '[data-status-filter],[data-add-draft-comp-name],[data-tag-select],' +
      '[data-draft-comp-remove],[data-mark-not-needed],[data-pp-key]'
    )
    if (!el) return
    dlog('WORKSHOP.click', `el MATCHED selector -- action=${el.dataset.action} close=${el.dataset.close} tag=${el.tagName}`)

    /* PIN numpad */
    if (el.dataset.ppKey !== undefined) {
      handlePpKey(el.dataset.ppKey); return
    }

    /* Close */
    if (el.dataset.close !== undefined) {
      dlog('WORKSHOP.click', `DATA-CLOSE branch firing -- state.modal was type=${state.modal?.type} -- about to call WORKSHOP.render()`)
      if (state.modal?.type === 'pinPrompt') { cancelPinPrompt(render); return }
      state.modal = null; render(); return
    }

    /* Status filter tabs */
    if (el.dataset.statusFilter !== undefined) {
      wsState.statusFilter = el.dataset.statusFilter
      render(); return
    }

    /* Top-bar navigation */
    if (el.dataset.action === 'go-pos') {
      navigate('/pos'); return
    }
    if (el.dataset.action === 'go-admin') {
      const { initAdmin } = await import('../admin/admin.js')
      initAdmin(SESSION, 'dashboard', {}); return
    }
    if (el.dataset.action === 'install' && state.installPrompt) {
      await runInstallPrompt(); render(); return
    }
    if (el.dataset.action === 'my-account') {
      state.modal = { type: 'myAccount' }; render(); return
    }
    if (el.dataset.action === 'theme') {
      state.theme = state.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('retailos-theme', state.theme)
      applyBranding(); render(); return
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

    if (el.dataset.action === 'open-leave-request') {
      state.modal = { type: 'leave-request' }; render(); return
    }

    /* Change ticket status */
    if (el.dataset.wsStatus) {
      const ticketId = el.dataset.wsStatus
      const newStatus = el.dataset.wsNewStatus
      const { error } = await sb.from('tickets')
        .update({ status: newStatus })
        .eq('id', ticketId)
      if (error) { showBlockingError('Error: ' + error.message); return }
      const tk = state.data.tickets.find(t => String(t.id) === String(ticketId))
      if (tk) tk.status = newStatus
      render(); return
    }

    /* Open component editor (read-only view of the locked ticket) */
    if (el.dataset.action === 'edit-components') {
      const ticketId = el.dataset.ticketId
      state.modal = { type: 'edit-components', id: ticketId, subInvoices: [] }
      render()
      const subs = await getSubInvoices(ticketId)
      if (state.modal?.type === 'edit-components' && String(state.modal.id) === String(ticketId)) {
        state.modal.subInvoices = subs
        render()
      }
      return
    }

    /* Collect → POS (admin/owner only) */
    if (el.dataset.action === 'ws-collect') {
      const ticketId = el.dataset.ticketId
      sessionStorage.setItem('retailos_collect_ticket', String(ticketId))
      navigate('/pos'); return
    }

    /* Mark a component "not needed" — requires PIN, never deletes */
    if (el.dataset.markNotNeeded !== undefined) {
      const ticketId = state.modal?.id
      state.modal = { type: 'mark-not-needed', ticketId, index: Number(el.dataset.markNotNeeded) }
      render(); return
    }
    if (el.dataset.action === 'confirm-not-needed') {
      const reason = document.getElementById('not-needed-reason')?.value?.trim()
      if (!reason) { showBlockingError('Enter a reason.'); return }
      const { ticketId, index } = state.modal
      openPinPrompt('remove-component', async (verified) => {
        if (!verified) return
        const tk = state.data.tickets.find(t => String(t.id) === String(ticketId))
        if (!tk) return
        const res = await markComponentNotNeeded(Number(ticketId), index, reason)
        if (!res.ok) { showBlockingError('Error: ' + res.error); return }
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
    if (el.dataset.draftCompRemove !== undefined) {
      const parentId = state.modal?.parentId
      const comps = readDraftCompsFromDOM()
      comps.splice(Number(el.dataset.draftCompRemove), 1)
      state.modal = { type: 'create-sub-invoice', additionalFields:state.modal?.additionalFields, parentId, draftComponents: comps, draftLabour: readDraftLabourFromDOM() }
      render(); return
    }

    /* Add predefined component to the draft — opens tag picker */
    if (el.dataset.addDraftCompName) {
      state.modal = {
        type:     'add-comp-tag',
        additionalFields:state.modal?.additionalFields,
        compName: el.dataset.addDraftCompName,
        _parentId: state.modal?.parentId,
        _draftComponents: readDraftCompsFromDOM(),
        _draftLabour: readDraftLabourFromDOM(),
      }
      render(); return
    }

    /* Add custom component to the draft — opens tag picker */
    if (el.dataset.action === 'add-custom-draft-comp') {
      const name = document.getElementById('custom-comp-name')?.value?.trim()
      if (!name) { showBlockingError('Enter a component name.'); return }
      state.modal = {
        type:     'add-comp-tag',
        additionalFields:state.modal?.additionalFields,
        compName: name,
        _parentId: state.modal?.parentId,
        _draftComponents: readDraftCompsFromDOM(),
        _draftLabour: readDraftLabourFromDOM(),
      }
      render(); return
    }

    /* Tag selection — Broken / Not Working / Custom */
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

    /* Confirm custom tag text */
    if (el.dataset.action === 'confirm-custom-tag') {
      const text = document.getElementById('custom-tag-text')?.value?.trim()
      if (!text) { showBlockingError('Describe the issue.'); return }
      _addComponentToDraft(state.modal.compName, 'Custom', text)
      return
    }

    /* Record the customer decision; only approved work creates an invoice. */
    if (el.dataset.action === 'submit-sub-invoice') {
      const parentId = el.dataset.parentId
      const tk = state.data.tickets.find(t => String(t.id) === String(parentId))
      if (!tk || state.modal?.type !== 'create-sub-invoice') return
      const modal = state.modal
      const comps = readDraftCompsFromDOM()
      const labour = readDraftLabourFromDOM()
      if (!comps.length && !labour) { showBlockingError('Add at least one component or a labour charge.'); return }
      const res = await submitAdditionalWorkDraft(parentId, comps, labour, modal, SESSION.employee?.role === 'Technician')
      if (res.busy) return
      if (!res.ok) { showBlockingError(res.error); return }
      if (res.ticket) {
        const {buildSubInvoiceSlip,printThermal} = await import('../print/print.js')
        printThermal(buildSubInvoiceSlip(res.ticket,tk))
      }
      if (state.modal === modal) state.modal = null
      await load()
      if (!res.ticket) showTransactionSuccess(`Additional work saved as ${(res.proposal?.decision || 'Pending').toLowerCase()}.`)
      return
    }
  })

  /* ── Submit ── */
  app.addEventListener('submit', async e => {
    if (!can('workshop', state.role) || !modalEntitled(state.modal?.type)) { e.preventDefault(); return }
    if (!window.location.pathname.startsWith('/workshop')) return
    e.preventDefault()
    const form = e.target
    const data = Object.fromEntries(new FormData(form).entries())
    dlog('WORKSHOP.submit', `ENTRY form.dataset.form=${form.dataset.form}`)
    if (form.dataset.form === 'leave-request') {
      const result = await submitLeaveRequest(SESSION, data)
      if (!result.ok) { showBlockingError('Error: ' + result.error); return }
      state.modal = null
      showToast('Leave request submitted. Your manager will review it.', 'success')
      render(); return
    }
    if (form.dataset.form === 'change-password') {
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
  })
  
  /* ── Input — live total update ── */
  app.addEventListener('input', e => {
    const t = e.target
    rememberAdditionalWorkInput(t, state.modal)
    if (t.dataset.wsFilter !== undefined) {
      wsState.filter = t.value; render(); return
    }
    if (t.dataset.draftCompPrice !== undefined || t.dataset.draftLabour !== undefined) {
      updateDraftTotal()
    }
  })

  /* ── Keyboard ── */
  document.addEventListener('keydown', e => {
    if (window.location.pathname !== '/workshop' || !can('workshop', state.role)) return
    if (e.key === 'Enter') {
      const map = {
        'custom-comp-name': 'add-custom-draft-comp',
        'custom-tag-text':  'confirm-custom-tag',
      }
      const action = map[e.target.id]
      if (action) { e.preventDefault(); document.querySelector(`[data-action="${action}"]`)?.click(); return }
    }
  })
}

/* ── Helper: add a tagged component to the sub-invoice draft, then re-open the form ── */
function _addComponentToDraft(name, tag, customText) {
  const parentId = state.modal._parentId
  const draftComponents = [
    ...(state.modal._draftComponents || []),
    { name, tag, customText, price: 0 },
  ]
  state.modal = { type: 'create-sub-invoice', additionalFields:state.modal?.additionalFields, parentId, draftComponents, draftLabour: state.modal._draftLabour || 0 }
  render()
}

/* ═══════════════════════════════════════════════════════════════════
   PUBLIC ENTRY POINT
═══════════════════════════════════════════════════════════════════ */
export async function initWorkshop(sess) {
  dlog('WORKSHOP.initWorkshop', `ENTRY isAdmin=${sess.isAdmin} caller=[${callerInfo()}]`)
  SESSION          = sess
  state.role       = sess.employee?.role || null
  wsState.filter   = ''
  wsState.statusFilter = 'all'
  await load()
}
