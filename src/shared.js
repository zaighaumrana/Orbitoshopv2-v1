import { createClient } from '@supabase/supabase-js'
import { dlog, dstack } from './debuglog.js'

/* ── Supabase ── */
export const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON,
  {
    auth: {
      storage: sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
)

let _platform = null
function getPlatform() {
  if (!_platform) _platform = createClient(
    import.meta.env.VITE_PLATFORM_URL,
    import.meta.env.VITE_PLATFORM_ANON
  )
  return _platform
}

export const CLIENT_ID         = Number(import.meta.env.VITE_CLIENT_ID || 1)
export const CLIENT_EVENT_RATE = 5
export const CLIENT_INV_RATE   = 1

export async function logBillEvent() {
  try {
    await getPlatform().from('usage_logs').insert({
      client_id: CLIENT_ID, module_type: 'BILL',
      token_count: 1, rate_at_log: CLIENT_EVENT_RATE,
    })
  } catch (e) { console.warn('Billing log failed:', e.message) }
}

export async function logInventoryEvent() {
  try {
    await getPlatform().from('usage_logs').insert({
      client_id: CLIENT_ID, module_type: 'INVENTORY',
      token_count: 1, rate_at_log: CLIENT_INV_RATE,
    })
  } catch (e) { console.warn('Billing log failed:', e.message) }
}

/* ── Shared state ── */
export const state = {
  role:          null,
  theme:         localStorage.getItem('retailos-theme') || 'light',
  online:        navigator.onLine,
  filter:        '',
  modal:         null,
  installPrompt: null,
  data:          { tickets:[], sales:[], employees:[], udharAccounts:[], financial:{}, shiftFinancial:{}, returns:[], inventory:[], quickItems:[], repairComponents:[] },
}

/* ── Global editable-control focus persistence ──
   Most screens intentionally rerender #app from state on each filter input.
   Capture the active control before those delegated handlers run, then restore
   the equivalent newly-created control after the DOM replacement. */
const editableControlSelector = 'input:not([type="hidden"]), textarea, select, [contenteditable="true"]'
const focusPersistenceKey = Symbol.for('orbitoshop.focusPersistence')

function selectorValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function persistentControlSelector(control) {
  if (control.id) return `[id="${selectorValue(control.id)}"]`
  const dataAttribute = [...control.attributes].find(attribute => attribute.name.startsWith('data-'))
  if (dataAttribute) {
    return dataAttribute.value
      ? `[${dataAttribute.name}="${selectorValue(dataAttribute.value)}"]`
      : `[${dataAttribute.name}]`
  }
  if (control.name) return `${control.tagName.toLowerCase()}[name="${selectorValue(control.name)}"]`
  return null
}

function installGlobalFocusPersistence() {
  if (globalThis[focusPersistenceKey] || typeof document === 'undefined') return
  const persistence = { snapshot:null, restoreQueued:false, observer:null }
  globalThis[focusPersistenceKey] = persistence

  const capture = event => {
    const control = event.target?.closest?.(editableControlSelector)
    const app = document.getElementById('app')
    if (!control || !app?.contains(control)) {
      if (event.type === 'focusin') persistence.snapshot = null
      return
    }
    const selector = persistentControlSelector(control)
    if (!selector) return
    const peers = [...app.querySelectorAll(selector)]
    persistence.snapshot = {
      path: window.location.pathname,
      selector,
      index: Math.max(0, peers.indexOf(control)),
      start: typeof control.selectionStart === 'number' ? control.selectionStart : null,
      end: typeof control.selectionEnd === 'number' ? control.selectionEnd : null,
      direction: control.selectionDirection || 'none',
    }
  }

  const restore = () => {
    persistence.restoreQueued = false
    const snapshot = persistence.snapshot
    const app = document.getElementById('app')
    if (!snapshot || !app || snapshot.path !== window.location.pathname) return
    const active = document.activeElement
    if (active && active !== document.body && active !== document.documentElement) return
    const matches = [...app.querySelectorAll(snapshot.selector)]
    const control = matches[snapshot.index] || matches[0]
    if (!control || control.disabled) return
    control.focus({ preventScroll:true })
    if (snapshot.start !== null && typeof control.setSelectionRange === 'function') {
      try { control.setSelectionRange(snapshot.start, snapshot.end, snapshot.direction) } catch {}
    }
  }

  const observeApp = () => {
    const app = document.getElementById('app')
    if (!app || persistence.observer) return
    persistence.observer = new MutationObserver(() => {
      if (persistence.restoreQueued) return
      persistence.restoreQueued = true
      queueMicrotask(restore)
    })
    persistence.observer.observe(app, { childList:true, subtree:true })
  }

  document.addEventListener('focusin', capture, true)
  document.addEventListener('input', capture, true)
  document.addEventListener('pointerdown', event => {
    if (!event.target?.closest?.(editableControlSelector)) persistence.snapshot = null
  }, true)
  observeApp()
  if (!persistence.observer) document.addEventListener('DOMContentLoaded', observeApp, { once:true })
}

installGlobalFocusPersistence()

/* ── Session ── */
function profileToSession(profile) {
  return {
    authUserId: profile.auth_user_id,
    employee: {
      id: profile.employee_id ?? undefined,
      name: profile.display_name,
      role: profile.role,
      email: profile.email,
    },
    isAdmin: profile.role === 'Business Owner' || profile.role === 'Orbito Support',
    isSupportAdmin: profile.role === 'Orbito Support',
  }
}

export async function loadCurrentSession() {
  // Old retailos_session is deliberately ignored and removed. Supabase Auth
  // plus app_users is the only identity/authorization source.
  try { sessionStorage.removeItem('retailos_session') } catch {}
  const { data: userData, error: userError } = await sb.auth.getUser()
  if (userError || !userData.user) return null
  const { data: profile, error: profileError } = await sb
    .from('app_users')
    .select('auth_user_id, employee_id, email, display_name, role, status')
    .eq('auth_user_id', userData.user.id)
    .single()
  if (profileError || !profile || profile.status !== 'Active') {
    await sb.auth.signOut({ scope: 'local' })
    return null
  }
  state.role = profile.role
  return profileToSession(profile)
}

export function _saveSession(_SESSION, route, module) {
  try {
    sessionStorage.removeItem('retailos_session')
    sessionStorage.setItem('retailos_route',   route  || '')
    sessionStorage.setItem('retailos_module',  module || 'dashboard')
  } catch {}
}
export async function _clearSession() {
  dstack('shared._clearSession', 'clearing session storage')
  try {
    ['retailos_session','retailos_route','retailos_module']
      .forEach(k => sessionStorage.removeItem(k))
  } catch {}
  state.role = null
  await sb.auth.signOut({ scope: 'local' }).catch(() => {})
}

/* ── CFG ── */
export let CFG = {
  shop_name: 'RetailOS Shop', shop_address: '', shop_phone: '',
  shop_logo: '', shop_description: '', primary_color: '#126c5b',
  secondary_color: '#e9b949', currency: 'Rs.', tax_rate: 0,
  terms_text: 'Warranty: 30 days on parts replaced.',
  discount_pin_required: true,
  partial_udhar_allowed: true,
  repair_module_enabled: true, inventory_module_enabled: false,
  technician_module_enabled: true, live_tracking_enabled: false,
  ems_enabled: false, suspended: false,
}

export async function loadConfig(publicOnly = false) {
  const rpc = publicOnly ? 'get_public_shop_config' : 'get_app_config'
  dlog('shared.loadConfig', `ENTRY -- rpc=${rpc}`)
  const { data, error } = await sb.rpc(rpc)
  if (error) { dlog('shared.loadConfig', `FAILED: ${error.message}`); console.warn('Config load failed:', error.message); return }
  Object.assign(CFG, data)
  dlog('shared.loadConfig', `DONE -- suspended=${CFG.suspended} ems_enabled=${CFG.ems_enabled}`)
}

export async function loadQuickItems() {
  const { data, error } = await sb.from('quick_items').select('*').order('sort_order')
  if (error) { console.warn('Quick items load failed:', error.message); return [] }
  return data || []
}

export async function loadRepairComponents() {
  const { data, error } = await sb.from('repair_components').select('*').order('sort_order')
  if (error) { console.warn('Repair components load failed:', error.message); return [] }
  return data || []
}


export function applyBranding() {
  document.documentElement.dataset.theme = state.theme
  document.documentElement.style.setProperty('--primary',   CFG.primary_color   || '#126c5b')
  document.documentElement.style.setProperty('--secondary', CFG.secondary_color || '#e9b949')
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', CFG.primary_color || '#126c5b')
  if (CFG.shop_logo) {
    const fav = document.getElementById('dynamic-favicon')
    if (fav) { fav.href = CFG.shop_logo; fav.type = 'image/png' }
  }
}

export function currentTenant() {
  return {
    name:                CFG.shop_name        || 'My Shop',
    address:             CFG.shop_address     || '',
    phone:               CFG.shop_phone       || '',
    logo:                CFG.shop_logo        || '',
    primaryColor:        CFG.primary_color    || '#126c5b',
    secondaryColor:      CFG.secondary_color  || '#e9b949',
    currency:            CFG.currency         || 'Rs.',
    taxRate:             Number(CFG.tax_rate  || 0),
    receiptFooter:       CFG.terms_text       || '',
    repairModuleEnabled: CFG.repair_module_enabled !== false,
  }
}

/* ── Helpers ── */
export const money = (v, sym) =>
  `${sym || CFG.currency || 'Rs.'} ${Number(v||0).toLocaleString(undefined,{maximumFractionDigits:0})}`
export const fld = (label, name, val = '', type = 'text') =>
  `<label class="field"><span>${label}</span><input name="${name}" type="${type}"${type === 'number' ? ' step="any"' : ''} value="${String(val).replaceAll('"','&quot;')}"></label>`
export const modalActions = () =>
  `<div class="modal-actions"><button type="button" class="secondary-button" data-close>Cancel</button><button class="primary-button">Save</button></div>`
export const statusBadge = s => {
  const bad=['Suspended','Cancelled','Declined'], good=['Active','Delivered','Ready','Settled']
  return `<span class="badge ${bad.includes(s)?'bad':good.includes(s)?'good':'warn'}">${s}</span>`
}

/* ── Shared app-native dialogs and notifications ── */
let activeAppDialog = null

function ensureToastRegion() {
  let region = document.getElementById('app-toast-region')
  if (region) return region
  region = document.createElement('div')
  region.id = 'app-toast-region'
  region.className = 'app-toast-region'
  region.setAttribute('aria-label', 'Notifications')
  document.body.append(region)
  return region
}

/** Non-blocking feedback for success, information, validation and server errors. */
export function showToast(message, type = 'info', options = {}) {
  const region = ensureToastRegion()
  const toast = document.createElement('div')
  const safeType = ['success', 'info', 'warning', 'error'].includes(type) ? type : 'info'
  toast.className = `app-toast app-toast-${safeType}`
  toast.setAttribute('role', safeType === 'error' || safeType === 'warning' ? 'alert' : 'status')

  const copy = document.createElement('div')
  copy.className = 'app-toast-copy'
  if (options.title) {
    const title = document.createElement('strong')
    title.textContent = options.title
    copy.append(title)
  }
  const text = document.createElement('span')
  text.textContent = String(message || '')
  copy.append(text)

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'app-toast-close'
  close.setAttribute('aria-label', 'Dismiss notification')
  close.textContent = '×'
  const remove = () => toast.remove()
  close.addEventListener('click', remove, { once: true })
  toast.append(copy, close)
  region.append(toast)

  const duration = Number(options.duration ?? (safeType === 'error' ? 8000 : 5000))
  if (duration > 0) setTimeout(remove, duration)
  return { close: remove }
}

function closeAppDialog(dialog, value) {
  if (!dialog || activeAppDialog !== dialog || dialog.busy) return
  dialog.keyHandler && document.removeEventListener('keydown', dialog.keyHandler, true)
  dialog.backdrop.remove()
  activeAppDialog = null
  dialog.resolve(value)
}

function openAppDialog({
  title,
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  allowEnter = false,
  fields = [],
  validate,
  action,
}) {
  if (activeAppDialog?.busy) return Promise.resolve(null)
  if (activeAppDialog) closeAppDialog(activeAppDialog, null)

  return new Promise(resolve => {
    const backdrop = document.createElement('div')
    backdrop.className = 'modal-backdrop app-dialog-backdrop'
    backdrop.dataset.noBackdropClose = ''

    const form = document.createElement('form')
    form.className = 'modal modal-sm app-dialog'
    form.setAttribute('role', 'dialog')
    form.setAttribute('aria-modal', 'true')
    form.setAttribute('aria-labelledby', 'app-dialog-title')

    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'modal-close-button'
    close.setAttribute('aria-label', 'Close dialog')
    close.title = 'Close'
    close.textContent = '×'

    const heading = document.createElement('h2')
    heading.id = 'app-dialog-title'
    heading.textContent = title
    form.append(close, heading)

    if (message) {
      const detail = document.createElement('p')
      detail.className = 'app-dialog-message'
      detail.textContent = message
      form.append(detail)
    }

    const controls = []
    if (fields.length) {
      const fieldGrid = document.createElement('div')
      fieldGrid.className = 'form-grid app-dialog-fields'
      fields.forEach(field => {
        const label = document.createElement('label')
        label.className = 'field'
        const caption = document.createElement('span')
        caption.textContent = field.label
        let control
        if (field.type === 'select') {
          control = document.createElement('select')
          ;(field.options || []).forEach(optionValue => {
            const option = document.createElement('option')
            option.value = String(optionValue)
            option.textContent = String(optionValue)
            option.selected = String(optionValue) === String(field.value ?? '')
            control.append(option)
          })
        } else if (field.type === 'textarea') {
          control = document.createElement('textarea')
          control.value = field.value ?? ''
        } else {
          control = document.createElement('input')
          control.type = field.type || 'text'
          control.value = field.value ?? ''
        }
        control.name = field.name
        control.required = field.required === true
        if (field.placeholder) control.placeholder = field.placeholder
        label.append(caption, control)
        fieldGrid.append(label)
        controls.push(control)
      })
      form.append(fieldGrid)
    }

    const error = document.createElement('div')
    error.className = 'app-dialog-error hidden'
    error.setAttribute('role', 'alert')
    form.append(error)

    const actions = document.createElement('div')
    actions.className = 'modal-actions'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'secondary-button'
    cancel.textContent = cancelLabel
    const confirm = document.createElement('button')
    confirm.type = 'submit'
    confirm.className = 'primary-button'
    if (tone === 'danger') confirm.classList.add('danger-button')
    confirm.textContent = confirmLabel
    actions.append(cancel, confirm)
    form.append(actions)
    backdrop.append(form)
    document.body.append(backdrop)

    const dialog = { backdrop, resolve, busy: false, keyHandler: null }
    activeAppDialog = dialog
    const cancelDialog = () => closeAppDialog(dialog, null)
    close.addEventListener('click', cancelDialog)
    cancel.addEventListener('click', cancelDialog)
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) event.preventDefault()
    })

    dialog.keyHandler = event => {
      if (activeAppDialog !== dialog) return
      if (event.key === 'Tab') {
        const focusable = [...form.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && (document.activeElement === first || !form.contains(document.activeElement))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if (event.key === 'Enter' && !allowEnter && event.target?.tagName !== 'BUTTON') {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    document.addEventListener('keydown', dialog.keyHandler, true)

    form.addEventListener('submit', async event => {
      event.preventDefault()
      if (dialog.busy) return
      const values = Object.fromEntries(new FormData(form).entries())
      const validationError = validate?.(values)
      if (validationError) {
        error.textContent = validationError
        error.classList.remove('hidden')
        controls[0]?.focus()
        return
      }

      dialog.busy = true
      error.classList.add('hidden')
      ;[close, cancel, confirm, ...controls].forEach(control => { control.disabled = true })
      const originalLabel = confirm.textContent
      confirm.textContent = 'Working…'
      form.setAttribute('aria-busy', 'true')
      try {
        const result = action ? await action(values) : values
        if (result === false) {
          dialog.busy = false
          ;[close, cancel, confirm, ...controls].forEach(control => { control.disabled = false })
          confirm.textContent = originalLabel
          form.setAttribute('aria-busy', 'false')
          controls[0]?.focus()
          return
        }
        dialog.busy = false
        closeAppDialog(dialog, { confirmed: true, value: result })
      } catch (caught) {
        dialog.busy = false
        ;[close, cancel, confirm, ...controls].forEach(control => { control.disabled = false })
        confirm.textContent = originalLabel
        form.setAttribute('aria-busy', 'false')
        showToast(caught?.message || 'The action could not be completed.', 'error')
      }
    })

    queueMicrotask(() => (controls[0] || cancel).focus())
  })
}

/** Confirmation that owns the async action, preventing duplicate submissions. */
export function confirmAction(options) {
  return openAppDialog(options)
}

/** App-native input dialog for workflows that require user-supplied values. */
export function requestInput(options) {
  return openAppDialog({ ...options, allowEnter: options.allowEnter ?? true })
}

/** Invoke the install event without confusing it with a browser input dialog. */
export async function runInstallPrompt() {
  const installEvent = state.installPrompt
  state.installPrompt = null
  if (installEvent) await installEvent['prompt']()
}

/* ── Access control ── */
export const ACCESS = {
  'Business Owner': ['dashboard','repairs','inventory','reports','receipts','employees','ems','settings','catalog','pos','workshop'],
  'Orbito Support': ['dashboard','repairs','inventory','reports','receipts','employees','ems','settings','catalog','pos','workshop'],
  'Manager':        ['dashboard','repairs','inventory','reports','receipts','employees','ems','catalog'],
  'Cashier':        ['pos'],
  'Technician':     ['workshop'],
}
export function can(mod, role) {
  if (mod === 'repairs'   && !CFG.repair_module_enabled)    { dlog('shared.can', `DENY mod=${mod} role=${role} -- repair_module_enabled=false`); return false }
  if (mod === 'inventory' && !CFG.inventory_module_enabled) { dlog('shared.can', `DENY mod=${mod} role=${role} -- inventory_module_enabled=false`); return false }
  if (mod === 'workshop'  && !CFG.technician_module_enabled) { dlog('shared.can', `DENY mod=${mod} role=${role} -- technician_module_enabled=false`); return false }
  const allowed = ACCESS[role]?.includes(mod) ?? false
  dlog('shared.can', `mod=${mod} role=${role} -> ${allowed}`)
  return allowed
}

/* ── Auth ── */
export async function loginViaEdgeFunction(
  email,
  password,
  turnstileToken,
  mode = 'shop'
) {
  dlog('shared.loginViaEdgeFunction', `ENTRY email=${email}`)
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/login`
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON}`,
      },
      body: JSON.stringify({
        email,
        password,
        turnstileToken,
        mode,
      }),
    })
  } catch (e) {
    dlog('shared.loginViaEdgeFunction', `NETWORK ERROR: ${e.message}`)
    return { ok: false, error: 'Could not reach the login service. Check your connection.' }
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    dlog('shared.loginViaEdgeFunction', `FAILED status=${res.status} error=${data.error}`)
    return { ok: false, error: data.error || 'Incorrect email or password.' }
  }
  dlog('shared.loginViaEdgeFunction', `OK isAdmin=${data.isAdmin} role=${data.employee?.role}`)
  return data
}

export async function establishLoginSession(edgeResult) {
  const accessToken = edgeResult?.session?.access_token
  const refreshToken = edgeResult?.session?.refresh_token
  if (!accessToken || !refreshToken) return { ok: false, error: 'Login session was not returned.' }
  const { error } = await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  if (error) return { ok: false, error: 'Login session could not be established.' }
  const session = await loadCurrentSession()
  if (!session) return { ok: false, error: 'Login profile could not be verified.' }
  return { ok: true, session }
}

export function _datePart() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth()+1).padStart(2,'0')
  const dd   = String(d.getDate()).padStart(2,'0')
  return `${yyyy}${mm}${dd}`
}

/** Real, sequential, admin-configurable invoice number. Used for both plain
 *  POS sale receipts and repair ticket invoices — one shared sequence. */
export async function generateInvoiceNumber() {
  const { data: seq, error } = await sb.rpc('next_invoice_seq')
  if (error) { dlog('shared.generateInvoiceNumber', `RPC FAILED, falling back to Date.now(): ${error.message}`); console.warn('next_invoice_seq failed, falling back:', error.message) }
  const n = error ? Date.now() % 10000 : seq
  const result = `${CFG.invoice_prefix||'INV'}${_datePart()}${String(n).padStart(4,'0')}`
  dlog('shared.generateInvoiceNumber', `-> ${result}`)
  return result
}

/** Search box helper — staff only ever type the numeric part; the prefix
 *  configured in Settings is stripped automatically before matching. */
export function matchesInvoiceSearch(fullNumber, query, prefix) {
  const q = (query||'').trim().toUpperCase()
  if (!q) return true
  const full = (fullNumber||'').toUpperCase()
  if (full === q) return true
  if (/^\d+$/.test(q)) {
    const p = (prefix||'').toUpperCase()
    const digitsOnly = full.startsWith(p) ? full.slice(p.length) : full.replace(/^[A-Z]+/, '')
    if (digitsOnly === q) return true
    if (q.length >= 6 && digitsOnly.endsWith(q)) return true
    return false
  }
  return full.includes(q)
}

export function validatePassword(p) {
  if (!p || p.length < 8)      return 'At least 8 characters required.'
  if (!/[A-Za-z]/.test(p))     return 'Must contain at least one letter.'
  if (!/[0-9]/.test(p))        return 'Must contain at least one number.'
  if (!/[^A-Za-z0-9]/.test(p)) return 'Must contain at least one special character.'
  return null
}

export function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
  let pass = ''
  for (let i = 0; i < 10; i++) pass += chars[Math.floor(Math.random() * chars.length)]
  return pass
}

/** Logged-in user changes their own password (owner or employee). */
export async function changeOwnPassword(session, oldPassword, newPassword) {
  if (session?.isSupportAdmin) {
    return { ok: false, error: 'Support sessions are issued through platform authentication.' }
  }
  const err = validatePassword(newPassword)
  if (err) return { ok: false, error: err }
  const email = session.employee?.email
  if (!email) return { ok: false, error: 'Could not identify your account.' }
  const { error: verifyError } = await sb.auth.signInWithPassword({ email, password: oldPassword })
  if (verifyError) return { ok: false, error: 'Current password is incorrect.' }
  const { error } = await sb.auth.updateUser({ password: newPassword })
  if (error) return { ok: false, error: 'Password could not be updated.' }
  return { ok: true }
}

/** No email service is configured, so "forgot password" logs a request an admin resolves manually. */
export async function requestPasswordReset(email, turnstileToken) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/password-reset-request`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON,
      },
      body: JSON.stringify({ email, turnstileToken }),
    })
    if (!res.ok) return { ok: false, error: 'Reset request could not be submitted.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Reset request could not be submitted.' }
  }
}

export async function listPendingResetRequests() {
  const { data, error } = await sb.from('password_reset_requests')
    .select('*').eq('status', 'Pending').order('requested_at', { ascending: false })
  if (error) { console.warn('Reset requests load failed:', error.message); return [] }
  return data || []
}

export async function resolvePasswordReset(requestId, email, newPassword, resolvedBy) {
  return invokeAccountAdmin('reset-password-request', {
    requestId, email, newPassword, resolvedBy,
  })
}

export async function invokeAccountAdmin(action, payload = {}) {
  const { data, error } = await sb.functions.invoke('account-admin', {
    body: { action, ...payload },
  })
  if (error || !data?.ok) return { ok: false, error: data?.error || error?.message || 'Request failed.' }
  return data
}

export async function verifyStepUpPin(pin, purpose) {
  const submittedPin = String(pin)
  try {
    const { data, error } = await sb.functions.invoke('verify-pin', {
      body: { pin: submittedPin, purpose },
    })
    if (!error && data?.ok === true) return { ok: true, kind: 'success' }

    // For a non-2xx Edge Function response, supabase-js exposes the response
    // body on error.context rather than data. Only the function's deliberate
    // verification rejection means the PIN was incorrect; transport, auth and
    // server failures must not be presented as a bad PIN.
    let responseData = data
    if (!responseData && error?.context?.json) {
      try { responseData = await error.context.json() } catch {}
    }
    if (responseData?.error === 'Verification failed.') {
      return { ok: false, kind: 'incorrect', error: 'Incorrect PIN' }
    }
    return {
      ok: false,
      kind: 'server',
      error: responseData?.error || error?.message || 'PIN verification is unavailable.',
    }
  } catch (error) {
    return { ok: false, kind: 'server', error: error?.message || 'PIN verification is unavailable.' }
  }
}

export async function verifyCurrentStepUpPin(pin) {
  return verifyStepUpPin(pin, ppPurpose)
}

/** Shared "My Account" modal — used by pos.js, workshop.js and admin.js. */
export function myAccountModalHTML(session) {
  const isOwnerLike = session.isAdmin || session.employee?.role === 'Business Owner'
  const isSupport = session.isSupportAdmin === true
  return `<div class="modal-backdrop"><div class="modal" style="max-width:420px">
    <h2>My Account</h2>
    ${state.installPrompt ? `
      <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
        <button type="button" class="secondary-button" data-action="install" style="width:100%">⬇ Install App</button>
      </div>
    ` : ''}
    ${CFG.ems_enabled && !isOwnerLike ? `
      <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
        <p class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Employee Self-Service</p>
        <button type="button" class="secondary-button" data-action="open-leave-request" style="width:100%">📋 Request Leave</button>
      </div>
    ` : ''}
    ${isSupport ? `
      <p class="muted" style="font-size:13px">
        This support session was issued through Orbito platform authentication.
        The client-project support identity has no reusable password.
      </p>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Close</button>
      </div>
    ` : `<form data-form="change-password">
      <p class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Change Password</p>
      <div class="form-grid">
        <label class="field"><span>Current Password</span><input name="oldPassword" type="password" required autocomplete="current-password"></label>
        <label class="field"><span>New Password</span><input name="newPassword" type="password" required autocomplete="new-password"></label>
        <label class="field"><span>Confirm New Password</span><input name="confirmPassword" type="password" required autocomplete="new-password"></label>
      </div>
      <div id="change-password-error" class="hidden" style="color:var(--danger);font-size:13px;margin:8px 0"></div>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Close</button>
        <button class="primary-button">Update Password</button>
      </div>
    </form>`}
  </div></div>`
}

/** Shared handler for the change-password form. Returns {ok,error}. */
export async function handleChangePasswordSubmit(session, data) {
  if (data.newPassword !== data.confirmPassword) {
    return { ok: false, error: 'New passwords do not match.' }
  }
  return changeOwnPassword(session, data.oldPassword, data.newPassword)
}

/* ── PIN prompt shared state ── */
export let ppBuffer   = ''
export let ppPurpose  = ''
export let ppCallback = null
let ppRenderFn = null
let ppVerifyFn = verifyCurrentStepUpPin
let ppError = ''
let ppSubmitting = false
let ppAttempt = 0

function focusPinPrompt() {
  queueMicrotask(() => document.getElementById('pp-input')?.focus())
}

function syncPinPromptDOM() {
  const input = document.getElementById('pp-input')
  const display = document.getElementById('pp-display')
  const error = document.getElementById('pp-error')
  const confirm = document.querySelector('[data-pp-key="✓"]')
  if (input) {
    input.value = ppBuffer
    input.setAttribute('aria-invalid', ppError ? 'true' : 'false')
  }
  if (display) display.textContent = '●'.repeat(ppBuffer.length).padEnd(4, '·')
  if (error) {
    error.textContent = ppError
    error.classList.toggle('hidden', !ppError)
  }
  if (confirm) confirm.disabled = ppSubmitting || ppBuffer.length !== 4
  document.querySelector('.pin-prompt')?.setAttribute('aria-busy', String(ppSubmitting))
}

/**
 * Open a PIN prompt for a sensitive/destructive action.
 *
 * Standard pattern for all protected actions:
 *
 *   openPinPrompt('admin', async (verified) => {
 *     if (!verified) return          // ← always guard first
 *     await doDestructiveThing()
 *   }, render)
 *
 * The callback receives `true` only when PIN verification succeeds.
 * It is never called on failure — but the guard makes intent explicit
 * and prevents future bugs if the flow changes.
 *
 * Use this pattern for: delete, deactivate, refund, discount, settle.
 */
export function openPinPrompt(purpose, callback, renderFn, verifyFn = verifyCurrentStepUpPin) {
  ppAttempt++
  ppBuffer   = ''
  ppPurpose  = purpose
  ppCallback = callback
  ppRenderFn = renderFn
  ppVerifyFn = verifyFn
  ppError = ''
  ppSubmitting = false
  state.modal = { type: 'pinPrompt', purpose }
  renderFn()
  focusPinPrompt()
}

export function cancelPinPrompt(renderFn = ppRenderFn) {
  ppAttempt++
  ppBuffer = ''
  ppPurpose = ''
  ppCallback = null
  ppRenderFn = null
  ppVerifyFn = verifyCurrentStepUpPin
  ppError = ''
  ppSubmitting = false
  if (state.modal?.type === 'pinPrompt') state.modal = null
  renderFn?.()
}

export function pinPromptHTML(purpose) {
  const label = {
    admin:    'Admin password required',
    settle:   'Admin PIN to settle credit',
    return:   'Admin PIN to process return',
    discount: 'PIN required to apply discount',
    udhar:    'PIN required for credit sale',
    'repair-refund': 'PIN required to cancel and refund repair',
    'remove-component': 'Owner/Admin PIN required',
  }[purpose] || 'Verify identity'
  return `
    <div class="modal pin-prompt" role="dialog" aria-modal="true" aria-labelledby="pp-title" style="max-width:340px">
      <h2 id="pp-title">${label}</h2>
      <input id="pp-input" class="pin-capture-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="Four digit PIN" aria-describedby="pp-error">
      <div id="pp-display" aria-hidden="true" style="text-align:center;font-size:30px;letter-spacing:16px;min-height:48px;border-bottom:2px solid var(--border);padding-bottom:8px;margin:10px 0">${'●'.repeat(ppBuffer.length).padEnd(4, '·')}</div>
      <div id="pp-error" class="${ppError ? '' : 'hidden'}" role="alert" style="color:var(--danger);text-align:center;font-size:13px;margin-bottom:8px">${ppError}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        ${[1,2,3,4,5,6,7,8,9,'⌫',0,'✓'].map(k =>
          `<button type="button" class="secondary-button" style="font-size:20px;min-height:50px" data-pp-key="${k}"${k === '✓' && (ppSubmitting || ppBuffer.length !== 4) ? ' disabled' : ''}>${k}</button>`
        ).join('')}
      </div>
      <div class="modal-actions" style="margin-top:10px">
        <button type="button" class="secondary-button" data-close>Cancel</button>
      </div>
    </div>`
}

export async function handlePpKey(key) {
  if (state.modal?.type !== 'pinPrompt' || !document.getElementById('pp-display') || ppSubmitting) return
  if (key === '⌫' || key === 'Delete') {
    ppBuffer = ppBuffer.slice(0, -1)
  } else if (key === '✓') {
    if (ppBuffer.length === 4) await submitPinPrompt()
    return
  } else if (/^[0-9]$/.test(String(key)) && ppBuffer.length < 4) {
    ppBuffer += String(key)
  } else {
    return
  }
  ppError = ''
  syncPinPromptDOM()
}

async function submitPinPrompt() {
  if (ppSubmitting || ppBuffer.length !== 4 || state.modal?.type !== 'pinPrompt') return
  const attempt = ++ppAttempt
  ppSubmitting = true
  ppError = ''
  const pin = String(ppBuffer)
  syncPinPromptDOM()
  const res = await ppVerifyFn(pin)

  // The modal may have been explicitly closed or replaced while the request
  // was in flight. Such a response is stale and cannot authorize an action.
  if (attempt !== ppAttempt || state.modal?.type !== 'pinPrompt') return
  if (res.ok) {
    const callback = ppCallback
    const renderFn = ppRenderFn
    ppError = ''
    ppBuffer = ''
    ppPurpose = ''
    ppCallback = null
    ppRenderFn = null
    ppVerifyFn = verifyCurrentStepUpPin
    state.modal = null
    renderFn?.()
    ppSubmitting = false
    if (callback) await callback(true)
  } else {
    ppSubmitting = false
    ppBuffer = ''
    ppError = res.kind === 'incorrect'
      ? 'Incorrect PIN'
      : 'PIN verification failed. Please check your connection and try again.'
    syncPinPromptDOM()
    focusPinPrompt()
  }
}

function handlePinPromptKeyboard(event) {
  if (state.modal?.type !== 'pinPrompt' || !document.getElementById('pp-display')) return
  const key = event.key === 'Enter' || event.key === 'Return'
    ? '✓'
    : event.key === 'Backspace' || event.key === 'Delete'
      ? '⌫'
      : event.key
  if (key !== '✓' && key !== '⌫' && !/^[0-9]$/.test(key)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  handlePpKey(key)
}

// Keep exactly one listener even when Vite hot-reloads this shared module.
const pinKeydownHandlerKey = Symbol.for('orbitoshop.pinKeydownHandler')
const previousPinKeydownHandler = globalThis[pinKeydownHandlerKey]
if (previousPinKeydownHandler) document.removeEventListener('keydown', previousPinKeydownHandler)
globalThis[pinKeydownHandlerKey] = handlePinPromptKeyboard
document.addEventListener('keydown', handlePinPromptKeyboard)

/** Add the global explicit close control after each module render. */
export function normalizeModalControls(root = document) {
  root.querySelectorAll('.modal-backdrop > .modal').forEach(modal => {
    modal.setAttribute('role', modal.getAttribute('role') || 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.querySelectorAll('button[data-close]').forEach(button => { button.type = 'button' })
    const existingClose = [...modal.querySelectorAll('button[data-close]')]
      .find(button => button.dataset.modalClose !== undefined || button.textContent.trim() === '×')
    if (existingClose) {
      existingClose.dataset.modalClose = ''
      existingClose.setAttribute('aria-label', existingClose.getAttribute('aria-label') || 'Close dialog')
      return
    }
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'modal-close-button'
    close.dataset.close = ''
    close.dataset.modalClose = ''
    close.setAttribute('aria-label', 'Close dialog')
    close.title = 'Close'
    close.textContent = '×'
    modal.prepend(close)
  })
}
