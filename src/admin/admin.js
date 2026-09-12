import {
  sb, state, CFG, loadConfig, applyBranding, currentTenant,
  _clearSession,
  can, ACCESS, validatePassword,
  money, fld, modalActions, statusBadge,
  openPinPrompt, pinPromptHTML, handlePpKey, cancelPinPrompt, normalizeModalControls,
  logBillEvent,
  myAccountModalHTML, handleChangePasswordSubmit,
  generateTempPassword, listPendingResetRequests, resolvePasswordReset,
  invokeAccountAdmin,
  showToast, confirmAction, requestInput, runInstallPrompt,
} from '../shared.js'
import {
  markComponentNotNeeded, getRepairFamilySummary,
  recordAdditionalWork, decideAdditionalWork, createRepairAdjustment, cancelRepair,
} from '../features/repairs/api.js'
import { findRepairFamilies, groupRepairFamilies, matchedRepairChild } from '../features/repairs/family.js'
import { dlog, dstack, callerInfo } from '../debuglog.js'
import { reportsPage } from './pages/reports.js'
import { catalogPage, qiVariantRowHTML, addQuickItemModalHTML } from '../features/admin/catalog/render.js'
import { receiptsPage, udharListModalHTML, receiptDetailModalHTML } from '../features/admin/checkout/render.js'
import { settleUdhar } from '../features/checkout/udhar/api.js'
import {
  ticketCreatedModalHTML, ticketDetailModalHTML, markNotNeededModalHTML,
  createSubInvoiceModalHTML, addCompTagModalHTML,
  repairAdjustmentModalHTML, repairCancellationModalHTML,
} from '../features/admin/repairs/render.js'


const ADMIN_MODULES = [
  ['dashboard', '▦', 'Dashboard'],
  ['repairs',   '◈', 'Repair Tickets'],
  ['inventory', '▤', 'Inventory'],
  ['catalog',   '▥', 'Catalog'],
  ['reports',   '▧', 'Reports'],
  ['employees', '♙', 'Employees'],
  ['receipts',  '◉', 'Receipts'],
  ['ems',       '⏱', 'EMS'],
  ['settings',  '◐', 'Settings'],
]

const adminState = {
  adminModule:      'dashboard',
  settingsTab:      'branding',
  catalogTab:       'quickitems',
  receiptsExpanded: null,
  filter:           '',
  receiptDateFrom:  '',
  receiptDateTo:    '',
  receiptSearch:    '',
  receiptType:      'all',
  receiptModalIdx:  null,
}

let SESSION = {}
let _inv = null  // populated via dynamic import only when inventory_module_enabled

/* ── Load ── */
async function load() {
  dlog('ADMIN.load', `ENTRY adminModule=${adminState.adminModule}`)
  await loadConfig()
  if (CFG.inventory_module_enabled && !_inv) {
    _inv = await import('../features/admin/inventory/index.js')
  }
  const mod = adminState.adminModule
  const needs = {
    tickets: ['dashboard','repairs','reports','receipts'].includes(mod),
    sales: ['dashboard','reports','receipts'].includes(mod),
    employees: ['dashboard','employees'].includes(mod),
    udhar: ['dashboard','reports','receipts'].includes(mod),
    financial: ['dashboard','reports'].includes(mod),
    returns: ['reports','receipts'].includes(mod),
    inventory: mod === 'inventory' && CFG.inventory_module_enabled,
    quickItems: mod === 'catalog',
    repairComponents: mod === 'catalog' || mod === 'repairs',
  }
  const skip = { data: [] }
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1)
  const [tickets, sales, employees, udharAccounts, financial, financialToday, returns_, inv, quickItems, repairComponents] = await Promise.all([
    needs.tickets ? sb.from('tickets').select('*').order('id', { ascending: false }) : skip,
    needs.sales ? sb.from('sales').select('*').order('id', { ascending: false }) : skip,
    needs.employees ? sb.from('employees').select('id, name, role, status, email').order('name') : skip,
    needs.udhar ? sb.rpc('get_unified_udhar_accounts') : skip,
    needs.financial ? sb.rpc('get_financial_report', {
      p_from: null, p_to: null, p_actor_only: false,
    }) : { data: {} },
    needs.financial ? sb.rpc('get_financial_report', {
      p_from: todayStart.toISOString(), p_to: todayEnd.toISOString(), p_actor_only: false,
    }) : { data: {} },
    needs.returns ? sb.from('returns').select('*').order('id', { ascending: false }) : skip,
    needs.inventory ? sb.from('inventory').select('*').order('name') : skip,
    needs.quickItems ? sb.from('quick_items').select('*').order('sort_order') : skip,
    needs.repairComponents ? sb.from('repair_components').select('*').order('sort_order') : skip,
  ])
  state.data = {
    tickets:          tickets.data          || [],
    sales:            sales.data            || [],
    employees:        employees.data        || [],
    udharAccounts:    udharAccounts.data    || [],
    financial:        financial.data        || {},
    financialToday:   financialToday.data   || {},
    returns:          returns_.data         || [],
    inventory:        inv.data              || [],
    quickItems:       quickItems.data       || [],
    repairComponents: repairComponents.data || [],
  }
  applyBranding()
  dlog('ADMIN.load', `DATA READY (queries resolved) adminModule=${adminState.adminModule}`)

  if (adminState.adminModule === 'ems') {
    const { loadEMSData, emsView, attachEMSEvents } = await import('../features/admin/ems/index.js')
    const emsData = await loadEMSData()
    adminState._emsData = emsData
    adminState._emsHTML = emsView(emsData, SESSION)
    render()
    const app = document.getElementById('app')
    attachEMSEvents(app, () => adminState._emsData, async () => {
      const fresh = await loadEMSData()
      adminState._emsData = fresh
      adminState._emsHTML = emsView(fresh, SESSION)
      render()
    }, SESSION)
    return
  }

  render()
}

/* ── Render ── */
let _eventsAttached = false

function render() {
  dstack('ADMIN.render', `*** #app REWRITE *** adminModule=${adminState.adminModule}`)
  const tenant = currentTenant()
  if (!can(adminState.adminModule, state.role)) adminState.adminModule = 'dashboard'
  const _modalScroll = document.querySelector('.modal')?.scrollTop || 0

  document.getElementById('app').innerHTML = `
    <div class="app-shell client-shell">
      <main class="main">
        <header class="topbar">
          <div class="brand top-brand">
            <div class="logo">${tenant.logo ? `<img alt="" src="${tenant.logo}">` : tenant.name.slice(0,2).toUpperCase()}</div>
            <div>
              <strong>${tenant.name}</strong>
              <span class="muted" style="font-size:12px">${state.role} · Back Office</span>
            </div>
          </div>
          <div class="top-actions">
            <select class="tenant-switcher compact-select" data-action="admin-module">
              ${ADMIN_MODULES.filter(([k]) => can(k, state.role))
                .map(([k,,l]) => `<option value="${k}" ${k === adminState.adminModule ? 'selected' : ''}>${l}</option>`)
                .join('')}
            </select>
            <span class="chip">
              <strong style="font-size:12px">${SESSION.employee.name}</strong>
              <span class="muted" style="font-size:11px"> · ${state.role}</span>
            </span>
            <span class="chip">
              <i class="dot ${state.online ? '' : 'offline'}"></i>
              ${state.online ? 'Online' : 'Offline'}
            </span>
            ${(SESSION.isAdmin || state.role === 'Business Owner') ? `
              <button class="secondary-button" data-action="go-pos">POS</button>
              ${CFG.technician_module_enabled
                ? `<button class="secondary-button" data-action="go-workshop">Workshop</button>`
                : ''}
            ` : ''}
            <button class="icon-button" data-action="my-account" title="My Account">👤</button>
            <button class="icon-button" data-action="theme">
              ${state.theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button class="icon-button" data-action="logout" style="color:var(--danger)">Logout</button>
          </div>
        </header>
        <section class="content">${pageContent()}</section>
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

function pageContent() {
  const pages = { dashboard, repairs, inventory, catalog, reports, employees, receipts, settings }
  if (adminState.adminModule === 'ems') {
    return adminShell(adminState._emsHTML || '<div class="empty">Loading EMS…</div>')
  }
  return adminShell((pages[adminState.adminModule] || dashboard)())
}

function adminShell(content) {
  const tenant   = currentTenant()
  const modLabel = ADMIN_MODULES.find(([k]) => k === adminState.adminModule)?.[2] || ''
  return `
    <div class="admin-header">
      <div><h1>${modLabel}</h1><p class="muted">${tenant.name}</p></div>
    </div>
    ${content}`
}

const tit = (h, sub, action) =>
  `<div class="page-title"><div><h1>${h}</h1><p class="muted">${sub}</p></div><div>${action}</div></div>`
const tlb = (ph) =>
  `<div class="toolbar"><div class="toolbar-left"><input class="search" data-filter value="${adminState.filter}" placeholder="${ph}"></div></div>`

/* ═══════════════ PAGES ═══════════════ */
function dashboard() {
  const sales    = state.data.sales    || []
  const tickets  = state.data.tickets  || []
  const financial = state.data.financial || {}
  const todayFinancial = state.data.financialToday || {}
  const pending  = groupRepairFamilies(tickets).filter(({ root }) => !['Delivered','Declined','Cancelled'].includes(root.status)).length
  const kpis = [
    ["Today's Invoiced", Number(todayFinancial.invoiced || 0),  'reports'],
    ["Today's Collected", Number(todayFinancial.paymentsCollected || 0), 'reports'],
    ['Net Payments', Number(financial.netPayments || 0), 'reports'],
    ['Open Tickets',    pending,   'repairs'],
    ['Udhar Balance',   Number(financial.udharOutstanding || 0),  'udharList'],
    ['Employees',       (state.data.employees||[]).length, 'employees'],
  ]
  return `
    ${tit('Dashboard','Live overview of sales, tickets, and operations.',
      `<button class="primary-button" data-action="go-pos">Go to POS</button>`)}
    <div class="grid kpi-grid">
      ${kpis.map(([l,v,target]) => `
        <div class="card kpi" style="cursor:pointer" data-kpi-target="${target}">
          <span class="label">${l}</span>
          <span class="value">${typeof v === 'number' && !['Open Tickets','Employees'].includes(l)
            ? money(v) : v}</span>
        </div>`).join('')}
    </div>
    <div class="grid two-col">
      <div class="card">
        <h2>Recent Sales</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Invoice</th><th>Customer</th><th>Payment</th><th>Total</th></tr></thead>
          <tbody>
            ${sales.slice(0,8).map(s => `<tr>
              <td>${s.invoice_number||`INV-${s.id}`}</td>
              <td>${s.customer_name||'Walk-in'}</td>
              <td>${s.payment_method}</td>
              <td>${money(s.total_bill)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
      <div class="card">
        <h2>Operational Alerts</h2>
        <div class="list">
          <div class="list-row"><span>Pending Repairs</span><strong>${pending}</strong></div>
          <div class="list-row"><span>Outstanding Udhar</span><strong>${(state.data.udharAccounts||[]).length}</strong></div>
          <div class="list-row"><span>Today's Payment Events</span><strong>${Number(todayFinancial.paymentCount || 0)}</strong></div>
          <div class="list-row"><span>Active Employees</span><strong>${(state.data.employees||[]).filter(e=>e.status==='Active').length}</strong></div>
        </div>
      </div>
    </div>`
}

function repairs() {
  const families = findRepairFamilies(state.data.tickets || [], adminState.filter)
    .sort((a,b) => new Date(b.root.created_at) - new Date(a.root.created_at))
  const roots = groupRepairFamilies(state.data.tickets || []).map(family => family.root)
  const sc = {'Pending':'warn','In Progress':'warn','Ready':'good','Delivered':'good','Cancelled':'bad','Declined':'bad'}
  return `
    ${tit('Repair Tickets','Search the complete repair family from one place.',`<button class="primary-button" data-action="go-pos" title="Create tickets from the POS counter">New Ticket (via POS)</button>`)}
    ${tlb('Search ticket, parent/child invoice, customer, phone, device…')}
    <p class="muted" style="font-size:12px;margin:-8px 0 12px">This search checks parent repairs and every child/sub-invoice, then opens the complete family.</p>
    <div class="grid two-col">
      <div class="card">
        <div class="table-wrap"><table>
          <thead><tr><th>Customer</th><th>Ticket / Invoice</th><th>Device</th><th>Advance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${families.length ? families.map(family => {
              const r = family.root
              const matchedChild = matchedRepairChild(family)
              return `
              <tr style="cursor:pointer" data-view-ticket="${r.id}">
                <td><strong>${r.customer_name}</strong><br><small class="muted">${r.customer_phone}</small></td>
                <td>
                  <span style="color:var(--primary);font-size:12px">${r.ticket_number}</span><br>
                  <strong style="font-size:12px">${r.invoice_number || 'No invoice'}</strong>
                  ${family.members.length > 1 ? `<br><small class="muted">${family.members.length - 1} child invoice${family.members.length === 2 ? '' : 's'}</small>` : ''}
                  ${matchedChild ? `<br><small style="color:var(--primary)">Matched child: ${matchedChild.invoice_number || 'No invoice'} · ${matchedChild.ticket_number}</small>` : ''}
                </td>
                <td>${r.device_brand} ${r.device_model}</td>
                <td>${Number(r.advance_payment||0)>0 ? money(r.advance_payment) : '—'}</td>
                <td><span class="badge ${sc[r.status]||'warn'}">${r.status}</span></td>
                <td>
                <div style="display:flex;gap:6px;align-items:center">
                  <button class="secondary-button" style="font-size:12px;padding:4px 10px"
                    data-action="open-ticket-editor" data-ticket-id="${r.id}">Edit</button>
                  <button class="secondary-button" style="font-size:12px;padding:4px 10px"
                    data-action="admin-collect" data-ticket-id="${r.id}">Collect</button>
                </div>
              </td>
              </tr>`}).join('') :
              `<tr><td colspan="6" style="text-align:center;color:var(--muted)">No tickets found.</td></tr>`}
          </tbody>
        </table></div>
      </div>
      <div class="card">
        <h2>Status Summary</h2>
        <div class="list">
          ${['Pending','In Progress','Ready','Delivered','Cancelled','Declined'].map(s => `
            <div class="list-row"><span>${s}</span>
              <strong>${roots.filter(t=>t.status===s).length}</strong>
            </div>`).join('')}
        </div>
      </div>
    </div>`
}

function inventory() {
  if (!CFG.inventory_module_enabled) return `<div class="card"><p class="muted">Inventory module is disabled. Enable it in Settings.</p></div>`
  if (!_inv) return `<div class="card"><p class="muted">Loading inventory module…</p></div>`
  return _inv.adminInventoryPage({ filter: adminState.filter, tit })
}

function reports() {
  return reportsPage({ tit })
}

function employees() {
  const emps = state.data.employees || []
  return `
    ${tit('Employees','Staff roster, roles, and access control.',
      `<button class="secondary-button" data-action="open-password-resets">🔑 Password Resets</button>
       <button class="primary-button" data-modal="employee">Add Employee</button>`)}
    <div class="card">
      ${emps.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${emps.map(e => `<tr>
              <td><strong>${e.name}</strong></td>
              <td class="muted" style="font-size:12px">${e.email||'—'}</td>
              <td>${e.role}</td>
              <td><span class="badge ${e.status==='Active'?'good':'bad'}">${e.status}</span></td>
              <td style="display:flex;gap:6px">
                ${state.role !== 'Manager' || ['Cashier','Technician'].includes(e.role) ? `<button class="secondary-button" style="font-size:12px"
                  data-action="edit-employee"
                  data-emp-id="${e.id}" data-emp-name="${e.name}"
                  data-emp-role="${e.role}" data-emp-status="${e.status}"
                  data-emp-email="${e.email||''}">Edit</button>` : ''}
                ${state.role !== 'Manager' || ['Cashier','Technician'].includes(e.role) ? `
                  <button class="secondary-button" style="font-size:12px;color:var(--warning)"
                    data-action="remove-employee"
                    data-emp-id="${e.id}" data-emp-name="${e.name}"
                    data-emp-can-delete="false">Deactivate</button>` : ''}
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>` :
        `<div class="empty">No employees yet.</div>`}
    </div>`
}

function receipts() {
  return receiptsPage({ tit, adminState })
}

function settings() {
  if (state.role !== 'Business Owner' && state.role !== 'Orbito Support')
    return `<div class="card"><p class="muted">Settings are available to Business Owner only.</p></div>`
  const t = currentTenant()
  const tabs = { branding:'Branding', contact:'Contact', receipt:'Receipt & Tax', staff:'Staff & Security' }
  return `
    ${tit('Business Settings','Branding, contact, receipt, staff.','')}
    <div class="settings-tabs">
      ${Object.entries(tabs).map(([k,l]) =>
        `<button class="settings-tab ${adminState.settingsTab===k?'active':''}" data-settings-tab="${k}">${l}</button>`
      ).join('')}
    </div>
    ${settingsTabContent()}`
}

function catalog() {
  const isAllowed = state.role === 'Business Owner' || SESSION.isAdmin || state.role === 'Manager'
  return catalogPage({ tit, adminState, isAllowed })
}

function settingsTabContent() {
  const t = currentTenant()

  const platformFlags = `
    <div class="card" style="display:grid;gap:10px;padding:14px 16px;margin-bottom:4px">
      <p style="font-size:12px;font-weight:600;color:var(--muted);
                text-transform:uppercase;letter-spacing:.5px">
        Plan Features — Managed by RetailOS Platform
      </p>
      <div style="display:grid;gap:8px">
        ${[
          ['Repair Module',     CFG.repair_module_enabled],
          ['Inventory Module',  CFG.inventory_module_enabled],
          ['Technician Module', CFG.technician_module_enabled],
          ['Live Tracking',     CFG.live_tracking_enabled],
          ['EMS',               CFG.ems_enabled],
          ['Break Tracking',    CFG.ems_track_breaks],
        ].map(([label, enabled]) => `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:13px">${label}</span>
            <span class="badge ${enabled ? 'good' : 'bad'}">
              ${enabled ? 'Enabled' : 'Not enabled'}
            </span>
          </div>`).join('')}
      </div>
    </div>`

  if (adminState.settingsTab === 'branding') return platformFlags + `
    <form class="card form-grid" data-form="settings">
      ${fld('Business Name','name',t.name)}
      ${fld('Description','businessDescription',CFG.shop_description||'')}
      ${fld('Primary Color','primaryColor',t.primaryColor,'color')}
      ${fld('Secondary Color','secondaryColor',t.secondaryColor,'color')}
      <label class="field"><span>Logo Upload</span><input name="logo" type="file" accept="image/*"></label>
      <div class="modal-actions" style="grid-column:1/-1"><button class="primary-button">Save Branding</button></div>
    </form>`

  if (adminState.settingsTab === 'contact') return `
    <form class="card form-grid" data-form="settings">
      ${fld('Business Name','name',t.name)}
      ${fld('Address','address',t.address)}
      ${fld('Phone','phone',t.phone)}
      ${fld('Email','email',CFG.shop_email||'')}
      <div class="modal-actions" style="grid-column:1/-1"><button class="primary-button">Save Contact Info</button></div>
    </form>`

  if (adminState.settingsTab === 'receipt') return `
    <form class="card form-grid" data-form="settings">
      ${fld('Currency Symbol','currency',t.currency)}
      ${fld('Tax Rate %','taxRate',t.taxRate,'number')}
      ${fld('Invoice Prefix','invoicePrefix',CFG.invoice_prefix||'INV')}
      ${fld('Ticket Prefix','ticketPrefix',CFG.ticket_prefix||'TK')}
      <p class="muted" style="grid-column:1/-1;font-size:12px;margin-top:-6px">
        Full numbers look like <strong>${CFG.invoice_prefix||'INV'}20260712 0001</strong> and
        <strong>${CFG.ticket_prefix||'TK'}20260712 0001</strong> — date stamped automatically,
        sequence number never resets or repeats.
      </p>
      <label class="field" style="grid-column:1/-1"><span>Receipt Footer</span>
        <textarea name="receiptFooter">${t.receiptFooter}</textarea></label>
      <div class="modal-actions" style="grid-column:1/-1"><button class="primary-button">Save Receipt Settings</button></div>
    </form>`

  if (adminState.settingsTab === 'staff') {
    return `
      <div style="display:grid;gap:16px">
        <div class="card" style="display:grid;gap:14px">
          <h2>Owner Login</h2>
          <p class="muted" style="font-size:13px">The owner email stays synchronized with Supabase Auth. Owners change their own password from My Account.</p>
          <form class="form-grid" data-form="owner-login">
            ${fld('Owner Email','owner_email',SESSION.employee?.role === 'Business Owner' ? SESSION.employee.email : '','email')}
            <div class="modal-actions" style="grid-column:1/-1">
              <button class="primary-button">Save Owner Login</button>
            </div>
          </form>
        </div>
        <div class="card" style="display:grid;gap:14px">
          <h2>Override PIN</h2>
          <p class="muted" style="font-size:13px">
            4-digit PIN for discounts, returns, and sensitive actions at POS.
            Not a login PIN — an authorization PIN for protected operations.
          </p>
          <form class="form-grid" data-form="override-pin">
            ${fld('New Override PIN','new_pin','','password')}
            <div class="modal-actions" style="grid-column:1/-1">
              <button class="primary-button">Save PIN</button>
            </div>
          </form>
        </div>
        <div class="card" style="padding:14px">
          <p class="muted" style="font-size:13px">
            To manage employees, go to the
            <button type="button" class="secondary-button"
              style="font-size:12px;padding:3px 10px;margin:0 4px"
              data-action="go-employees-tab">Employees tab</button>
          </p>
        </div>
      </div>`
  }

  return ''
}

/* ═══════════════ MODALS ═══════════════ */
function renderModal() {
  if (!state.modal) return ''
  const { type, id } = state.modal

  if (type === 'pinPrompt') return `<div class="modal-backdrop">${pinPromptHTML(state.modal.purpose)}</div>`

  if (type === 'myAccount') return myAccountModalHTML(SESSION)

  if (type === 'addQuickItem') return addQuickItemModalHTML()

  if (type === 'passwordResets') {
    const reqs = state.modal.requests || []
    return `<div class="modal-backdrop"><div class="modal modal-sm">
      <h2>Pending Password Resets</h2>
      ${!reqs.length ? `<p class="muted">No pending requests.</p>` : `
        <div style="display:grid;gap:10px;max-height:50vh;overflow-y:auto">
          ${reqs.map(r => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 14px;background:var(--surface-2);border-radius:8px">
              <div>
                <strong>${r.email}</strong><br>
                <span class="muted" style="font-size:12px">Requested ${new Date(r.requested_at).toLocaleString()}</span>
              </div>
              <button class="secondary-button" data-action="resolve-reset" data-reset-id="${r.id}" data-reset-email="${r.email}">Set New Password</button>
            </div>`).join('')}
        </div>`}
      <div class="modal-actions"><button type="button" class="secondary-button" data-close>Close</button></div>
    </div></div>`
  }


  if (type === 'receipt') return ticketCreatedModalHTML(state.modal)

  if (type === 'employee') {
    if (state.modal.editMode) {
      const e = state.modal
      return `<div class="modal-backdrop"><form class="modal modal-sm" data-form="edit-employee" data-emp-id="${e.id}">
        <h2>Edit Employee</h2>
        <div class="form-grid">
          <label class="field"><span>Name</span><input name="name" value="${e.name||''}" required></label>
          <label class="field"><span>Email</span><input name="email" type="email" value="${e.email||''}"></label>
          <label class="field"><span>New Password (blank = keep)</span><input name="password" type="password" autocomplete="off" placeholder="Leave blank to keep"></label>
          <label class="field"><span>Role</span>
            <select name="role">
              ${(state.role === 'Manager' ? ['Cashier','Technician'] : ['Manager','Cashier','Technician']).map(r =>
                `<option ${r===e.role?'selected':''}>${r}</option>`).join('')}
            </select></label>
          <label class="field"><span>Status</span>
            <select name="status">
              <option ${e.status==='Active'?'selected':''}>Active</option>
              <option ${e.status==='Inactive'?'selected':''}>Inactive</option>
            </select></label>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary-button" data-close>Cancel</button>
          <button class="primary-button">Save Changes</button>
        </div>
      </form></div>`
    }
    return `<div class="modal-backdrop"><form class="modal modal-sm" data-form="employee">
      <h2>Add Employee</h2>
      <div class="form-grid">
        ${fld('Full Name','name')}
        ${fld('Email','email','','email')}
        <label class="field"><span>Password</span>
          <div style="display:flex;gap:6px">
            <input name="password" type="password" style="flex:1">
            <button type="button" class="secondary-button" data-action="gen-employee-password" style="white-space:nowrap">Generate</button>
          </div>
        </label>
        <label class="field"><span>Role</span>
          <select name="role">
            <option>Cashier</option><option>Technician</option>${state.role === 'Manager' ? '' : '<option>Manager</option>'}
          </select></label>
      </div>
      <p class="muted" style="font-size:12px;margin-top:-6px">Share this password with the employee yourself — no invite email is sent.</p>
      ${modalActions()}
    </form></div>`
  }


  if (type === 'ticketDetail') return ticketDetailModalHTML(id, state.modal)

  if (type === 'mark-not-needed') return markNotNeededModalHTML(state.modal)

  if (type === 'create-sub-invoice') return createSubInvoiceModalHTML(state.modal)
  if (type === 'repair-adjustment') return repairAdjustmentModalHTML(state.modal)
  if (type === 'repair-cancellation') return repairCancellationModalHTML(state.modal)

  if (type === 'add-comp-tag') return addCompTagModalHTML(state.modal)

  if (type === 'inv-add' || type === 'inv-edit' || type === 'inv-adjust') {
    return _inv ? _inv.inventoryModalHTML(type, id) : ''
  }


  if (type === 'udharList') return udharListModalHTML()

  if (type === 'receipt-detail') return receiptDetailModalHTML(adminState)

  return ''
}

async function openTicketDetail(ticketId) {
  const requestedId = String(ticketId)
  const requestId = crypto.randomUUID()
  state.modal = {
    type:'ticketDetail',
    id:requestedId,
    summaryStatus:'loading',
    summary:null,
    requestId,
  }
  render()
  const summaryResult = await getRepairFamilySummary(Number(requestedId))
  if (state.modal?.type !== 'ticketDetail' || state.modal.requestId !== requestId) return
  if (!summaryResult.ok) {
    state.modal.summaryStatus = 'error'
    state.modal.summaryError = summaryResult.error
  } else {
    state.modal.summaryStatus = 'ready'
    state.modal.summary = summaryResult.data
    state.modal.id = String(summaryResult.data?.root?.id || requestedId)
  }
  render()
}

/* ═══════════════ EVENTS ═══════════════ */
function attachEvents() {
  const app = document.getElementById('app')

  dlog('ADMIN.attachEvents', 'listeners attached to #app (click + submit)')

  // Click delegation
  app.addEventListener('click', async e => {
    // Route guard: this listener is permanently attached to #app for the
    // rest of the session once /admin has been visited once, even after
    // navigating to /pos or /workshop. Without this check, a click on a
    // button whose data-action string happens to also exist in another
    // view (e.g. workshop.js's own "open-create-sub-invoice") would run
    // BOTH views' handlers and call ADMIN's own render() over whatever
    // the other view had on screen. Only act when /admin is truly current.
    if (!window.location.pathname.startsWith('/admin')) return

    const el = e.target.closest(
      'button,[data-modal],[data-close],[data-action],' +
      '[data-settings-tab],[data-catalog-tab],[data-kpi-target],[data-pp-key],' +
      '[data-remove-quick],[data-remove-qitem],[data-add-qprice],[data-remove-qprice],' +
      '[data-inv-edit],[data-inv-adjust],[data-inv-delete],[data-settle-id],[data-view-ticket],' +
      '[data-mark-not-needed],[data-subinv-comp-remove],[data-add-draft-comp-name],[data-tag-select]'
    )
    if (!el) return
    dlog('ADMIN.click', `el MATCHED selector -- action=${el.dataset.action} close=${el.dataset.close} tag=${el.tagName}`)

    if (el.dataset.ppKey !== undefined) { handlePpKey(el.dataset.ppKey); return }
    if (el.dataset.close !== undefined) {
      dlog('ADMIN.click', `DATA-CLOSE branch firing -- state.modal was type=${state.modal?.type} -- about to call ADMIN.render()`)
      if (state.modal?.type === 'pinPrompt') { cancelPinPrompt(render); return }
      state.modal = null; render(); return
    }
    if (el.dataset.action === 'print-ticket-slip') {
      dlog('ADMIN.click', `PRINT-TICKET-SLIP branch firing -- state.modal.ticket=${JSON.stringify(state.modal?.ticket?.ticket_number)}`)
      if (state.modal?.ticket) {
        const { buildTicketSlip, printThermal } = await import('../print/print.js')
        printThermal(buildTicketSlip(state.modal.ticket))
      }
      return
    }
    if (el.dataset.action === 'print-repair-summary') {
      const summary = state.modal?.summary || (await getRepairFamilySummary(Number(el.dataset.ticketId))).data
      if (!summary) { showToast('Repair summary is unavailable.', 'error'); return }
      const { buildRepairSummary, printThermal } = await import('../print/print.js')
      printThermal(buildRepairSummary(summary)); return
    }

    if (el.dataset.kpiTarget) {
      const target = el.dataset.kpiTarget
      if (target === 'udharList') { state.modal = { type:'udharList' }; render(); return }
      if (ADMIN_MODULES.find(([k]) => k === target)) {
        adminState.filter = ''
        const { navigate } = await import('../router.js')
        navigate(`/admin/${target}`)
        return
      }
      return
    }

    if (el.dataset.settingsTab) {
      const { navigate } = await import('../router.js')
      navigate(`/admin/settings?tab=${el.dataset.settingsTab}`, { replace: true, force: true })
      return
    }
    if (el.dataset.catalogTab) {
      const { navigate } = await import('../router.js')
      navigate(`/admin/catalog?tab=${el.dataset.catalogTab}`, { replace: true, force: true })
      return
    }
    if (el.dataset.modal) { state.modal = { type:el.dataset.modal, id:el.dataset.id }; render(); return }

    if (el.dataset.action === 'go-pos') {
      const { navigate } = await import('../router.js')
      navigate('/pos'); return
    }
    if (el.dataset.action === 'go-workshop') {
      const { navigate } = await import('../router.js')
      navigate('/workshop'); return
    }

    if (el.dataset.action === 'gen-employee-password') {
      const input = document.querySelector('[data-form="employee"] input[name="password"]')
      if (input) { input.type = 'text'; input.value = generateTempPassword() }
      return
    }
    if (el.dataset.action === 'open-add-quick-item') {
      state.modal = { type: 'addQuickItem' }; render(); return
    }
    if (el.dataset.action === 'add-variant-row') {
      document.getElementById('qi-variant-rows')?.insertAdjacentHTML('beforeend', qiVariantRowHTML())
      return
    }
    if (el.dataset.action === 'remove-variant-row') {
      el.closest('[data-variant-row]')?.remove()
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
        await openTicketDetail(ticketId)
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

    /* Record pending/approved/declined additional work. */
    if (el.dataset.action === 'submit-sub-invoice') {
      const parentId = el.dataset.parentId
      const tk = state.data.tickets.find(t => String(t.id) === String(parentId))
      if (!tk) return
      const comps  = readSubInvCompsFromDOM()
      const labour = readSubInvLabourFromDOM()
      const note   = document.getElementById('sub-invoice-note')?.value || ''
      if (!comps.length && !labour) { showToast('Add at least one component or a labour charge.', 'warning'); return }

      const decision = document.getElementById('additional-work-decision')?.value || 'Approved'
      const method = document.getElementById('additional-work-method')?.value || 'In person'
      const description = comps.map(c=>c.name).filter(Boolean).join(', ') || note || 'Additional work'
      const res = await recordAdditionalWork(Number(parentId), description, comps, labour, decision, method, note)
      if (!res.ok) { showToast('Error: ' + res.error, 'error'); return }

      if (res.ticket) {
        const { buildSubInvoiceSlip, printThermal } = await import('../print/print.js')
        printThermal(buildSubInvoiceSlip(res.ticket, tk))
      }

      state.modal = null
      await load(); return
    }

    if (el.dataset.action === 'decide-additional-work') {
      const decision = el.dataset.decision
      const input = await requestInput({
        title: `${decision} additional work?`,
        message: 'Record how the customer decision was received.',
        confirmLabel: `Save ${decision.toLowerCase()}`,
        fields: [
          { name:'method', label:'Decision method', type:'select', value:'Phone', options:['Phone','In person','WhatsApp','Other'] },
          { name:'note', label:'Decision note (optional)', type:'textarea', value:'' },
        ],
      })
      if (!input?.confirmed) return
      const method = input.value.method
      const note = input.value.note || ''
      const result = await decideAdditionalWork(Number(el.dataset.proposalId), decision, method, note)
      if (!result.ok) { showToast('Decision error: ' + result.error, 'error'); return }
      if (result.ticket) {
        const root = state.data.tickets.find(t=>!t.parent_ticket_id && String(t.id)===String(result.proposal.root_ticket_id))
        if (root) {
          const { buildSubInvoiceSlip, printThermal } = await import('../print/print.js')
          printThermal(buildSubInvoiceSlip(result.ticket, root))
        }
      }
      showToast(`Additional work ${decision.toLowerCase()}.`, 'success')
      state.modal = null; await load(); return
    }

    if (el.dataset.action === 'open-repair-adjustment') {
      state.modal = { type:'repair-adjustment', rootId:Number(el.dataset.ticketId) }
      render(); return
    }
    if (el.dataset.action === 'submit-repair-adjustment') {
      const amount = Number(document.getElementById('repair-adjustment-amount')?.value || 0)
      const type = document.getElementById('repair-adjustment-type')?.value || 'discount'
      const reason = document.getElementById('repair-adjustment-reason')?.value?.trim() || ''
      if (amount <= 0 || !reason) { showToast('Enter a positive reduction and a reason.', 'warning'); return }
      openPinPrompt('discount', async verified => {
        if (!verified) return
        const result = await createRepairAdjustment(Number(el.dataset.ticketId), amount, type, reason)
        if (!result.ok) { showToast('Adjustment error: ' + result.error, 'error'); return }
        showToast('Repair invoice adjustment completed.', 'success')
        state.modal = null; await load()
      }, render); return
    }
    if (el.dataset.action === 'open-repair-cancellation') {
      const summaryResult = await getRepairFamilySummary(Number(el.dataset.ticketId))
      if (!summaryResult.ok) { showToast('Summary error: ' + summaryResult.error, 'error'); return }
      state.modal = { type:'repair-cancellation', rootId:Number(el.dataset.ticketId), summary:summaryResult.data }
      render(); return
    }
    if (el.dataset.action === 'submit-repair-cancellation') {
      const refund = Number(document.getElementById('repair-cancel-refund')?.value || 0)
      const method = document.getElementById('repair-cancel-method')?.value || 'Cash'
      const reason = document.getElementById('repair-cancel-reason')?.value?.trim() || ''
      if (refund < 0 || !reason) { showToast('Enter a valid refund and a reason.', 'warning'); return }
      openPinPrompt('repair-refund', async verified => {
        if (!verified) return
        const result = await cancelRepair(Number(el.dataset.ticketId), refund, method, reason)
        if (!result.ok) { showToast('Cancellation error: ' + result.error, 'error'); return }
        showToast(refund > 0 ? 'Repair cancelled and refund completed.' : 'Repair cancelled.', 'success')
        state.modal = null; await load()
      }, render); return
    }

    if (el.dataset.action === 'install' && state.installPrompt) {
      await runInstallPrompt(); render(); return
    }
    if (el.dataset.action === 'my-account') {
      state.modal = { type: 'myAccount' }; render(); return
    }
    if (el.dataset.action === 'open-password-resets') {
      const requests = await listPendingResetRequests()
      state.modal = { type: 'passwordResets', requests }
      render(); return
    }
    if (el.dataset.action === 'resolve-reset') {
      const email = el.dataset.resetEmail
      const newPass = generateTempPassword()
      const res = await resolvePasswordReset(el.dataset.resetId, email, newPass, SESSION.employee?.name || 'Admin')
      if (!res.ok) { showToast('Error: ' + res.error, 'error'); return }
      await confirmAction({
        title: 'Temporary password created',
        message: `New password for ${email}:\n\n${newPass}\n\nShare this directly. It will not be shown again.`,
        confirmLabel: 'Done',
        cancelLabel: 'Close',
      })
      const requests = await listPendingResetRequests()
      state.modal = { type: 'passwordResets', requests }
      render(); return
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

    if (el.dataset.action === 'go-employees-tab') {
      adminState.adminModule = 'employees'
      adminState.settingsTab = 'branding'
      adminState.catalogTab  = 'quickitems'
      const { navigate } = await import('../router.js')
      navigate('/admin/employees'); return
    }

    if (el.dataset.action === 'edit-employee') {
      state.modal = { type:'employee', editMode:true,
        id:el.dataset.empId, name:el.dataset.empName,
        role:el.dataset.empRole, status:el.dataset.empStatus, email:el.dataset.empEmail }
      render(); return
    }

    if (el.dataset.action === 'remove-employee') {
      const name      = el.dataset.empName || 'this employee'
      const empId     = el.dataset.empId
      const confirmation = await confirmAction({
        title: 'Deactivate employee?',
        message: `Make ${name} inactive? Historical records will be preserved.`,
        confirmLabel: 'Continue',
        tone: 'danger',
      })
      if (!confirmation?.confirmed) return

      openPinPrompt('admin', async (verified) => {
        if (!verified) return
        const found = state.data.employees.find(e => String(e.id) === String(empId))
        if (!found) return
        const result = await invokeAccountAdmin('update-employee', {
          employeeId: Number(empId), name: found.name, email: found.email,
          role: found.role, status: 'Inactive',
        })
        if (!result.ok) { showToast('Error deactivating: ' + result.error, 'error'); return }
        await load()
      }, render); return
    }

    if (el.dataset.action === 'open-ticket-editor') {
      const ticketId = el.dataset.ticketId
      await openTicketDetail(ticketId)
      return
    }
    if (el.dataset.action === 'retry-ticket-detail') {
      await openTicketDetail(el.dataset.ticketId)
      return
    }

    if (el.dataset.action === 'admin-collect') {
      const found = state.data.tickets.find(t => String(t.id) === String(el.dataset.ticketId))
      if (!found) return
      sessionStorage.setItem('retailos_collect_ticket', String(found.id))
      const { navigate } = await import('../router.js')
      navigate('/pos'); return
    }

    if (el.dataset.action === 'save-ticket-detail') {
      const newStatus   = document.getElementById('td-status')?.value
      const note        = document.getElementById('td-note')?.value||''
      const upd = { status:newStatus, update_note:note }
      const { error } = await sb.from('tickets').update(upd).eq('id', el.dataset.id)
      if (error) { showToast('Update failed: '+error.message, 'error'); return }
      state.modal = null; await load(); return
    }

    if (el.dataset.action === 'reprint-receipt') {
      const saleId = Number(el.dataset.saleId)
      const sale   = state.data.sales.find(s => s.id === saleId)
      if (!sale) { showToast('Sale not found.', 'error'); return }
      const { buildReceiptSlip, printThermal } = await import('../print/print.js')
      const reprSale = {
        receiptNo: sale.invoice_number||`INV-${sale.id}`, date: sale.created_at,
        cashier: sale.employee_name||'Counter', customer: sale.customer_name||'Walk-in',
        items: (sale.items_sold||[]).map(i => ({
          name:i.name, variantName:i.variant_name||'', qty:i.qty||1, soldPrice:i.sold_price||i.soldPrice||0,
          originalPrice:i.original_price||0, discount:i.discount||0, reason:i.reason||''
        })),
        labour:sale.labour_cost||0, discount:sale.discount||0, tax:sale.tax||0,
        total:sale.total_bill||0, payment:sale.payment_method||'—',
      }
      printThermal(buildReceiptSlip(reprSale, true)); return
    }

    if (el.dataset.action === 'print-repair-invoice') {
      const ticket = state.data.tickets.find(item => String(item.id) === String(el.dataset.ticketId))
      if (!ticket) { showToast('Repair invoice not found.', 'error'); return }
      const { buildTicketSlip, buildSubInvoiceSlip, printThermal } = await import('../print/print.js')
      if (ticket.parent_ticket_id) {
        const parent = state.data.tickets.find(item => String(item.id) === String(ticket.parent_ticket_id))
        if (!parent) { showToast('Parent repair record not found.', 'error'); return }
        printThermal(buildSubInvoiceSlip(ticket, parent))
      } else {
        printThermal(buildTicketSlip(ticket))
      }
      return
    }

    if (el.dataset.action === 'clear-receipt-filter') {
      adminState.receiptDateFrom = ''
      adminState.receiptDateTo   = ''
      adminState.receiptSearch   = ''
      adminState.receiptType     = 'all'
      render(); return
    }

    if (el.dataset.action === 'open-receipt-modal') {
      adminState.receiptModalIdx = Number(el.dataset.receiptIdx)
      state.modal = { type: 'receipt-detail' }
      render(); return
    }

    if (el.dataset.action === 'receipt-prev') {
      if (adminState.receiptModalIdx > 0) {
        adminState.receiptModalIdx--
        state.modal = { type: 'receipt-detail' }
        render()
      }
      return
    }

    if (el.dataset.action === 'receipt-next') {
      adminState.receiptModalIdx++
      state.modal = { type: 'receipt-detail' }
      render()
      return
    }

    if (el.dataset.action === 'toggle-receipt') {
      const rid = Number(el.dataset.receiptId)
      adminState.receiptsExpanded = adminState.receiptsExpanded === rid ? null : rid
      render(); return
    }

    if (el.dataset.action === 'add-quick-comp') {
      const val = document.getElementById('new-comp-input')?.value?.trim(); if (!val) return
      const { error } = await sb.from('repair_components').insert({
        name: val, sort_order: (state.data.repairComponents||[]).length + 1
      })
      if (error) { showToast('Error: '+error.message, 'error'); return }
      const input = document.getElementById('new-comp-input')
      if (input) input.value = ''
      await load(); return
    }
    if (el.dataset.action === 'save-quick-comps') {
      // No longer needed — adds/removes go directly to DB
      await load(); return
    }
    if (el.dataset.removeQuick !== undefined) {
      const compId = Number(el.dataset.removeQuick)
      const { error } = await sb.from('repair_components').delete().eq('id', compId)
      if (error) { showToast('Error: '+error.message, 'error'); return }
      await load(); return
    }

    if (el.dataset.action === 'add-qitem') {
      const val = document.getElementById('qitem-name')?.value?.trim(); if (!val) return
      const { error } = await sb.from('quick_items').insert({
        name: val, prices: [], sort_order: (state.data.quickItems||[]).length + 1
      })
      if (error) { showToast('Error: '+error.message, 'error'); return }
      await load(); return
    }
    if (el.dataset.action === 'save-qitems') {
      // Save is now per-item directly to quick_items table
      // Individual add/remove handlers do the DB work — this just refreshes
      await load(); return
    }
    if (el.dataset.removeQitem !== undefined) {
      const item = (state.data.quickItems||[])[Number(el.dataset.removeQitem)]
      if (!item) return
      const { error } = await sb.from('quick_items').delete().eq('id', item.id)
      if (error) { showToast('Error: '+error.message, 'error'); return }
      await load(); return
    }
    if (el.dataset.addQprice !== undefined) {
      const idx  = Number(el.dataset.addQprice)
      const val  = Number(document.getElementById(`qprice-input-${idx}`)?.value)
      if (!val || val <= 0) return
      const variantName = document.getElementById(`qvariant-name-${idx}`)?.value?.trim() || ''
      const item = (state.data.quickItems||[])[idx]
      if (!item) return
      const newPrices = [...(item.prices||[]), { name: variantName, price: val }]
      const { error } = await sb.from('quick_items').update({ prices: newPrices }).eq('id', item.id)
      if (error) { showToast('Error: '+error.message, 'error'); return }
      await load(); return
    }
    if (el.dataset.removeQprice !== undefined) {
      const [i,pi] = el.dataset.removeQprice.split('-').map(Number)
      const item = (state.data.quickItems||[])[i]
      if (!item) return
      const newPrices = [...(item.prices||[])]
      newPrices.splice(pi, 1)
      const { error } = await sb.from('quick_items').update({ prices: newPrices }).eq('id', item.id)
      if (error) { showToast('Error: '+error.message, 'error'); return }
      await load(); return
    }

    if (el.dataset.invEdit && _inv) { _inv.handleInvEdit(el); render(); return }
    if (el.dataset.invAdjust && _inv) { _inv.handleInvAdjust(el); render(); return }
    if (el.dataset.invDelete && _inv) {
      const { deleted } = await _inv.handleInvDelete(el)
      if (deleted) await load()
      return
    }

    if (el.dataset.settleId) {
      const accountKey = el.dataset.settleId
      const amount  = Number(document.querySelector(`[data-settle-amount="${accountKey}"]`)?.value)
      const method  = document.querySelector(`[data-settle-method="${accountKey}"]`)?.value || 'Cash'
      if (!amount || amount <= 0) { showToast('Enter a valid amount.', 'warning'); return }
      openPinPrompt('settle', async (verified) => {
        if (!verified) return
        const rec = (state.data.udharAccounts || []).find(u => `${u.kind}:${u.sourceId}` === accountKey)
        const result = await settleUdhar(rec, amount, method)
        if (!result.ok) { showToast('Settle error: '+result.error, 'error'); return }
        await load(); state.modal = { type:'udharList' }; render()
      }, render); return
    }

    const viewTicketEl = el.closest('[data-view-ticket]')
    if (viewTicketEl && el.tagName !== 'BUTTON' && !el.closest('button')) {
      const ticketId = String(viewTicketEl.dataset.viewTicket)
      await openTicketDetail(ticketId)
      return
    }
  })

  // Input
  app.addEventListener('input', e => {
    const t = e.target
    if (t.dataset.filter !== undefined) { adminState.filter = t.value; render() }
    if (t.dataset.receiptSearch !== undefined) { adminState.receiptSearch = t.value; render() }
    if (t.dataset.receiptFrom !== undefined) { adminState.receiptDateFrom = t.value; render() }
    if (t.dataset.receiptTo   !== undefined) { adminState.receiptDateTo   = t.value; render() }
    if (t.dataset.subinvCompPrice !== undefined || t.dataset.subinvLabour !== undefined) {
      const prices = [...document.querySelectorAll('[data-subinv-comp-price]')].reduce((s,inp) => s+(Number(inp.value)||0), 0)
      const labour = Number(document.querySelector('[data-subinv-labour]')?.value||0)
      const el     = document.getElementById('subinv-draft-total')
      if (el) el.textContent = money(prices+labour)
    }
    if (t.dataset.repairCancelRefund !== undefined) {
      const available = Math.max(0, Number(state.modal?.summary?.netPayments || 0))
      const refund = Math.min(available, Math.max(0, Number(t.value || 0)))
      const customer = document.getElementById('repair-cancel-customer')
      const retained = document.getElementById('repair-cancel-retains')
      const obligation = document.getElementById('repair-cancel-obligation')
      if (customer) customer.textContent = money(refund)
      if (retained) retained.textContent = money(available-refund)
      if (obligation) obligation.textContent = money(available-refund)
    }
  })

  // Enter key submits quick-add inputs that aren't inside a <form>
  app.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return
    if (e.target.id?.startsWith('qprice-input-')) {
      e.preventDefault()
      const idx = e.target.id.replace('qprice-input-', '')
      document.querySelector(`[data-add-qprice="${idx}"]`)?.click()
      return
    }
    const map = {
      'new-comp-input': 'add-quick-comp',
      'custom-comp-name': 'add-custom-draft-comp',
      'custom-tag-text':  'confirm-draft-custom-tag',
    }
    const action = map[e.target.id]
    if (!action) return
    e.preventDefault()
    document.querySelector(`[data-action="${action}"]`)?.click()
  })

  // Change
  app.addEventListener('change', async e => {
    const t = e.target
    if (t.dataset.action === 'admin-module') {
      adminState.filter = ''
      const { navigate } = await import('../router.js')
      navigate(`/admin/${t.value}`)
      return
    }
    if (t.dataset.receiptType !== undefined) {
      adminState.receiptType = t.value
      adminState.receiptModalIdx = null
      render()
      return
    }
  })

  // Submit
  app.addEventListener('submit', async e => {
    if (!window.location.pathname.startsWith('/admin')) return
    e.preventDefault()
    const form = e.target
    const data = Object.fromEntries(new FormData(form).entries())
    const type = form.dataset.form
    dlog('ADMIN.submit', `ENTRY form.dataset.form=${type}`)

    if (type === 'add-quick-item') {
      const itemName = data.itemName?.trim()
      if (!itemName) { showToast('Item name is required.', 'warning'); return }
      const names  = [...form.querySelectorAll('[name="variantName[]"]')].map(i => i.value.trim())
      const prices = [...form.querySelectorAll('[name="variantPrice[]"]')].map(i => Number(i.value) || 0)
      const variants = names.map((name, i) => ({ name, price: prices[i] })).filter(v => v.price > 0)
      const { error } = await sb.from('quick_items').insert({
        name: itemName, prices: variants,
        sort_order: (state.data.quickItems||[]).length + 1
      })
      if (error) { showToast('Error: ' + error.message, 'error'); return }
      state.modal = null
      await load(); return
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

    if (type === 'edit-employee') {
      const empId   = form.dataset.empId
      const updates = { employeeId:Number(empId), name:data.name, role:data.role, status:data.status, email:(data.email||'').toLowerCase().trim() }
      if (data.password?.trim()) {
        const err = validatePassword(data.password)
        if (err) { showToast(err, 'warning'); return }
      }
      const result = await invokeAccountAdmin('update-employee', updates)
      if (!result.ok) { showToast('Error updating: '+result.error, 'error'); return }
      if (data.password?.trim()) {
        const reset = await invokeAccountAdmin('reset-password', { email: updates.email, newPassword: data.password })
        if (!reset.ok) { showToast('Employee details were saved, but password reset failed: ' + reset.error, 'error'); return }
      }
      state.modal = null; await load(); return
    }

    if (type === 'employee') {
      const pwErr = validatePassword(data.password||'')
      if (pwErr) { showToast(pwErr, 'warning'); return }
      const result = await invokeAccountAdmin('create-employee', {
        name:data.name, email:(data.email||'').toLowerCase().trim(),
        password:data.password, role:data.role||'Cashier',
      })
      if (!result.ok) { showToast('Error saving employee: '+result.error, 'error'); return }
      state.modal = null; await load(); return
    }

    if (type === 'settings') {
      const updates = {}
      const logoFile = form.querySelector('[name="logo"]')?.files?.[0]
      if (logoFile) {
        const base64 = await new Promise(res => {
          const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(logoFile)
        })
        updates.shop_logo = base64
      }
      if (data.name)                updates.shop_name        = data.name
      if (data.address)             updates.shop_address     = data.address
      if (data.phone)               updates.shop_phone       = data.phone
      if (data.primaryColor)        updates.primary_color    = data.primaryColor
      if (data.secondaryColor)      updates.secondary_color  = data.secondaryColor
      if (data.currency)            updates.currency         = data.currency
      if (data.taxRate)             updates.tax_rate         = Number(data.taxRate)
      if (data.invoicePrefix)       updates.invoice_prefix   = data.invoicePrefix.trim().toUpperCase()
      if (data.ticketPrefix)        updates.ticket_prefix    = data.ticketPrefix.trim().toUpperCase()
      if (data.receiptFooter)       updates.terms_text       = data.receiptFooter
      if (data.businessDescription) updates.shop_description = data.businessDescription
      const result = await invokeAccountAdmin('update-config', { updates })
      if (!result.ok) { showToast('Settings error: '+result.error, 'error'); return }
      state.modal = null; await load(); return
    }

    if (type === 'owner-login') {
      const email = data.owner_email?.toLowerCase().trim()
      if (!email) { showToast('Enter an owner email.', 'warning'); return }
      const result = await invokeAccountAdmin('update-owner', { email })
      if (!result.ok) { showToast('Error: '+result.error, 'error'); return }
      showToast('Owner email updated.', 'success'); return
    }

    if (type === 'override-pin') {
      if (!data.new_pin?.trim()) { showToast('Enter a PIN.', 'warning'); return }
      const result = await invokeAccountAdmin('set-pin', { pin:data.new_pin })
      if (!result.ok) { showToast('Error: '+result.error, 'error'); return }
      showToast('Override PIN updated.', 'success'); return
    }

    if ((type === 'inv-add' || type === 'inv-edit' || type === 'inv-adjust') && _inv) {
      const fn = type === 'inv-add' ? _inv.submitInvAdd
        : type === 'inv-edit' ? _inv.submitInvEdit : _inv.submitInvAdjust
      const { ok } = await fn(data)
      if (!ok) return
      state.modal = null; await load(); return
    }

    // Unrecognized form type -- this listener is intentionally global for
    // the session (see attachEvents() comment), so it keeps receiving
    // submit events even after navigating away from /admin. A form it
    // doesn't own (e.g. pos.js's own "repair" form) bubbling through the
    // shared #app element must be a no-op here, not assumed to be ours.
    dlog('ADMIN.submit', `type=${type} not recognized by this listener -- no-op`)
  })

}

/* ── Sub-invoice draft helpers ── */
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

function _addComponentToDraft(name, tag, customText) {
  const parentId = state.modal._parentId
  const draftComponents = [
    ...(state.modal._draftComponents || []),
    { name, tag, customText, price: 0 },
  ]
  state.modal = { type: 'create-sub-invoice', parentId, draftComponents, draftLabour: state.modal._draftLabour || 0 }
  render()
}

/* ── Public ── */
export async function initAdmin(sess, module, query) {
  dlog('ADMIN.initAdmin', `ENTRY module=${module} _eventsAttached=${_eventsAttached} caller=[${callerInfo()}]`)
  SESSION    = sess
  state.role = sess.employee?.role || null
  const requestedModule = module || 'dashboard'
  if (!can(requestedModule, state.role)) {
    const { navigate } = await import('../router.js')
    navigate(state.role === 'Technician' ? '/workshop' : '/pos', { replace: true })
    return
  }
  if (module) adminState.adminModule = module
  if (module === 'settings' && query?.tab) adminState.settingsTab = query.tab
  if (module === 'catalog'  && query?.tab) adminState.catalogTab  = query.tab
  await load()
}
