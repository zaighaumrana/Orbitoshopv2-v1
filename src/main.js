import { sb, loadConfig, applyBranding, loadCurrentSession, _clearSession, state, CFG, can } from './shared.js'
import { renderLogin } from './auth.js'
import { registerRoute, registerNotFound, startRouter, navigate } from './router.js'
import { dlog } from './debuglog.js'

function canonicalRole(session) {
  return session?.employee?.role || ''
}

async function boot() {
  await loadConfig(true)
  applyBranding()

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

  await loadConfig(false)
  applyBranding()
  await enterApplication(session)
}

function showLogin() {
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
  const role = canonicalRole(session)
  state.role = role
  registerRoute('/login', () => renderLogin(onLoginSuccess))

  registerRoute('/pos', async () => {
    if (!can('pos', role)) return routeForRole(role, true)
    const { initPOS } = await import('./pos/pos.js')
    initPOS(session)
  })

  registerRoute('/workshop', async () => {
    if (!can('workshop', role)) return routeForRole(role, true)
    const { initWorkshop } = await import('./pos/workshop.js')
    initWorkshop(session)
  })

  const adminModules = ['dashboard','repairs','inventory','reports','employees','receipts','ems','settings','catalog']
  adminModules.forEach(mod => {
    registerRoute(`/admin/${mod}`, async (_params, query) => {
      // Reject before loading the Admin bundle or issuing any module queries.
      if (!can(mod, role)) return routeForRole(role, true)
      const { initAdmin } = await import('./admin/admin.js')
      initAdmin(session, mod, query)
    })
  })

  registerRoute('/admin', async () => {
    if (!can('dashboard', role)) return routeForRole(role, true)
    navigate('/admin/dashboard', { replace: true })
  })

  registerNotFound(() => routeForRole(role, true))
}

function routeForRole(role, replace = false) {
  if (role === 'Business Owner' || role === 'Manager' || role === 'Orbito Support') {
    navigate('/admin/dashboard', { replace })
  } else if (role === 'Technician') {
    navigate('/workshop', { replace })
  } else {
    navigate('/pos', { replace })
  }
}

async function enterApplication(session) {
  const role = canonicalRole(session)
  const { checkClockIn } = await import('./features/ems/index.js')
  checkClockIn(session, CFG, () => {
    setupRoutes(session)
    routeForRole(role)
    startRouter()
  })
}

async function onLoginSuccess(session) {
  const role = canonicalRole(session)
  state.role = role
  dlog('main.onLoginSuccess', `canonical role=${role}`)
  await loadConfig(false)
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

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')

boot()
