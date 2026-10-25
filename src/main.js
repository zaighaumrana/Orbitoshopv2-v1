import { sb, loadConfig, applyBranding, loadCurrentSession, _clearSession, resetClientEntitlements, state, CFG, can } from './shared.js'
import { renderLogin } from './auth.js'
import { registerRoute, registerNotFound, startRouter, navigate, clearRoutes } from './router.js'
import { dlog } from './debuglog.js'
import { needsOnboarding } from './onboarding-state.js'
import { ensureOwnerAcceptance } from './legal/acceptance.js'
import { takeSupportHandoff, startSupportHandoff } from './support-handoff.js'
import {RECOVERY_KEY} from './platform/support-recovery.js'
import {invalidateUIAuthority} from './ui-authority.js'

let supportHandoff=takeSupportHandoff(location,history)

let applicationGeneration = 0
let observedAuthIdentity = null
const authIdentity = session => {
  try { return session.user.id+':'+JSON.parse(atob(session.access_token.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).session_id } catch { return null }
}
const clearPrivateRecovery = () => {try{sessionStorage.removeItem(RECOVERY_KEY);history.replaceState({...history.state,shop_view:null},'',location.pathname+location.search)}catch{}}

function canonicalRole(session) {
  return session?.employee?.role || ''
}

async function boot() {
  const generation = applicationGeneration
  if(supportHandoff!==null){const token=supportHandoff;supportHandoff=null;await startSupportHandoff(token,onLoginSuccess);return}
  await loadConfig(true)
  if(generation!==applicationGeneration)return
  applyBranding()

  if (location.pathname === '/invite/accept') {
    const { acceptInvite } = await import('./onboarding.js')
    if(generation!==applicationGeneration)return
    await acceptInvite(async () => {
      const session = await loadCurrentSession()
      if (!session) throw new Error('Owner profile is still provisioning. Retry shortly.')
      await onLoginSuccess(session)
    })
    return
  }

  const session = await loadCurrentSession()
  if(generation!==applicationGeneration)return
  if (!session) {
    clearPrivateRecovery()
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

  registerRoute('/pos', async (_params, _query, navigation) => {
    if (state.role !== role) return showLogin()
    if (!can('pos', role)) return routeForRole(role, true)
    state.modal = null
    document.getElementById('app').textContent = 'Loading…'
    const { initPOS } = await import('./pos/pos.js')
    if (!navigation.isCurrent() || generation !== applicationGeneration || state.role !== role || window.location.pathname !== '/pos') return
    await initPOS(session,navigation.isCurrent)
  })

  registerRoute('/workshop', async (_params, _query, navigation) => {
    if (state.role !== role) return showLogin()
    if (!can('workshop', role)) return routeForRole(role, true)
    state.modal = null
    document.getElementById('app').textContent = 'Loading…'
    const { initWorkshop } = await import('./pos/workshop.js')
    if (!navigation.isCurrent() || generation !== applicationGeneration || state.role !== role || window.location.pathname !== '/workshop') return
    await initWorkshop(session,navigation.isCurrent)
  })

  const adminModules = ['dashboard','repairs','inventory','reports','employees','receipts','ems','settings','catalog','billing-usage','customer-support']

  adminModules.forEach(mod => {
    registerRoute(`/admin/${mod}`, async (_params, query, navigation) => {
      if (state.role !== role) return showLogin()
      // Reject before loading the Admin bundle or issuing any module queries.
      if (!can(mod, role)) return routeForRole(role, true)
      state.modal = null
      document.getElementById('app').textContent = 'Loading…'
      const { initAdmin } = await import('./admin/admin.js')
      if (!navigation.isCurrent() || generation !== applicationGeneration || state.role !== role || window.location.pathname !== `/admin/${mod}`) return
      await initAdmin(session, mod, query, navigation.isCurrent)
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
    // Only resolve the live URL after all gates passed. Registered routes still
    // enforce current role and module access before importing operational code.
    if (['/', '/login', '/onboarding'].includes(window.location.pathname)) routeForRole(role, true)
    else navigate(window.location.pathname + window.location.search, { replace: true })
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
  const generation = ++applicationGeneration
  const role = canonicalRole(session)
  state.role = role
  dlog('main.onLoginSuccess', `canonical role=${role}`)
  const configReady = await loadConfig(false)
  if (generation !== applicationGeneration || state.role !== role) return
  if (!configReady) {
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

sb.auth.onAuthStateChange((event, authSession) => {
  const identity=authIdentity(authSession)
  const changed=identity!==observedAuthIdentity
  observedAuthIdentity=identity
  if((event==='SIGNED_IN'&&changed)||event==='USER_UPDATED'){
    invalidateUIAuthority()
    clearPrivateRecovery()
    showLogin()
    const generation=applicationGeneration
    // Supabase auth callbacks must not await another Auth operation.
    setTimeout(async()=>{
      try{const verified=await loadCurrentSession();if(generation===applicationGeneration&&verified)await onLoginSuccess(verified)}catch{if(generation===applicationGeneration)showLogin()}
    },0)
    return
  }
  if (event !== 'SIGNED_OUT') return
  invalidateUIAuthority()
  clearPrivateRecovery()
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
