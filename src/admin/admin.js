import {captureView,listenOwned,viewAwait} from '../ui-lifecycle.js'
import {settleRead,readStates,resourceReady,resourceNotice} from '../read-state.js'
import { createSupportClient } from '../platform/support.js'
import { supportPage } from './pages/support.js'
import {readAdminView,saveAdminView,safeAdminState} from './navigation-state.js'
import { settingsUpdates } from '../settings-data.js'
import { managedFeatures } from '../onboarding-state.js'
import { escapeHTML, safeImageURL } from "../html.js"
import { SHORT_BRAND_NAME } from '../config/brand.js'
import { readLegalStatus } from '../legal/api.js'
import { legalSettingsHTML } from '../legal/acceptance.js'
import { rememberAdditionalWorkInput, submitAdditionalWorkDraft } from '../features/repairs/additional-work.js'
import {
  sb, state, CFG, loadConfig, applyBranding, currentTenant,
  _clearSession,
  can, modalEntitled, ACCESS, validatePassword,
  money, moneyHTML, fld, modalActions, statusBadge,
  openPinPrompt, pinPromptHTML, handlePpKey, cancelPinPrompt, normalizeModalControls,
  logBillEvent,
  myAccountModalHTML, handleChangePasswordSubmit,
  generateTempPassword, listPendingResetRequests, resolvePasswordReset,
  invokeAccountAdmin,
  showTransactionSuccess, showBlockingError, showToast, confirmAction, requestInput, runInstallPrompt,
} from '../shared.js'
import {
  markComponentNotNeeded, getRepairFamilySummary,
  decideAdditionalWork, createRepairAdjustment, cancelRepair,
} from '../features/repairs/api.js'
import { findRepairFamilies, groupRepairFamilies, matchedRepairChild } from '../features/repairs/family.js'
import { dlog, dstack, callerInfo } from '../debuglog.js'
import {onPrivateReset} from '../ui-authority.js'
import {pageControls,readComplete,readPreview} from '../bounded-read.js'
import {adminPage,flatResource,verifiedLegacyMembers} from '../features/admin/resources.js'
import {hasReadContract,repairFamilyPage,receiptArchivePage} from '../backend-reads.js'
import { reportsPage } from './pages/reports.js'
import { billingUsagePage } from './pages/billing-usage.js'
import { createPlatformBridge } from '../platform/bridge.js'
import { catalogPage, qiVariantRowHTML, addQuickItemModalHTML } from '../features/admin/catalog/render.js'
import { receiptsPage, receiptArchive, udharListModalHTML, receiptDetailModalHTML } from '../features/admin/checkout/render.js'
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
  ['billing-usage', '▧', 'Billing & Usage'],
  ['customer-support', '◈', 'Help & Support'],
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
const platformBridge = createPlatformBridge(sb)
let billingResult = null
let legalStatus = null
const customerSupport = createSupportClient(sb)
let resupplyBusy = false
let paperObservation = {}
let paperActor = null
let _inv = null  // populated via dynamic import only when inventory_module_enabled
let adminNavigationIsCurrent = () => true
let adminLoadGeneration = 0
const ownsAdmin=()=>adminNavigationIsCurrent()&&window.location.pathname==='/admin/'+adminState.adminModule&&state.role===SESSION.employee?.role&&can(adminState.adminModule,state.role)
let restoreScroll = null
let flatGeneration=0,flatTimer=null
const initialAdminState={...adminState}
onPrivateReset(() => {
  adminLoadGeneration++;adminNavigationIsCurrent=()=>false;SESSION={}
  for(const key of Object.keys(adminState))delete adminState[key]
  Object.assign(adminState,initialAdminState)
  billingResult=null;legalStatus=null;paperObservation={};paperActor=null;resupplyBusy=false;restoreScroll=null
  customerSupport.reset()
  flatGeneration++;clearTimeout(flatTimer)
})
const saveNavigation = () => {
  if(adminNavigationIsCurrent() && state.role===SESSION.employee?.role)saveAdminView(history,location,SESSION,adminState,window.scrollY)
}
window.addEventListener('pagehide',saveNavigation)
window.addEventListener('scroll',saveNavigation,{passive:true})

/* ── Load ── */
async function load(verifiedConfig) {
  const view=captureView()
  const generation = ++adminLoadGeneration
  flatGeneration++;clearTimeout(flatTimer);adminState._page=null
  adminState._receiptPage=null
  const loadSession = SESSION
  const loadPath = window.location.pathname
  const navigationIsCurrent=adminNavigationIsCurrent
  const current = () => view() && generation === adminLoadGeneration && navigationIsCurrent() && SESSION === loadSession && state.role === loadSession.employee?.role && window.location.pathname === loadPath
  dlog('ADMIN.load', `ENTRY adminModule=${adminState.adminModule}`)
  const configReady=await loadConfig(false,verifiedConfig)
  if (!current() || !window.location.pathname.startsWith('/admin')) return
  if(!configReady){state.resources={config:{status:'unavailable'}};render();return}
  if (!can(adminState.adminModule, state.role)) {
    state.modal = null
    adminState.adminModule = 'dashboard'
    const { navigate } = await import('../router.js')
    navigate('/admin/dashboard', { replace:true })
    return
  }
  if (adminState.adminModule==='inventory' && CFG.inventory_module_enabled && !_inv) {
    _inv = await import('../features/admin/inventory/index.js')
    if (!current()) return
  }
  const mod = adminState.adminModule
  legalStatus = null
  if (mod === 'settings' && adminState.settingsTab==='legal' && SESSION.employee?.role === 'Business Owner') {
    let result = null
    try { result = await readLegalStatus(sb) } catch {}
    if (!current()) return
    legalStatus = result
  }
  if (mod === 'billing-usage' && can(mod, state.role)) {
    let result
    try { result = await platformBridge.readBilling(SESSION.authUserId||SESSION.user?.id) }
    catch { result = null }
    if (!current()) return
    if(result){billingResult=result;paperObservation={checkedAt:new Date().toISOString(),accepted:paperObservation.accepted&&!result.paper_requests?.some(r=>r.request_id===paperObservation.accepted)?paperObservation.accepted:null}}
    else {billingResult=null;paperObservation={...paperObservation,error:true}}
  }
  if (mod === 'customer-support' && can(mod, state.role)) {
    try { await customerSupport.list(customerSupport.view.offset) } catch(error) { if(current())customerSupport.view.error=error.message }
    if (!current()) return
    if(SESSION.employee?.role==='Business Owner'){
      try{await customerSupport.consents()}catch(error){if(current())customerSupport.view.error=error.message}
      if(!current())return
    }
  }
  const pagedFamilies=mod==='repairs'&&hasReadContract('repair_families')
  const pagedReceipts=mod==='receipts'&&hasReadContract('receipt_archive')
  const needs = {
    tickets: CFG.repair_module_enabled && (mod==='repairs'||mod==='receipts'&&!pagedReceipts),
    archive:pagedReceipts,
    sales: ['dashboard','reports'].includes(mod)||mod==='receipts'&&!pagedReceipts,
    employees: mod==='employees',
    udhar: false,
    financial: ['dashboard','reports'].includes(mod),
    returns: false,
    inventory: mod === 'inventory' && CFG.inventory_module_enabled,
    quickItems: mod === 'catalog'&&adminState.catalogTab==='quickitems',
    repairComponents: CFG.repair_module_enabled && mod === 'catalog' && adminState.catalogTab==='components',
  }
  const skip = { data: [] }
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1)
  state.resources=Object.fromEntries(Object.entries(needs).filter(([,needed])=>needed).map(([k])=>[k,{status:'loading'}]));render()
  const dashboardCounts=mod==='dashboard'?Promise.all([
    CFG.repair_module_enabled?sb.from('tickets').select('id',{count:'exact',head:true}).is('parent_ticket_id',null).not('status','in','("Delivered","Declined","Cancelled")'):{count:0},
    sb.from('employees').select('id',{count:'exact',head:true}),
    sb.from('employees').select('id',{count:'exact',head:true}).eq('status','Active'),
  ].map(settleRead)):null
  const [tickets, sales, employees, udharAccounts, financial, financialToday, returns_, inv, quickItems, repairComponents, archive] = await Promise.all([
    needs.tickets ? pagedFamilies?repairFamilyPage({search:adminState.filter,current}):verifiedLegacyMembers('tickets',current) : skip,
    needs.sales ? mod==='receipts'?verifiedLegacyMembers('sales',current):readPreview(()=>sb.from('sales').select(mod==='dashboard'?'id,invoice_number,customer_name,payment_method,total_bill,created_at':'id,invoice_number,customer_name,payment_method,total_bill,created_at,items_sold').order('created_at',{ascending:false}).order('id',{ascending:false}),mod==='dashboard'?8:15,current) : skip,
    needs.employees ? adminPage(mod,adminState.catalogTab,adminState.filter,0,current) : skip,
    needs.udhar ? sb.rpc('get_unified_udhar_accounts') : skip,
    needs.financial ? sb.rpc('get_financial_report', {
      p_from: null, p_to: null, p_actor_only: false,
    }) : { data: {} },
    mod==='dashboard' ? sb.rpc('get_financial_report', {
      p_from: todayStart.toISOString(), p_to: todayEnd.toISOString(), p_actor_only: false,
    }) : { data: {} },
    needs.returns ? sb.from('returns').select('*').order('id', { ascending: false }) : skip,
    needs.inventory ? adminPage(mod,adminState.catalogTab,adminState.filter,0,current) : skip,
    needs.quickItems ? adminPage(mod,adminState.catalogTab,adminState.filter,0,current) : skip,
    needs.repairComponents ? adminPage(mod,adminState.catalogTab,adminState.filter,0,current) : skip,
    needs.archive?receiptArchivePage(adminState,{current}):skip,
  ].map(settleRead))
  if (!current()) return
  const reads=readStates({tickets,sales,employees,udharAccounts,financial,financialToday,returns:returns_,inventory:inv,quickItems,repairComponents,archive},['financial','financialToday'])
  state.data=reads.values;state.resources=reads.resources
  const resource=flatResource(mod,adminState.catalogTab)
  if(resource)adminState._page={inventory:inv,employees,quickItems,repairComponents}[resource]
  if(pagedFamilies&&!tickets.error)adminState._page={...tickets,data:tickets.rootIds}
  if(pagedReceipts&&!archive.error)adminState._page=adminState._receiptPage=archive
  if(mod==='dashboard'){
    const counts=await dashboardCounts
    if(!current())return
    const value=r=>!r.error&&Number.isSafeInteger(r.count)?r.count:null
    state.data.dashboardCounts={openTickets:value(counts[0]),employees:value(counts[1]),activeEmployees:value(counts[2])}
  }
  applyBranding()
  dlog('ADMIN.load', `DATA READY (queries resolved) adminModule=${adminState.adminModule}`)

  if (adminState.adminModule === 'ems' && can('ems', state.role)) {
    const { loadEMSData, emsView, attachEMSEvents } = await import('../features/admin/ems/index.js')
    if (!current() || !can('ems', state.role) || window.location.pathname !== '/admin/ems') return
    const emsData = await loadEMSData()
    if (!current()) return
    adminState._emsData = emsData
    adminState._emsHTML = emsView(emsData, SESSION)
    render()
    const app = document.getElementById('app')
    let emsReloadGeneration=0
    attachEMSEvents(app, () => adminState._emsData, async (options={}) => {
      const reload=++emsReloadGeneration
      if (!current() || !can('ems', state.role) || window.location.pathname !== '/admin/ems') return
      const fresh = await loadEMSData({...options,previous:adminState._emsData})
      if (!current()||reload!==emsReloadGeneration) return
      adminState._emsData = fresh
      adminState._emsHTML = emsView(fresh, SESSION)
      render()
    }, SESSION,current,()=>{if(current()){adminState._emsHTML=emsView(adminState._emsData,SESSION);render()}})
    return
  }

  render()
}

function pagedAdminResource(){
  if(adminState.adminModule==='repairs'&&CFG.repair_module_enabled&&hasReadContract('repair_families'))return 'tickets'
  if(adminState.adminModule==='receipts'&&hasReadContract('receipt_archive'))return 'archive'
  return flatResource(adminState.adminModule,adminState.catalogTab)
}
function queueAdminSearch(){
  const key=pagedAdminResource()
  if(!key){render();return}
  const revision=++flatGeneration;clearTimeout(flatTimer)
  state.resources[key]={status:'loading'}
  document.querySelector('.content')?.setAttribute('aria-busy','true')
  document.querySelectorAll('[data-inv-edit],[data-inv-adjust],[data-inv-delete],[data-emp-id],[data-remove-qitem],[data-add-qprice],[data-remove-qprice],[data-remove-quick],[data-view-ticket],[data-ticket-id],[data-sale-id],[data-receipt-idx],[data-admin-page]').forEach(button=>button.disabled=true)
  flatTimer=setTimeout(()=>{if(ownsAdmin())void loadFlatPage(0,revision)},180)
}
async function loadFlatPage(offset=0,revision=++flatGeneration) {
  const view=captureView(),mod=adminState.adminModule,tab=adminState.catalogTab,query=adminState.filter
  const receiptQuery=JSON.stringify([adminState.receiptSearch,adminState.receiptType,adminState.receiptDateFrom,adminState.receiptDateTo])
  const key=pagedAdminResource(),current=()=>view()&&ownsAdmin()&&revision===flatGeneration&&adminState.filter===query&&adminState.catalogTab===tab&&receiptQuery===JSON.stringify([adminState.receiptSearch,adminState.receiptType,adminState.receiptDateFrom,adminState.receiptDateTo])
  if(!key||!current())return
  state.resources[key]={status:'loading'}
  document.querySelector('.content')?.setAttribute('aria-busy','true')
  const result=await settleRead(key==='tickets'?repairFamilyPage({search:query,offset,current}):key==='archive'?receiptArchivePage(adminState,{offset,current}):adminPage(mod,tab,query,offset,current,offset?adminState._page?.size||25:25))
  if(!current())return
  state.data[key]=result.error?null:result.data
  state.resources[key]={status:result.error?'unavailable':'ready'}
  adminState._page=result.error?null:key==='tickets'?{...result,data:result.rootIds}:result
  if(key==='archive')adminState._receiptPage=result.error?null:result
  render()
}

async function openReceiptDetail(index){
  const record=receiptArchive(adminState)[index]
  if(!record)return
  adminState.receiptModalIdx=index
  const view=captureView(),modal={type:'receipt-detail',readStatus:record.raw?'ready':'loading'},current=()=>view()&&ownsAdmin()&&state.modal===modal&&receiptArchive(adminState)[index]===record
  state.modal=modal;render()
  if(record.raw)return
  const result=await settleRead(sb.from(record.kind==='ticket'?'tickets':'sales').select('*').eq('id',record.id).single())
  if(!current())return
  if(result.error||!result.data){modal.readStatus='unavailable';render();return}
  let parent=null
  if(result.data.parent_ticket_id){
    const selected=await settleRead(sb.from('tickets').select('*').eq('id',result.data.parent_ticket_id).single())
    if(!current())return
    if(selected.error||!selected.data){modal.readStatus='unavailable';render();return}
    parent=selected.data
  }
  record.raw=result.data;record.parent=parent;modal.readStatus='ready';render()
}

async function openAdminUdhar() {
  const view=captureView(),modal={type:'udharList',readStatus:'loading'},current=()=>view()&&ownsAdmin()&&state.modal===modal
  state.modal=modal;render()
  const result=await settleRead(sb.rpc('get_unified_udhar_accounts'))
  if(!current())return
  if(result.error||!Array.isArray(result.data))modal.readStatus='unavailable'
  else {state.data.udharAccounts=result.data;modal.readStatus='ready'}
  render()
}

async function loadEditorComponents(current) {
  if(!CFG.repair_module_enabled)throw Error('Repair intake is unavailable.')
  const result=await readComplete(()=>sb.from('repair_components').select('id,name,sort_order',{count:'exact'}).order('sort_order').order('id'),{current})
  if(current())state.data.repairComponents=result.data
}

/* ── Render ── */
let _eventsAttached = false

function render() {
  if (!adminNavigationIsCurrent() || !window.location.pathname.startsWith('/admin') || state.role !== SESSION.employee?.role) return
  dstack('ADMIN.render', `*** #app REWRITE *** adminModule=${adminState.adminModule}`)
  const tenant = currentTenant()
  if (!can(adminState.adminModule, state.role)) adminState.adminModule = 'dashboard'
  const _modalScroll = document.querySelector('.modal')?.scrollTop || 0

  document.getElementById('app').innerHTML = `
    <div class="app-shell client-shell">
      <main class="main">
        <header class="topbar">
          <div class="brand top-brand">
            <div class="logo">${tenant.logo ? `<img alt="" src="${escapeHTML(safeImageURL(tenant.logo))}">` : escapeHTML(tenant.name.slice(0,2).toUpperCase())}</div>
            <div>
              <strong>${escapeHTML(tenant.name)}</strong>
              <span class="muted" style="font-size:12px">${escapeHTML(state.role)} · Back Office</span>
            </div>
          </div>
          <div class="top-actions">
            <select class="tenant-switcher compact-select" data-action="admin-module">
              ${ADMIN_MODULES.filter(([k]) => can(k, state.role))
                .map(([k,,l]) => `<option value="${k}" ${k === adminState.adminModule ? 'selected' : ''}>${l}</option>`)
                .join('')}
            </select>
            <span class="chip">
              <strong style="font-size:12px">${escapeHTML(SESSION.employee.name)}</strong>
              <span class="muted" style="font-size:11px"> · ${escapeHTML(state.role)}</span>
            </span>
            <span class="chip">
              <i class="dot ${state.online ? '' : 'offline'}"></i>
              ${state.online ? 'Online' : 'Offline'}
            </span>
            ${(SESSION.isAdmin || state.role === 'Business Owner') ? `
              <button class="secondary-button" data-action="go-pos">POS</button>
              ${can('workshop', state.role)
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
  if(restoreScroll!==null){const scroll=restoreScroll;restoreScroll=null;requestAnimationFrame(()=>{if(adminNavigationIsCurrent())window.scrollTo(0,scroll)})}
  saveNavigation()
}

function pageContent() {
  const failed=Object.entries(state.resources||{}).filter(([,r])=>r.status!=='ready'&&r.status!=='disabled')
  if(failed.length)return adminShell(resourceNotice('Current '+adminState.adminModule+' data',failed.some(([,r])=>r.status==='loading')?'loading':'unavailable'))
  if (adminState.adminModule === 'customer-support') return adminShell(supportPage(customerSupport.view,SESSION.employee?.role==='Business Owner'))
  if (adminState.adminModule === 'billing-usage') return adminShell(billingUsagePage(billingResult, resupplyBusy, Date.now(), paperObservation))
  const pages = { dashboard, repairs, inventory, catalog, reports, employees, receipts, settings }
  if (adminState.adminModule === 'ems') {
    return adminShell(adminState._emsHTML || '<div class="empty">Loading EMS…</div>')
  }
  return adminShell((pages[adminState.adminModule] || dashboard)()+pageControls(adminState._page,'data-admin-page'))
}

function adminShell(content) {
  const tenant   = currentTenant()
  const modLabel = ADMIN_MODULES.find(([k]) => k === adminState.adminModule)?.[2] || ''
  return `
    <div class="admin-header">
      <div><h1>${escapeHTML(modLabel)}</h1><p class="muted">${escapeHTML(tenant.name)}</p></div>
    </div>
    ${content}`
}

const tit = (h, sub, action) =>
  `<div class="page-title"><div><h1>${h}</h1><p class="muted">${sub}</p></div><div>${action}</div></div>`
const tlb = (ph) =>
  `<div class="toolbar"><div class="toolbar-left"><input class="search" data-filter value="${escapeHTML(adminState.filter)}" placeholder="${ph}"></div></div>`

/* ═══════════════ PAGES ═══════════════ */
function dashboard() {
  const sales    = state.data.sales    || []
  const tickets  = state.data.tickets  || []
  const financial = state.data.financial || {}
  const todayFinancial = state.data.financialToday || {}
  const counts=state.data.dashboardCounts||{},pending=counts.openTickets??'Unavailable'
  const kpis = [
    ["Today's Invoiced", Number(todayFinancial.invoiced || 0),  'reports'],
    ["Today's Collected", Number(todayFinancial.paymentsCollected || 0), 'reports'],
    ['Net Payments', Number(financial.netPayments || 0), 'reports'],
    ['Open Tickets',    pending,   'repairs'],
    ['Udhar Balance',   Number(financial.udharOutstanding || 0),  'udharList'],
    ['Employees',       counts.employees??'Unavailable', 'employees'],
  ]
  return `
    ${tit('Dashboard','Live overview of sales, tickets, and operations.',
      can('pos',state.role)?`<button class="primary-button" data-action="go-pos">Go to POS</button>`:'')}
    <div class="grid kpi-grid">
      ${kpis.filter(([, ,target]) => target === 'udharList' || can(target, state.role)).map(([l,v,target]) => `
        <div class="card kpi" style="cursor:pointer" data-kpi-target="${target}">
          <span class="label">${l}</span>
          <span class="value">${typeof v === 'number' && !['Open Tickets','Employees'].includes(l)
            ? moneyHTML(v) : v}</span>
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
              <td>${escapeHTML(s.customer_name||'Walk-in')}</td>
              <td>${escapeHTML(s.payment_method)}</td>
              <td>${moneyHTML(s.total_bill)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
      <div class="card">
        <h2>Operational Alerts</h2>
        <div class="list">
          ${CFG.repair_module_enabled ? `<div class="list-row"><span>Pending Repairs</span><strong>${pending}</strong></div>` : ''}
          <div class="list-row"><span>Outstanding Udhar accounts</span><button class="secondary-button" data-kpi-target="udharList">View complete detail</button></div>
          <div class="list-row"><span>Today's Payment Events</span><strong>${Number(todayFinancial.paymentCount || 0)}</strong></div>
          <div class="list-row"><span>Active Employees</span><strong>${counts.activeEmployees??'Unavailable'}</strong></div>
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
    ${tit('Repair Tickets','Search the complete repair family from one place.',can('pos',state.role)?`<button class="primary-button" data-action="go-pos" title="Create tickets from the POS counter">New Ticket (via POS)</button>`:'')}
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
                <td><strong>${escapeHTML(r.customer_name)}</strong><br><small class="muted">${escapeHTML(r.customer_phone)}</small></td>
                <td>
                  <span style="color:var(--primary);font-size:12px">${escapeHTML(r.ticket_number)}</span><br>
                  <strong style="font-size:12px">${escapeHTML(r.invoice_number || 'No invoice')}</strong>
                  ${family.members.length > 1 ? `<br><small class="muted">${family.members.length - 1} child invoice${family.members.length === 2 ? '' : 's'}</small>` : ''}
                  ${matchedChild ? `<br><small style="color:var(--primary)">Matched child: ${escapeHTML(matchedChild.invoice_number || 'No invoice')} · ${escapeHTML(matchedChild.ticket_number)}</small>` : ''}
                </td>
                <td>${escapeHTML(r.device_brand)} ${escapeHTML(r.device_model)}</td>
                <td>${Number(r.advance_payment||0)>0 ? moneyHTML(r.advance_payment) : '—'}</td>
                <td><span class="badge ${sc[r.status]||'warn'}">${escapeHTML(r.status)}</span></td>
                <td>
                <div style="display:flex;gap:6px;align-items:center">
                  <button class="secondary-button" style="font-size:12px;padding:4px 10px"
                    data-action="open-ticket-editor" data-ticket-id="${r.id}">Edit</button>
                  ${can('pos',state.role)?`<button class="secondary-button" style="font-size:12px;padding:4px 10px"
                    data-action="admin-collect" data-ticket-id="${r.id}">Collect</button>`:''}
                </div>
              </td>
              </tr>`}).join('') :
              `<tr><td colspan="6" style="text-align:center;color:var(--muted)">No tickets found.</td></tr>`}
          </tbody>
        </table></div>
      </div>
      <div class="card">
        <h2>${adminState._page?.statusCounts?'Matching families by status':'Status Summary'}</h2>
        <div class="list">
          ${['Pending','In Progress','Ready','Delivered','Cancelled','Declined'].map(s => `
            <div class="list-row"><span>${s}</span>
              <strong>${adminState._page?.statusCounts?adminState._page.statusCounts[s]||0:roots.filter(t=>t.status===s).length}</strong>
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
    ${tlb('Search employee name, email or role…')}
    <div class="card">
      ${emps.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${emps.map(e => `<tr>
              <td><strong>${escapeHTML(e.name)}</strong></td>
              <td class="muted" style="font-size:12px">${escapeHTML(e.email||'—')}</td>
              <td>${escapeHTML(e.role)}</td>
              <td><span class="badge ${e.status==='Active'?'good':'bad'}">${escapeHTML(e.status)}</span></td>
              <td style="display:flex;gap:6px">
                ${state.role !== 'Manager' || ['Cashier','Technician'].includes(e.role) ? `<button class="secondary-button" style="font-size:12px"
                  data-action="edit-employee"
                  data-emp-id="${e.id}" data-emp-name="${escapeHTML(e.name)}"
                  data-emp-role="${escapeHTML(e.role)}" data-emp-status="${escapeHTML(e.status)}"
                  data-emp-email="${escapeHTML(e.email||'')}">Edit</button>` : ''}
                ${state.role !== 'Manager' || ['Cashier','Technician'].includes(e.role) ? `
                  <button class="secondary-button" style="font-size:12px;color:var(--warning)"
                    data-action="remove-employee"
                    data-emp-id="${e.id}" data-emp-name="${escapeHTML(e.name)}"
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
  const tabs = { branding:'Branding', contact:'Contact', receipt:'Receipt & Tax', staff:'Staff & Security', legal:'Legal & Privacy' }
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
  return catalogPage({ tit, adminState, isAllowed })+tlb('Search this catalog…')
}

function settingsTabContent() {
  const t = currentTenant()
  if (adminState.settingsTab === 'legal') return legalSettingsHTML(legalStatus, state.role === 'Business Owner')

  const platformFlags = `
    <div class="card" style="display:grid;gap:10px;padding:14px 16px;margin-bottom:4px">
      <p style="font-size:12px;font-weight:600;color:var(--muted);
                text-transform:uppercase;letter-spacing:.5px">
        Plan Features — Managed by ${escapeHTML(SHORT_BRAND_NAME)} Platform
      </p>
      <div style="display:grid;gap:8px">
        ${managedFeatures(CFG).map(([label, enabled]) => `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:13px">${escapeHTML(label)}</span>
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
        Full numbers look like <strong>${escapeHTML(CFG.invoice_prefix||'INV')}20260712 0001</strong> and
        <strong>${escapeHTML(CFG.ticket_prefix||'TK')}20260712 0001</strong> — date stamped automatically,
        sequence number never resets or repeats.
      </p>
      <label class="field" style="grid-column:1/-1"><span>Receipt Footer</span>
        <textarea name="receiptFooter">${escapeHTML(t.receiptFooter)}</textarea></label>
      <div class="modal-actions" style="grid-column:1/-1"><button class="primary-button">Save Receipt Settings</button></div>
    </form>`

  if (adminState.settingsTab === 'staff') {
    return `
      <div style="display:grid;gap:16px">
        <div class="card" style="display:grid;gap:14px">
          <h2>Owner Login</h2>
          <p class="muted" style="font-size:13px">${CFG.onboarding_version === 2 ? 'The invited Business Owner identity is reserved and cannot be changed here.' : 'The owner email stays synchronized with Supabase Auth.'} Owners change their own password from My Account.</p>
          <form class="form-grid" data-form="owner-login">
            ${fld('Owner Email','owner_email',SESSION.employee?.role === 'Business Owner' ? SESSION.employee.email : '','email').replace('<input ', `<input ${CFG.onboarding_version === 2 ? 'readonly ' : ''}`)}
            <div class="modal-actions" style="grid-column:1/-1">
              <button class="primary-button" ${CFG.onboarding_version === 2 ? 'disabled' : ''}>Save Owner Login</button>
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
  if (!modalEntitled(state.modal.type)) { state.modal = null; return '' }
  const { type, id } = state.modal
  if(!['myAccount','pinPrompt'].includes(type)&&Object.values(state.resources||{}).some(r=>r.status!=='ready'&&r.status!=='disabled'))return `<div class="modal-backdrop"><div class="modal">${resourceNotice('Required detail')}<button type="button" data-close>Close</button></div></div>`

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
                <strong>${escapeHTML(r.email)}</strong><br>
                <span class="muted" style="font-size:12px">Requested ${new Date(r.requested_at).toLocaleString()}</span>
              </div>
              <button class="secondary-button" data-action="resolve-reset" data-reset-id="${r.id}" data-reset-email="${escapeHTML(r.email)}">Set New Password</button>
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
          <label class="field"><span>Name</span><input name="name" value="${escapeHTML(e.name||'')}" required></label>
          <label class="field"><span>Email</span><input name="email" type="email" value="${escapeHTML(e.email||'')}"></label>
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


  if (type === 'udharList') return state.modal.readStatus&&state.modal.readStatus!=='ready'?`<div class="modal-backdrop"><div class="modal">${resourceNotice('Outstanding credits',state.modal.readStatus==='loading'?'loading':'unavailable')}<button class="secondary-button" data-action="retry-admin-udhar">Retry detail</button><button class="secondary-button" data-close>Close</button></div></div>`:udharListModalHTML()

  if (type === 'receipt-detail') return receiptDetailModalHTML(adminState)

  return ''
}

async function openTicketDetail(ticketId) {
  const current=captureView()
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
  if(!current())return
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

  app.addEventListener('input',e=>{
    if(!ownsAdmin())return

    const field=e.target.dataset.supportField
    if(window.location.pathname==='/admin/customer-support' && ['subject','category','message'].includes(field) && !customerSupport.view.pending)customerSupport.view.draft[field]=e.target.value
  })
  // Click delegation
  listenOwned(app,'click',ownsAdmin,async (e,eventCurrent)=>{
    if(e.target.closest('[data-action="retry-admin-udhar"]')||(state.modal?.type==='udharList'&&state.modal.readStatus&&e.target.closest('[data-action="retry-resources"]'))){await openAdminUdhar();return}
    if(e.target.closest('[data-action="retry-resources"]')){await load();return}
    if (!can(adminState.adminModule, state.role) || !modalEntitled(state.modal?.type)) return
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
    if(el.dataset.adminPage){const page=adminState._page;if(page)await loadFlatPage(el.dataset.adminPage==='next'?page.nextOffset:Math.max(0,page.offset-page.size));return}
    const pagedResource=pagedAdminResource()
    if(pagedResource&&!resourceReady(state.resources,pagedResource)&&(el.dataset.viewTicket||el.dataset.ticketId||el.dataset.saleId||el.dataset.receiptIdx!==undefined))return
    const activeFlat=flatResource(adminState.adminModule,adminState.catalogTab)
    if(activeFlat&&!resourceReady(state.resources,activeFlat)&&(el.dataset.invEdit||el.dataset.invAdjust||el.dataset.invDelete||el.dataset.empId||el.dataset.removeQitem!==undefined||el.dataset.addQprice!==undefined||el.dataset.removeQprice!==undefined||el.dataset.removeQuick!==undefined))return
    if(el.dataset.action==='support-consent-revoke'){
      if(SESSION.employee?.role!=='Business Owner'||customerSupport.view.busy)return
      const nav=adminNavigationIsCurrent;customerSupport.view.busy=true
      try{await viewAwait(eventCurrent,()=>(customerSupport.consents('revoke',{p_consent:el.dataset.consentId})),()=>state.modal)}catch(error){if(nav())customerSupport.view.error=error.message}
      finally{if(nav()){customerSupport.view.busy=false;render()}}return
    }
    if (el.dataset.action?.startsWith('customer-support-')) {
      if (!can('customer-support',state.role)||customerSupport.view.busy)return
      const session=SESSION,path=window.location.pathname,v=customerSupport.view
      v.busy=true;v.error='';render()
      try {
        if(el.dataset.action==='customer-support-detail')await viewAwait(eventCurrent,()=>(customerSupport.get(el.dataset.ticketId)),()=>state.modal)
        else await viewAwait(eventCurrent,()=>(customerSupport.list(el.dataset.action==='customer-support-next'?v.offset+50:el.dataset.action==='customer-support-previous'?Math.max(0,v.offset-50):v.offset)),()=>state.modal)
      }catch(error){if(SESSION===session)v.error=error.message}
      finally{if(eventCurrent()&&SESSION===session){v.busy=false;if(window.location.pathname===path)render()}}
      return
    }
    dlog('ADMIN.click', `el MATCHED selector -- action=${el.dataset.action} close=${el.dataset.close} tag=${el.tagName}`)

    if (el.dataset.ppKey !== undefined) { handlePpKey(el.dataset.ppKey); return }
    if (el.dataset.close !== undefined) {
      dlog('ADMIN.click', `DATA-CLOSE branch firing -- state.modal was type=${state.modal?.type} -- about to call ADMIN.render()`)
      if (state.modal?.type === 'pinPrompt') { cancelPinPrompt(render); return }
      state.modal = null; render(); return
    }
    if (['paper-resupply','paper-refresh'].includes(el.dataset.action)) {
      const submit=el.dataset.action==='paper-resupply'
      if (resupplyBusy || !can('billing-usage', state.role) || adminState.adminModule!=='billing-usage') return
      if(submit&&(billingResult?.projection?.paper_resupply_enabled!==true||paperObservation.accepted||billingResult?.paper_requests?.some(r=>['requested','approved','dispatched'].includes(r.status))))return
      const session=SESSION,path=window.location.pathname,navigationIsCurrent=adminNavigationIsCurrent
      const current=()=>SESSION===session&&window.location.pathname===path&&navigationIsCurrent()&&can('billing-usage',state.role)
      resupplyBusy = true; render()
      try {
        if(submit){
          const { data: { user }, error } = await viewAwait(eventCurrent,()=>(sb.auth.getUser()),()=>state.modal)
          if(!current())return
          if (error || !user || ((session.authUserId||session.user?.id)&&(session.authUserId||session.user.id)!==user.id)) throw new Error('Please sign in again.')
          const receipt=await viewAwait(eventCurrent,()=>(platformBridge.requestResupply(user.id)),()=>state.modal)
          if(!current())return
          paperObservation={...paperObservation,accepted:receipt.request_id||true}
        }
        try{
          const result=await viewAwait(eventCurrent,()=>(platformBridge.readBilling(session.authUserId||session.user?.id)),()=>state.modal)
          if(!current())return
          billingResult=result;paperObservation={checkedAt:new Date().toISOString(),accepted:paperObservation.accepted&&!result.paper_requests?.some(r=>r.request_id===paperObservation.accepted)?paperObservation.accepted:null}
        }catch{if(current())paperObservation={...paperObservation,error:true}}
      } catch (error) {
        if(current())showBlockingError('Request outcome is unconfirmed. Retry the original request when connected; its saved identity will be reused.')
      } finally { if(current()){resupplyBusy = false; render()} }
      return
    }
    if (el.dataset.action === 'print-ticket-slip') {
      dlog('ADMIN.click', `PRINT-TICKET-SLIP branch firing -- state.modal.ticket=${JSON.stringify(state.modal?.ticket?.ticket_number)}`)
      if (state.modal?.ticket) {
        const { buildTicketSlip, printThermal } = await viewAwait(eventCurrent,()=>(import('../print/print.js')),()=>state.modal)
        printThermal(buildTicketSlip(state.modal.ticket))
      }
      return
    }
    if (el.dataset.action === 'print-repair-summary') {
      const summary = (await viewAwait(eventCurrent,()=>(getRepairFamilySummary(Number(el.dataset.ticketId))),()=>state.modal)).data
      if (!summary) { showBlockingError('Repair summary is unavailable.'); return }
      const { buildRepairSummary, printThermal } = await viewAwait(eventCurrent,()=>(import('../print/print.js')),()=>state.modal)
      printThermal(buildRepairSummary(summary)); return
    }

    if (el.dataset.kpiTarget) {
      const target = el.dataset.kpiTarget
      if (target === 'udharList') { await openAdminUdhar();return }
      if (ADMIN_MODULES.find(([k]) => k === target)) {
        adminState.filter = ''
        const { navigate } = await viewAwait(eventCurrent,()=>(import('../router.js')),()=>state.modal)
        navigate(`/admin/${target}`)
        return
      }
      return
    }

    if (el.dataset.settingsTab) {
      const { navigate } = await viewAwait(eventCurrent,()=>(import('../router.js')),()=>state.modal)
      navigate(`/admin/settings?tab=${el.dataset.settingsTab}`)
      return
    }
    if (el.dataset.catalogTab) {
      if (el.dataset.catalogTab === 'components' && !CFG.repair_module_enabled) return
      const { navigate } = await viewAwait(eventCurrent,()=>(import('../router.js')),()=>state.modal)
      navigate(`/admin/catalog?tab=${el.dataset.catalogTab}`)
      return
    }
    if (el.dataset.modal) {
      if (!modalEntitled(el.dataset.modal)) return
      state.modal = { type:el.dataset.modal, id:el.dataset.id }; render(); return
    }

    if (el.dataset.action === 'go-pos') {
      if(!can('pos',state.role))return
      const { navigate } = await viewAwait(eventCurrent,()=>(import('../router.js')),()=>state.modal)
      navigate('/pos'); return
    }
    if (el.dataset.action === 'go-workshop') {
      if(!can('workshop',state.role))return
      if (!can('workshop', state.role)) return
      const { navigate } = await viewAwait(eventCurrent,()=>(import('../router.js')),()=>state.modal)
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
      if (!reason) { showBlockingError('Enter a reason.'); return }
      const { ticketId, index } = state.modal
      openPinPrompt('remove-component', async (verified) => {
        if (!verified) return
        const tk = state.data.tickets.find(t => String(t.id) === String(ticketId))
        if (!tk) return
        const res = await viewAwait(eventCurrent,()=>(markComponentNotNeeded(Number(ticketId), index, reason)),()=>state.modal)
        if (!res.ok) { showBlockingError('Error: ' + res.error); return }
        await viewAwait(eventCurrent,()=>(load()),()=>state.modal)
        await viewAwait(eventCurrent,()=>(openTicketDetail(ticketId)),()=>state.modal)
      }, render)
      return
    }

    /* Open sub-invoice creation form */
    if (el.dataset.action === 'open-create-sub-invoice') {
      await viewAwait(eventCurrent,()=>loadEditorComponents(eventCurrent),()=>state.modal)
      state.modal = { type: 'create-sub-invoice', parentId: el.dataset.ticketId, draftComponents: [], draftLabour: 0 }
      render(); return
    }

    /* Remove component from the sub-invoice draft */
    if (el.dataset.subinvCompRemove !== undefined) {
      const parentId = state.modal?.parentId
      const comps = readSubInvCompsFromDOM()
      comps.splice(Number(el.dataset.subinvCompRemove), 1)
      state.modal = { type: 'create-sub-invoice', additionalFields:state.modal?.additionalFields, parentId, draftComponents: comps, draftLabour: readSubInvLabourFromDOM() }
      render(); return
    }

    /* Add predefined component to the draft — opens tag picker */
    if (el.dataset.addDraftCompName) {
      state.modal = {
        type:     'add-comp-tag',
        additionalFields:state.modal?.additionalFields,
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
      if (!name) { showBlockingError('Enter a component name.'); return }
      state.modal = {
        type:     'add-comp-tag',
        additionalFields:state.modal?.additionalFields,
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
      if (!text) { showBlockingError('Describe the issue.'); return }
      _addComponentToDraft(state.modal.compName, 'Custom', text)
      return
    }

    /* Record pending/approved/declined additional work. */
    if (el.dataset.action === 'submit-sub-invoice') {
      const parentId = el.dataset.parentId
      const tk = state.data.tickets.find(t => String(t.id) === String(parentId))
      if (!tk || state.modal?.type !== 'create-sub-invoice') return
      const modal = state.modal
      const comps = readSubInvCompsFromDOM()
      const labour = readSubInvLabourFromDOM()
      if (!comps.length && !labour) { showBlockingError('Add at least one component or a labour charge.'); return }
      const res = await viewAwait(eventCurrent,()=>(submitAdditionalWorkDraft(parentId, comps, labour, modal, false)),()=>state.modal)
      if (res.busy) return
      if (!res.ok) { showBlockingError(res.error); return }
      if (res.ticket) {
        const {buildSubInvoiceSlip,printThermal} = await viewAwait(eventCurrent,()=>(import('../print/print.js')),()=>state.modal)
        printThermal(buildSubInvoiceSlip(res.ticket,tk))
      }
      if (state.modal === modal) state.modal = null
      await viewAwait(eventCurrent,()=>(load()),()=>state.modal)
      if (!res.ticket) showTransactionSuccess(`Additional work saved as ${(res.proposal?.decision || 'Pending').toLowerCase()}.`)
      return
    }

    if (el.dataset.action === 'decide-additional-work') {
      const decision = el.dataset.decision
      const input = await viewAwait(eventCurrent,()=>(requestInput({
        title: `${decision} additional work?`,
        message: 'Record how the customer decision was received.',
        confirmLabel: `Save ${decision.toLowerCase()}`,
        fields: [
          { name:'method', label:'Decision method', type:'select', value:'Phone', options:['Phone','In person','WhatsApp','Other'] },
          { name:'note', label:'Decision note (optional)', type:'textarea', value:'' },
        ],
      })),()=>state.modal)
      if (!input?.confirmed) return
      const method = input.value.method
      const note = input.value.note || ''
      const result = await viewAwait(eventCurrent,()=>(decideAdditionalWork(Number(el.dataset.proposalId), decision, method, note)),()=>state.modal)
      if (!result.ok) { showBlockingError('Decision error: ' + result.error); return }
      if (result.ticket) {
        const root = state.data.tickets.find(t=>!t.parent_ticket_id && String(t.id)===String(result.proposal.root_ticket_id))
        if (root) {
          const { buildSubInvoiceSlip, printThermal } = await viewAwait(eventCurrent,()=>(import('../print/print.js')),()=>state.modal)
          printThermal(buildSubInvoiceSlip(result.ticket, root))
        }
      }
      showTransactionSuccess(`Additional work ${decision.toLowerCase()}.`)
      state.modal = null; await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }

    if (el.dataset.action === 'open-repair-adjustment') {
      state.modal = { type:'repair-adjustment', rootId:Number(el.dataset.ticketId) }
      render(); return
    }
    if (el.dataset.action === 'submit-repair-adjustment') {
      const amount = Number(document.getElementById('repair-adjustment-amount')?.value || 0)
      const type = document.getElementById('repair-adjustment-type')?.value || 'discount'
      const reason = document.getElementById('repair-adjustment-reason')?.value?.trim() || ''
      if (amount <= 0 || !reason) { showBlockingError('Enter a positive reduction and a reason.'); return }
      openPinPrompt('discount', async verified => {
        if (!verified) return
        const result = await viewAwait(eventCurrent,()=>(createRepairAdjustment(Number(el.dataset.ticketId), amount, type, reason)),()=>state.modal)
        if (!result.ok) { showBlockingError('Adjustment error: ' + result.error); return }
        showTransactionSuccess('Repair invoice adjustment completed.')
        state.modal = null; await viewAwait(eventCurrent,()=>(load()),()=>state.modal)
      }, render); return
    }
    if (el.dataset.action === 'open-repair-cancellation') {
      const summaryResult = await viewAwait(eventCurrent,()=>(getRepairFamilySummary(Number(el.dataset.ticketId))),()=>state.modal)
      if (!summaryResult.ok) { showBlockingError('Summary error: ' + summaryResult.error); return }
      state.modal = { type:'repair-cancellation', rootId:Number(el.dataset.ticketId), summary:summaryResult.data }
      render(); return
    }
    if (el.dataset.action === 'submit-repair-cancellation') {
      const refund = Number(document.getElementById('repair-cancel-refund')?.value || 0)
      const method = document.getElementById('repair-cancel-method')?.value || 'Cash'
      const reason = document.getElementById('repair-cancel-reason')?.value?.trim() || ''
      if (refund < 0 || !reason) { showBlockingError('Enter a valid refund and a reason.'); return }
      openPinPrompt('repair-refund', async verified => {
        if (!verified) return
        const result = await viewAwait(eventCurrent,()=>(cancelRepair(Number(el.dataset.ticketId), refund, method, reason)),()=>state.modal)
        if (!result.ok) { showBlockingError('Cancellation error: ' + result.error); return }
        showTransactionSuccess(refund > 0 ? 'Repair cancelled and refund completed.' : 'Repair cancelled.')
        state.modal = null; await viewAwait(eventCurrent,()=>(load()),()=>state.modal)
      }, render); return
    }

    if (el.dataset.action === 'install' && state.installPrompt) {
      await viewAwait(eventCurrent,()=>(runInstallPrompt()),()=>state.modal); render(); return
    }
    if (el.dataset.action === 'my-account') {
      state.modal = { type: 'myAccount' }; render(); return
    }
    if (el.dataset.action === 'open-password-resets') {
      const requests = await viewAwait(eventCurrent,()=>(listPendingResetRequests()),()=>state.modal)
      state.modal = { type: 'passwordResets', requests }
      render(); return
    }
    if (el.dataset.action === 'resolve-reset') {
      const email = el.dataset.resetEmail
      const newPass = generateTempPassword()
      const res = await viewAwait(eventCurrent,()=>(resolvePasswordReset(el.dataset.resetId, email, newPass, SESSION.employee?.name || 'Admin')),()=>state.modal)
      if (!res.ok) { showBlockingError('Error: ' + res.error); return }
      await viewAwait(eventCurrent,()=>(confirmAction({
        title: 'Temporary password created',
        message: `New password for ${email}:\n\n${newPass}\n\nShare this directly. It will not be shown again.`,
        confirmLabel: 'Done',
        cancelLabel: 'Close',
      })),()=>state.modal)
      const requests = await viewAwait(eventCurrent,()=>(listPendingResetRequests()),()=>state.modal)
      state.modal = { type: 'passwordResets', requests }
      render(); return
    }
    if (el.dataset.action === 'theme') {
      state.theme = state.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('retailos-theme', state.theme)
      applyBranding(); render(); return
    }
    if (el.dataset.action === 'logout') {
      await viewAwait(eventCurrent,()=>(confirmAction({
        title: 'Log out?',
        message: 'Are you sure you want to log out?',
        confirmLabel: 'Log out',
        tone: 'danger',
        action: async () => { await viewAwait(eventCurrent,()=>(_clearSession()),()=>state.modal); return true },
      })),()=>state.modal)
      return
    }

    if (el.dataset.action === 'go-employees-tab') {
      adminState.adminModule = 'employees'
      adminState.settingsTab = 'branding'
      adminState.catalogTab  = 'quickitems'
      const { navigate } = await viewAwait(eventCurrent,()=>(import('../router.js')),()=>state.modal)
      navigate('/admin/employees'); return
    }

    if (el.dataset.action === 'edit-employee') {
      const selected=await viewAwait(eventCurrent,()=>sb.from('employees').select('id,name,role,status,email').eq('id',el.dataset.empId).single(),()=>state.modal)
      if(selected.error||!selected.data){showBlockingError('Selected employee is unavailable. Retry reads.');return}
      const employee=selected.data
      state.modal = { type:'employee', editMode:true,
        id:employee.id, name:employee.name,
        role:employee.role, status:employee.status, email:employee.email }
      render(); return
    }

    if (el.dataset.action === 'remove-employee') {
      const name      = el.dataset.empName || 'this employee'
      const empId     = el.dataset.empId
      const confirmation = await viewAwait(eventCurrent,()=>(confirmAction({
        title: 'Deactivate employee?',
        message: `Make ${name} inactive? Historical records will be preserved.`,
        confirmLabel: 'Continue',
        tone: 'danger',
      })),()=>state.modal)
      if (!confirmation?.confirmed) return

      openPinPrompt('admin', async (verified) => {
        if (!verified) return
        const found = state.data.employees.find(e => String(e.id) === String(empId))
        if (!found) return
        const result = await viewAwait(eventCurrent,()=>(invokeAccountAdmin('update-employee', {
          employeeId: Number(empId), name: found.name, email: found.email,
          role: found.role, status: 'Inactive',
        })),()=>state.modal)
        if (!result.ok) { showBlockingError('Error deactivating: ' + result.error); return }
        await viewAwait(eventCurrent,()=>(load()),()=>state.modal)
      }, render); return
    }

    if (el.dataset.action === 'open-ticket-editor') {
      const ticketId = el.dataset.ticketId
      await viewAwait(eventCurrent,()=>(openTicketDetail(ticketId)),()=>state.modal)
      return
    }
    if (el.dataset.action === 'retry-ticket-detail') {
      await viewAwait(eventCurrent,()=>(openTicketDetail(el.dataset.ticketId)),()=>state.modal)
      return
    }

    if (el.dataset.action === 'admin-collect') {
      if(!can('pos',state.role))return
      const found = state.data.tickets.find(t => String(t.id) === String(el.dataset.ticketId))
      if (!found) return
      sessionStorage.setItem('retailos_collect_ticket', String(found.id))
      const { navigate } = await viewAwait(eventCurrent,()=>(import('../router.js')),()=>state.modal)
      navigate('/pos'); return
    }

    if (el.dataset.action === 'save-ticket-detail') {
      const newStatus   = document.getElementById('td-status')?.value
      const note        = document.getElementById('td-note')?.value||''
      const upd = { status:newStatus, update_note:note }
      const { error } = await viewAwait(eventCurrent,()=>(sb.from('tickets').update(upd).eq('id', el.dataset.id)),()=>state.modal)
      if (error) { showBlockingError('Update failed: '+error.message); return }
      state.modal = null; await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }

    if (el.dataset.action === 'reprint-receipt') {
      const saleId = Number(el.dataset.saleId)
      const selected=await viewAwait(eventCurrent,()=>sb.from('sales').select('*').eq('id',saleId).single(),()=>state.modal)
      const sale=selected.data
      if (selected.error||!sale) { showBlockingError('Complete sale detail unavailable. Retry reads before reprinting.'); return }
      const { buildReceiptSlip, printThermal } = await viewAwait(eventCurrent,()=>(import('../print/print.js')),()=>state.modal)
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
      if (!ticket) { showBlockingError('Repair invoice not found.'); return }
      const { buildTicketSlip, buildSubInvoiceSlip, printThermal } = await viewAwait(eventCurrent,()=>(import('../print/print.js')),()=>state.modal)
      if (ticket.parent_ticket_id) {
        const parent = state.data.tickets.find(item => String(item.id) === String(ticket.parent_ticket_id))
        if (!parent) { showBlockingError('Parent repair record not found.'); return }
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
      queueAdminSearch(); return
    }

    if (el.dataset.action === 'open-receipt-modal') {
      await openReceiptDetail(Number(el.dataset.receiptIdx));return
    }
    if(el.dataset.action==='retry-receipt-detail'){await openReceiptDetail(adminState.receiptModalIdx);return}

    if (el.dataset.action === 'receipt-prev') {
      if (adminState.receiptModalIdx > 0) {
        await openReceiptDetail(adminState.receiptModalIdx-1)
      }
      return
    }

    if (el.dataset.action === 'receipt-next') {
      await openReceiptDetail(adminState.receiptModalIdx+1)
      return
    }

    if (el.dataset.action === 'toggle-receipt') {
      const rid = Number(el.dataset.receiptId)
      adminState.receiptsExpanded = adminState.receiptsExpanded === rid ? null : rid
      render(); return
    }

    if (el.dataset.action === 'add-quick-comp') {
      const val = document.getElementById('new-comp-input')?.value?.trim(); if (!val) return
      const { error } = await viewAwait(eventCurrent,()=>(sb.from('repair_components').insert({
        name: val, sort_order: (state.data.repairComponents||[]).length + 1
      })),()=>state.modal)
      if (error) { showBlockingError('Error: '+error.message); return }
      const input = document.getElementById('new-comp-input')
      if (input) input.value = ''
      await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }
    if (el.dataset.action === 'save-quick-comps') {
      // No longer needed — adds/removes go directly to DB
      await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }
    if (el.dataset.removeQuick !== undefined) {
      const compId = Number(el.dataset.removeQuick)
      const { error } = await viewAwait(eventCurrent,()=>(sb.from('repair_components').delete().eq('id', compId)),()=>state.modal)
      if (error) { showBlockingError('Error: '+error.message); return }
      await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }

    if (el.dataset.action === 'add-qitem') {
      const val = document.getElementById('qitem-name')?.value?.trim(); if (!val) return
      const { error } = await viewAwait(eventCurrent,()=>(sb.from('quick_items').insert({
        name: val, prices: [], sort_order: (state.data.quickItems||[]).length + 1
      })),()=>state.modal)
      if (error) { showBlockingError('Error: '+error.message); return }
      await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }
    if (el.dataset.action === 'save-qitems') {
      // Save is now per-item directly to quick_items table
      // Individual add/remove handlers do the DB work — this just refreshes
      await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }
    if (el.dataset.removeQitem !== undefined) {
      const item = (state.data.quickItems||[])[Number(el.dataset.removeQitem)]
      if (!item) return
      const { error } = await viewAwait(eventCurrent,()=>(sb.from('quick_items').delete().eq('id', item.id)),()=>state.modal)
      if (error) { showBlockingError('Error: '+error.message); return }
      await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }
    if (el.dataset.addQprice !== undefined) {
      const idx  = Number(el.dataset.addQprice)
      const val  = Number(document.getElementById(`qprice-input-${idx}`)?.value)
      if (!val || val <= 0) return
      const variantName = document.getElementById(`qvariant-name-${idx}`)?.value?.trim() || ''
      const item = (state.data.quickItems||[])[idx]
      if (!item) return
      const newPrices = [...(item.prices||[]), { name: variantName, price: val }]
      const { error } = await viewAwait(eventCurrent,()=>(sb.from('quick_items').update({ prices: newPrices }).eq('id', item.id)),()=>state.modal)
      if (error) { showBlockingError('Error: '+error.message); return }
      await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }
    if (el.dataset.removeQprice !== undefined) {
      const [i,pi] = el.dataset.removeQprice.split('-').map(Number)
      const item = (state.data.quickItems||[])[i]
      if (!item) return
      const newPrices = [...(item.prices||[])]
      newPrices.splice(pi, 1)
      const { error } = await viewAwait(eventCurrent,()=>(sb.from('quick_items').update({ prices: newPrices }).eq('id', item.id)),()=>state.modal)
      if (error) { showBlockingError('Error: '+error.message); return }
      await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }

    if ((el.dataset.invEdit||el.dataset.invAdjust) && _inv) {
      const id=el.dataset.invEdit||el.dataset.invAdjust
      const selected=await viewAwait(eventCurrent,()=>sb.from('inventory').select('*').eq('id',id).single(),()=>state.modal)
      if(selected.error||!selected.data){showBlockingError('Complete selected item unavailable. Retry reads.');return}
      state.data.inventory=state.data.inventory.map(item=>String(item.id)===String(id)?selected.data:item)
      if(el.dataset.invEdit)_inv.handleInvEdit(el);else _inv.handleInvAdjust(el)
      render();return
    }
    if (el.dataset.invDelete && _inv) {
      const { deleted } = await viewAwait(eventCurrent,()=>(_inv.handleInvDelete(el)),()=>state.modal)
      if (deleted) await viewAwait(eventCurrent,()=>(load()),()=>state.modal)
      return
    }

    if (el.dataset.settleId) {
      const accountKey = el.dataset.settleId
      const amount  = Number(document.querySelector(`[data-settle-amount="${accountKey}"]`)?.value)
      const method  = document.querySelector(`[data-settle-method="${accountKey}"]`)?.value || 'Cash'
      if (!amount || amount <= 0) { showBlockingError('Enter a valid amount.'); return }
      openPinPrompt('settle', async (verified) => {
        if (!verified) return
        const rec = (state.data.udharAccounts || []).find(u => `${u.kind}:${u.sourceId}` === accountKey)
        const result = await viewAwait(eventCurrent,()=>(settleUdhar(rec, amount, method)),()=>state.modal)
        if (!result.ok) { showBlockingError('Settle error: '+result.error); return }
        await viewAwait(eventCurrent,()=>(load()),()=>state.modal); state.modal = { type:'udharList' }; render()
        showTransactionSuccess('Udhar payment recorded.')
      }, render); return
    }

    const viewTicketEl = el.closest('[data-view-ticket]')
    if (viewTicketEl && el.tagName !== 'BUTTON' && !el.closest('button')) {
      const ticketId = String(viewTicketEl.dataset.viewTicket)
      await viewAwait(eventCurrent,()=>(openTicketDetail(ticketId)),()=>state.modal)
      return
    }
  },error=>showBlockingError(error?.message||'Unable to confirm the result. Refresh reads before retrying.'))

  // Input
  app.addEventListener('input', e => {
    if(!ownsAdmin())return

    const t = e.target
    rememberAdditionalWorkInput(t, state.modal)
    if (t.dataset.filter !== undefined) {
      adminState.filter=t.value
      queueAdminSearch()
    }
    if (t.dataset.receiptSearch !== undefined) { adminState.receiptSearch = t.value; queueAdminSearch() }
    if (t.dataset.receiptFrom !== undefined) { adminState.receiptDateFrom = t.value; queueAdminSearch() }
    if (t.dataset.receiptTo   !== undefined) { adminState.receiptDateTo   = t.value; queueAdminSearch() }
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
    if(!ownsAdmin())return

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
  listenOwned(app,'change',ownsAdmin,async (e,eventCurrent)=>{
    const t = e.target
    if (t.dataset.action === 'admin-module') {
      adminState.filter = ''
      const { navigate } = await viewAwait(eventCurrent,()=>(import('../router.js')),()=>state.modal)
      navigate(`/admin/${t.value}`)
      return
    }
    if (t.dataset.receiptType !== undefined) {
      adminState.receiptType = t.value
      adminState.receiptModalIdx = null
      queueAdminSearch()
      return
    }
  },error=>showBlockingError(error?.message||'Unable to confirm the result. Refresh reads before retrying.'))

  // Submit
  listenOwned(app,'submit',ownsAdmin,async (e,eventCurrent)=>{
    if (!can(adminState.adminModule, state.role) || !modalEntitled(state.modal?.type)) { e.preventDefault(); return }
    if (!window.location.pathname.startsWith('/admin')) return
    e.preventDefault()
    const form = e.target
    const data = Object.fromEntries(new FormData(form).entries())
    const type = form.dataset.form
    dlog('ADMIN.submit', `ENTRY form.dataset.form=${type}`)

    if(type==='support-consent'){
      if(SESSION.employee?.role!=='Business Owner'||customerSupport.view.busy)return
      const nav=adminNavigationIsCurrent;customerSupport.view.busy=true;render()
      try{await viewAwait(eventCurrent,()=>(customerSupport.consents('approve',{p_case:data.ticket_id,p_purpose:data.purpose,p_confirmation:data.confirmation})),()=>state.modal)}
      catch(error){if(nav())customerSupport.view.error=error.message}
      finally{if(nav()){customerSupport.view.busy=false;render()}}return
    }
    if (type === 'customer-support') {
      if(!can('customer-support',state.role)||customerSupport.view.busy)return
      const session=SESSION,path=window.location.pathname,v=customerSupport.view
      if(!v.pending)v.draft={subject:data.subject,category:data.category,message:data.message}
      v.busy=true;v.error='';render()
      try {await viewAwait(eventCurrent,()=>(customerSupport.create()),()=>state.modal);await viewAwait(eventCurrent,()=>(customerSupport.list(0)),()=>state.modal)}catch(error){if(SESSION===session)v.error=error.message}
      finally{if(eventCurrent()&&SESSION===session){v.busy=false;if(window.location.pathname===path)render()}}
      return
    }
    if (type === 'add-quick-item') {
      const itemName = data.itemName?.trim()
      if (!itemName) { showBlockingError('Item name is required.'); return }
      const names  = [...form.querySelectorAll('[name="variantName[]"]')].map(i => i.value.trim())
      const prices = [...form.querySelectorAll('[name="variantPrice[]"]')].map(i => Number(i.value) || 0)
      const variants = names.map((name, i) => ({ name, price: prices[i] })).filter(v => v.price > 0)
      const { error } = await viewAwait(eventCurrent,()=>(sb.from('quick_items').insert({
        name: itemName, prices: variants,
        sort_order: (state.data.quickItems||[]).length + 1
      })),()=>state.modal)
      if (error) { showBlockingError('Error: ' + error.message); return }
      state.modal = null
      await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }

    if (type === 'change-password') {
      const result = await viewAwait(eventCurrent,()=>(handleChangePasswordSubmit(SESSION, data)),()=>state.modal)
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
        if (err) { showBlockingError(err); return }
      }
      const result = await viewAwait(eventCurrent,()=>(invokeAccountAdmin('update-employee', updates)),()=>state.modal)
      if (!result.ok) { showBlockingError('Error updating: '+result.error); return }
      if (data.password?.trim()) {
        const reset = await viewAwait(eventCurrent,()=>(invokeAccountAdmin('reset-password', { email: updates.email, newPassword: data.password })),()=>state.modal)
        if (!reset.ok) { showBlockingError('Employee details were saved, but password reset failed: ' + reset.error); return }
      }
      state.modal = null; await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }

    if (type === 'employee') {
      const pwErr = validatePassword(data.password||'')
      if (pwErr) { showBlockingError(pwErr); return }
      const result = await viewAwait(eventCurrent,()=>(invokeAccountAdmin('create-employee', {
        name:data.name, email:(data.email||'').toLowerCase().trim(),
        password:data.password, role:data.role||'Cashier',
      })),()=>state.modal)
      if (!result.ok) { showBlockingError('Error saving employee: '+result.error); return }
      state.modal = null; await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }

    if (type === 'settings') {
      let updates
      try { updates = await viewAwait(eventCurrent,()=>(settingsUpdates(form)),()=>state.modal) } catch (error) { showBlockingError(error.message); return }
      const result = await viewAwait(eventCurrent,()=>(invokeAccountAdmin('update-config', { updates })),()=>state.modal)
      if (!result.ok) { showBlockingError('Settings error: '+result.error); return }
      state.modal = null; await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }

    if (type === 'owner-login') {
      const email = data.owner_email?.toLowerCase().trim()
      if (!email) { showBlockingError('Enter an owner email.'); return }
      const result = await viewAwait(eventCurrent,()=>(invokeAccountAdmin('update-owner', { email })),()=>state.modal)
      if (!result.ok) { showBlockingError('Error: '+result.error); return }
      showToast('Owner email updated.', 'success'); return
    }

    if (type === 'override-pin') {
      if (!data.new_pin?.trim()) { showBlockingError('Enter a PIN.'); return }
      const result = await viewAwait(eventCurrent,()=>(invokeAccountAdmin('set-pin', { pin:data.new_pin })),()=>state.modal)
      if (!result.ok) { showBlockingError('Error: '+result.error); return }
      showToast('Override PIN updated.', 'success'); return
    }

    if ((type === 'inv-add' || type === 'inv-edit' || type === 'inv-adjust') && CFG.inventory_module_enabled && _inv) {
      const fn = type === 'inv-add' ? _inv.submitInvAdd
        : type === 'inv-edit' ? _inv.submitInvEdit : _inv.submitInvAdjust
      const { ok } = await viewAwait(eventCurrent,()=>(fn(data)),()=>state.modal)
      if (!ok) return
      state.modal = null; await viewAwait(eventCurrent,()=>(load()),()=>state.modal); return
    }

    // Unrecognized form type -- this listener is intentionally global for
    // the session (see attachEvents() comment), so it keeps receiving
    // submit events even after navigating away from /admin. A form it
    // doesn't own (e.g. pos.js's own "repair" form) bubbling through the
    // shared #app element must be a no-op here, not assumed to be ours.
    dlog('ADMIN.submit', `type=${type} not recognized by this listener -- no-op`)
  },error=>showBlockingError(error?.message||'Unable to confirm the result. Refresh reads before retrying.'))

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
  state.modal = { type: 'create-sub-invoice', additionalFields:state.modal?.additionalFields, parentId, draftComponents, draftLabour: state.modal._draftLabour || 0 }
  render()
}

/* ── Public ── */
export async function initAdmin(sess, module, query, isCurrent = () => true,verifiedConfig) {
  if (!isCurrent()) return
  adminNavigationIsCurrent = isCurrent
  dlog('ADMIN.initAdmin', `ENTRY module=${module} _eventsAttached=${_eventsAttached} caller=[${callerInfo()}]`)
  const actor=sess.authUserId||sess.user?.id||sess.employee?.auth_user_id||sess.employee?.id||sess.employee?.name
  const nextActor=JSON.stringify([actor,sess.employee?.role])
  if(paperActor!==nextActor){billingResult=null;paperObservation={};resupplyBusy=false;paperActor=nextActor}
  SESSION    = sess
  resupplyBusy=false
  state.role = sess.employee?.role || null
  const requestedModule = module || 'dashboard'
  if (!can(requestedModule, state.role)) {
    const { navigate } = await import('../router.js')
    navigate(state.role === 'Technician' ? '/workshop' : '/pos', { replace: true })
    return
  }
  if (module) adminState.adminModule = module
  const saved=readAdminView(history,location,sess)
  if(saved){Object.assign(adminState,saved.values);restoreScroll=saved.scroll}
  if (module === 'settings') adminState.settingsTab = safeAdminState({settingsTab:query?.tab}).settingsTab || saved?.values.settingsTab || 'branding'
  if (module === 'catalog') adminState.catalogTab = safeAdminState({catalogTab:query?.tab}).catalogTab || saved?.values.catalogTab || 'quickitems'
  await load(verifiedConfig)
}
