import {
  state, CFG, _saveSession, _clearSession,
  loginViaEdgeFunction, establishLoginSession, applyBranding, currentTenant
} from './shared.js'
import { dlog, dstack } from './debuglog.js'

let _onLoginSuccess = null
let _turnstileWidgetId = null
let _turnstileContainer = null
let _turnstileMountTimer = null
let _turnstileGeneration = 0
let _loginMode = 'shop'

function setLoginMode(mode) {
  _loginMode =
    mode === 'support'
      ? 'support'
      : 'shop'

  const title =
    document.getElementById('login-title')

  const subtitle =
    document.getElementById('login-subtitle')

  const badge =
    document.getElementById('support-mode-badge')

  const supportBtn =
    document.getElementById('support-access-btn')

  const forgotBtn =
    document.getElementById('forgot-btn')

  const loginBtn =
    document.getElementById('login-btn')

  const emailEl =
    document.getElementById('login-email')

  const passEl =
    document.getElementById('login-password')

  const errEl =
    document.getElementById('login-error')

  if (_loginMode === 'support') {
    if (title)
      title.textContent =
        'Orbito Support Access'

    if (subtitle)
      subtitle.textContent =
        'Platform super admin authentication'

    badge?.classList.remove('hidden')

    if (supportBtn)
      supportBtn.textContent =
        '← Shop login'

    forgotBtn?.classList.add('hidden')

    if (loginBtn)
      loginBtn.textContent =
        'Enter Support Mode'

    if (emailEl)
      emailEl.placeholder =
        'Platform admin email'
  } else {
    if (title)
      title.textContent =
        CFG.shop_name || 'RetailOS'

    if (subtitle)
      subtitle.textContent =
        CFG.suspended
          ? 'Shop access is suspended — Orbito Support remains available'
          : 'Sign in to continue'

    badge?.classList.add('hidden')

    if (supportBtn)
      supportBtn.textContent =
        'Orbito Support'

    forgotBtn?.classList.remove('hidden')

    if (loginBtn)
      loginBtn.textContent =
        'Login'

    if (emailEl)
      emailEl.placeholder =
        'your@email.com'
  }

  if (emailEl)
    emailEl.value = ''

  if (passEl)
    passEl.value = ''

  errEl?.classList.add('hidden')

  resetTurnstile()

  emailEl?.focus()
}

export function renderLogin(onSuccess) {
  cleanupTurnstile()
  _loginMode = 'shop'

  dstack('auth.renderLogin', '*** #app REWRITE *** (login screen)')
  _onLoginSuccess = onSuccess
  const app = document.getElementById('app')
  app.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;background:var(--bg);padding:16px;position:relative">
      <div class="card" style="width:min(400px,95vw);display:grid;gap:20px;padding:32px">
        <div style="text-align:center;display:grid;gap:8px">
          <div class="logo" style="margin:0 auto 8px;width:72px;height:72px;font-size:20px;overflow:hidden">
            ${CFG.shop_logo
              ? `<img src="${CFG.shop_logo}" style="width:100%;height:100%;object-fit:contain;border-radius:inherit">`
              : CFG.shop_name?.slice(0,2).toUpperCase() || 'FP'}
          </div>
          <div
           id="support-mode-badge"
           class="badge warn hidden"
           style="width:fit-content;margin:0 auto 2px"
          >
           Support session
          </div>

          <h2 id="login-title" style="margin:0">
           ${CFG.shop_name || 'RetailOS'}
          </h2>

          <p
           id="login-subtitle"
           class="muted"
          style="font-size:13px;margin:0"
          >
           Sign in to continue
          </p>
        </div>
        <div style="display:grid;gap:10px">
          <label class="field"><span>Email</span>
            <input id="login-email" type="email" autocomplete="email"
              placeholder="your@email.com" style="font-size:15px" autofocus>
          </label>
          <label class="field"><span>Password</span>
            <input id="login-password" type="password"
              autocomplete="current-password"
              placeholder="Your password" style="font-size:15px">
          </label>
          <div id="login-error" class="hidden"
            style="color:var(--danger);font-size:13px;text-align:center;padding:4px 0">
            Incorrect email or password.
          </div>
          <button type="button" id="forgot-btn"
            style="font-size:12px;color:var(--primary);background:none;border:none;
                   cursor:pointer;text-align:right;padding:0">
            Forgot password?
          </button>
          <div id="cf-turnstile-wrap"
            style="display:flex;justify-content:center;margin:4px 0"></div>
          <button id="login-btn" class="primary-button"
            style="width:100%;font-size:15px;padding:12px">
            Login
          </button>
        </div>
                <p class="muted" style="text-align:center;font-size:12px;margin:0">
          ${CFG.shop_address || ''}
        </p>
      </div>

      <button
        type="button"
        id="support-access-btn"
        style="
          position:fixed;
right:16px;
top:14px;
background:none;
border:none;
color:var(--muted);
font-size:11px;
opacity:.60;
cursor:pointer;
padding:6px 8px;
z-index:100
        "
      >
        Orbito Support
      </button>
    </div>`

    // Turnstile is required in every environment.
  // localhost must be added to the allowed hostnames in Cloudflare.
  const wrap = document.getElementById('cf-turnstile-wrap')
  const btn  = document.getElementById('login-btn')
  const generation = ++_turnstileGeneration

  if (btn) btn.disabled = true

  _turnstileWidgetId = null
  _turnstileContainer = wrap
  let attempts = 0

  const mountTurnstile = () => {
    if (generation !== _turnstileGeneration || !wrap?.isConnected) return
    if (window.turnstile) {
      _turnstileWidgetId = window.turnstile.render(wrap, {
        sitekey:
          import.meta.env.VITE_TURNSTILE_SITE_KEY ||
          '0x4AAAAAADl87EDGnxcg5eJZ',

        theme:
          state.theme === 'dark'
            ? 'dark'
            : 'light',

        callback: () => {
          if (generation === _turnstileGeneration && btn?.isConnected) btn.disabled = false
        },

        'expired-callback': () => {
          if (generation === _turnstileGeneration && btn?.isConnected) btn.disabled = true
        },

        'error-callback': () => {
          if (generation === _turnstileGeneration && btn?.isConnected) btn.disabled = true
        },
      })
    } else if (attempts++ < 75) {
      _turnstileMountTimer = setTimeout(mountTurnstile, 200)
    } else if (wrap) {
      wrap.innerHTML = `
        <p style="color:var(--danger);font-size:12px;text-align:center">
          Verification failed to load.
          Check your connection or ad-blocker and refresh.
        </p>`
    }
  }

  mountTurnstile()

  document.getElementById('login-btn').addEventListener('click', submitLogin)
  document.getElementById('forgot-btn').addEventListener('click', forgotPassword)
  document
  .getElementById('support-access-btn')
  .addEventListener('click', () => {
    setLoginMode(
      _loginMode === 'support'
        ? 'shop'
        : 'support'
    )
  })
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitLogin()
  })
}

function resetTurnstile() {
  const btn = document.getElementById('login-btn')

  if (btn) btn.disabled = true

  if (window.turnstile && _turnstileWidgetId !== null && _turnstileContainer?.isConnected) {
    try {
      window.turnstile.reset(_turnstileWidgetId)
    } catch {}
  } else if (!_turnstileContainer?.isConnected) {
    _turnstileWidgetId = null
    _turnstileContainer = null
  }
}

function cleanupTurnstile() {
  _turnstileGeneration += 1
  if (_turnstileMountTimer !== null) {
    clearTimeout(_turnstileMountTimer)
    _turnstileMountTimer = null
  }

  if (window.turnstile && _turnstileWidgetId !== null && _turnstileContainer?.isConnected) {
    try {
      window.turnstile.remove(_turnstileWidgetId)
    } catch {}
  }

  _turnstileWidgetId = null
  _turnstileContainer = null
}

async function submitLogin() {
  const btn = document.getElementById('login-btn')
  if (btn?.disabled) return  // Turnstile not verified yet, or a submit is already in flight
  const emailEl = document.getElementById('login-email')
  const passEl  = document.getElementById('login-password')
  const errEl   = document.getElementById('login-error')
  const email   = emailEl?.value?.trim() || ''
  const pass    = passEl?.value?.trim()  || ''

  if (!email || !pass) {
    if (errEl) { errEl.textContent = 'Please enter your email and password.'; errEl.classList.remove('hidden') }
    return
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Logging in…' }
  if (errEl) errEl.classList.add('hidden')

  const turnstileToken = document.querySelector('[name="cf-turnstile-response"]')?.value || ''

  const res = await loginViaEdgeFunction(
   email,
   pass,
   turnstileToken,
   _loginMode
  )
  if (res.ok) {
    const established = await establishLoginSession(res)
    if (!established.ok) {
      await _clearSession()
      res.ok = false
      res.error = established.error
    } else {
      dlog('auth.submitLogin', `LOGIN ok role=${established.session.employee?.role} -- calling _onLoginSuccess`)
      cleanupTurnstile()
      const SESSION = established.session
      const role = SESSION.employee.role
      const route = SESSION.isSupportAdmin
        ? 'admin'
        : role === 'Technician'
          ? 'workshop'
          : (role === 'Business Owner' || role === 'Manager')
            ? 'admin'
            : 'pos'
      _saveSession(SESSION, route, 'dashboard')
      _onLoginSuccess && _onLoginSuccess(SESSION)
      return
    }
  }

  if (!res.ok) {
    dlog('auth.submitLogin', `LOGIN FAILED: ${res.error}`)
    if (btn) {
  btn.disabled = false
  btn.textContent =
    _loginMode === 'support'
      ? 'Enter Support Mode'
      : 'Login'
}
    if (errEl) { errEl.textContent = res.error || 'Incorrect email or password.'; errEl.classList.remove('hidden') }
    if (passEl) {
  passEl.value = ''
  passEl.focus()
}

resetTurnstile()
  }
}

async function forgotPassword() {
  if (_loginMode === 'support') return
  const email = document.getElementById('login-email')?.value?.trim()
  if (!email) { alert('Enter your email address first.'); return }
  const turnstileToken = document.querySelector('[name="cf-turnstile-response"]')?.value || ''
  if (!turnstileToken) { alert('Complete the verification first.'); return }
  const { requestPasswordReset } = await import('./shared.js')
  const res = await requestPasswordReset(email, turnstileToken)
  if (!res.ok) { alert('Something went wrong: ' + res.error); return }
  alert('If that account is eligible, a password reset request has been recorded. Contact your administrator.')
  resetTurnstile()
}
