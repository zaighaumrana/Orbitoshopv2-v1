import { sb, loadConfig, applyBranding, loadCurrentSession, _clearSession, resetClientEntitlements, state, CFG, can } from './shared.js'
import { renderLogin } from './auth.js'
import { registerRoute, registerNotFound, startRouter, navigate, clearRoutes } from './router.js'
import { dlog } from './debuglog.js'
import { needsOnboarding } from './onboarding-state.js'
import { ensureOwnerAcceptance } from './legal/acceptance.js'

let applicationGeneration = 0

function canonicalRole(session) {
  return session?.employee?.role || ''
}

async function boot() {
  await loadConfig(true)
  applyBranding()

  if (location.pathname === '/invite/accept') {
    const { acceptInvite } = await import('./onboarding.js')
    await acceptInvite(async () => {
      const session = await loadCurrentSession()
      if (!session) throw new Error('Owner profile is still provisioning. Retry shortly.')
      await onLoginSuccess(session)
    })
    return
  }

  const session = await loadCurrentSession()
  if (!session) {
    showLogin()
    return
  }

  const role = canonicalRole(session)
  if (CFG.suspended && role !== 'Orbito Support') {
    await _clearSession()
    showLogin()
    return
  }

  await onLoginSuccess(session)
}

function showLogin() {
  applicationGeneration++
  clearRoutes()
  state.role = null
  resetClientEntitlements()
  const render = () => renderLogin(onLoginSuccess)
  registerRoute('/login', render)
  registerNotFound(() => navigate('/login', { replace: true }))

  if (window.location.pathname !== '/login') {
    navigate('/login', { replace: true })
  } else if (!document.getElementById('login-title')) {
    navigate('/login', { replace: true })
  }
  startRouter()
}

function setupRoutes(session) {
  clearRoutes()
  const generation = applicationGeneration
  const role = canonicalRole(session)
  state.role = role
  registerRoute('/login', () => renderLogin(onLoginSuccess))

  registerRoute('/pos', async () => {
    if (state.role !== role) return showLogin()
    if (!can('pos', role)) return routeForRole(role, true)
    state.modal = null
    document.getElementById('app').textContent = 'Loading…'
    const { initPOS } = await import('./pos/pos.js')
    if (generation !== applicationGeneration || state.role !== role || window.location.pathname !== '/pos') return
    initPOS(session)
  })

  registerRoute('/workshop', async () => {
    if (state.role !== role) return showLogin()
    if (!can('workshop', role)) return routeForRole(role, true)
    state.modal = null
    document.getElementById('app').textContent = 'Loading…'
    const { initWorkshop } = await import('./pos/workshop.js')
    if (generation !== applicationGeneration || state.role !== role || window.location.pathname !== '/workshop') return
    initWorkshop(session)
  })

  const adminModules = ['dashboard','repairs','inventory','reports','employees','receipts','ems','settings','catalog','billing-usage']
  adminModules.forEach(mod => {
    registerRoute(`/admin/${mod}`, async (_params, query) => {
      if (state.role !== role) return showLogin()
      // Reject before loading the Admin bundle or issuing any module queries.
      if (!can(mod, role)) return routeForRole(role, true)
      state.modal = null
      document.getElementById('app').textContent = 'Loading…'
      const { initAdmin } = await import('./admin/admin.js')
      if (generation !== applicationGeneration || state.role !== role || window.location.pathname !== `/admin/${mod}`) return
      initAdmin(session, mod, query)
    })
  })

  registerRoute('/admin', async () => {
    if (state.role !== role) return showLogin()
    if (!can('dashboard', role)) return routeForRole(role, true)
    navigate('/admin/dashboard', { replace: true })
  })

  registerNotFound(() => routeForRole(role, true))
}

function routeForRole(role, replace = false) {
  if (state.role !== role) return showLogin()
  if (role === 'Technician' && !can('workshop', role)) {
    state.modal = null
    document.getElementById('app').textContent = 'Workshop is unavailable for this client. Contact your administrator.'
    return
  }
  if (role === 'Business Owner' || role === 'Manager' || role === 'Orbito Support') {
    navigate('/admin/dashboard', { replace })
  } else if (role === 'Technician') {
    navigate('/workshop', { replace })
  } else {
    navigate('/pos', { replace })
  }
}

async function enterApplication(session) {
  const generation = ++applicationGeneration
  const role = canonicalRole(session)
  state.role = role
  if (needsOnboarding(session, CFG)) {
    const { renderOnboarding } = await import('./onboarding.js')
    if (generation !== applicationGeneration || state.role !== role) return
    clearRoutes()
    const wizard = () => renderOnboarding(session, () => enterApplication(session))
    registerRoute('/onboarding', wizard)
    registerNotFound(() => navigate('/onboarding', { replace:true }))
    navigate('/onboarding', { replace:true }); startRouter(); return
  }
  const proceed = () => {
    if (generation !== applicationGeneration || state.role !== role) return
    setupRoutes(session)
    routeForRole(role)
    startRouter()
  }
  const afterLegal = async () => {
    if (generation !== applicationGeneration || state.role !== role) return
    if (!CFG.ems_enabled) { proceed(); return }
    const { checkClockIn } = await import('./features/ems/index.js')
    if (generation !== applicationGeneration || state.role !== role) return
    checkClockIn(session, CFG, proceed)
  }
  // Onboarding remains first. No previously registered route bypasses this gate.
  clearRoutes()
  await ensureOwnerAcceptance(sb, session, afterLegal,
    async () => { await _clearSession(); showLogin() },
    () => generation === applicationGeneration && state.role === role)
}

async function onLoginSuccess(session) {
  const role = canonicalRole(session)
  state.role = role
  dlog('main.onLoginSuccess', `canonical role=${role}`)
  if (!await loadConfig(false)) {
    applicationGeneration++
    clearRoutes()
    state.role = null
    const blocked = () => {
      document.getElementById('app').innerHTML = '<main class="card" style="max-width:480px;margin:8vh auto;padding:28px"><h1>Shop setup unavailable</h1><p>Your account is signed in, but Shop access and setup could not be checked. Reconnect and retry.</p><button id="setup-retry" class="primary-button">Retry</button><button id="setup-signout" class="secondary-button">Sign out</button></main>'
      document.getElementById('setup-retry').onclick = () => location.reload()
      document.getElementById('setup-signout').onclick = () => void _clearSession()
    }
    registerNotFound(blocked)
    blocked()
    startRouter()
    return
  }
  if (CFG.suspended && role !== 'Orbito Support') {
    await _clearSession()
    showLogin()
    return
  }
  applyBranding()
  await enterApplication(session)
}

sb.auth.onAuthStateChange((event) => {
  if (event !== 'SIGNED_OUT') return
  state.role = null
  try {
    sessionStorage.removeItem('retailos_session')
    sessionStorage.removeItem('retailos_route')
    sessionStorage.removeItem('retailos_module')
  } catch {}
  showLogin()
})

window.addEventListener('online',  () => { state.online = true })
window.addEventListener('offline', () => { state.online = false })
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); state.installPrompt = e
})

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    console.warn('Service worker registration unavailable; continuing online-only.')
  })
}

boot()
