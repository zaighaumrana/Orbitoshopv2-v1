/* ═══════════════════════════════════════════════════════════════════
   SUPPORT DIAGNOSTIC LOGGER
   - This file is loaded via its OWN <script type="module"> tag in
   index.html, BEFORE main.js. Browser-console forwarding is always active;
   in-app capture begins only after support verification.
   - For verified support, captures console.log/info/warn/error/trace,
     uncaught errors and unhandled promise rejections, app-wide.
   - Renders a live on-screen panel appended to document.body (not
     #app), so it survives every #app innerHTML replacement.
   - dstack() additionally records a full call-stack trace, so you
     can see the whole caller chain, not just the immediate caller.
   Capture and UI are disabled until Supabase Auth and the active app_users
   profile verify the dedicated Orbito Support identity. No debug flags.
═══════════════════════════════════════════════════════════════════ */

const logs = []
let panel = null
let seq = 0
let paused = false
let minimized = false
let supportUserId = null
let initialized = false
let accessGeneration = 0

function revokeConsoleAccess() {
  supportUserId = null
  if (panel?._btnBar) {
    panel._btnBar.querySelectorAll('button').forEach(button => { button.onclick = null })
    panel._btnBar.remove()
  }
  panel?.remove()
  panel = null
  logs.length = 0
  seq = 0
  paused = false
  minimized = false
}

/** Bind once to the real Auth client. Callers cannot supply an enabling role or
 * flag; access is independently checked against Auth and the RLS-backed profile.
 * This panel only displays local diagnostics, never authorizes backend actions.
 */
export function initializeSupportConsole(client) {
  if (initialized) return
  initialized = true
  const verify = async (generation = ++accessGeneration) => {
    if (generation !== accessGeneration) return
    try {
      const { data, error } = await client.auth.getUser()
      if (generation !== accessGeneration) return
      if (error || !data?.user) { revokeConsoleAccess(); return }
      const { data:profile, error:profileError } = await client.from('app_users')
        .select('auth_user_id, role, status, employee_id')
        .eq('auth_user_id', data.user.id).single()
      if (generation !== accessGeneration) return
      if (profileError || profile?.auth_user_id !== data.user.id ||
          profile.role !== 'Orbito Support' || profile.status !== 'Active' ||
          profile.employee_id != null) { revokeConsoleAccess(); return }
      if (supportUserId !== data.user.id) revokeConsoleAccess()
      supportUserId = data.user.id
      flush()
    } catch {
      if (generation === accessGeneration) revokeConsoleAccess()
    }
  }
  client.auth.onAuthStateChange((event, session) => {
    // Revoke synchronously before any async checks can complete or render.
    const generation = ++accessGeneration
    if (event === 'SIGNED_OUT' || !session?.user || session.user.id !== supportUserId) revokeConsoleAccess()
    if (event !== 'SIGNED_OUT' && session?.user) queueMicrotask(() => verify(generation))
  })
  void verify()
}

/** Logout revokes immediately, even while the network sign-out is pending. */
export function revokeSupportConsole() {
  ++accessGeneration
  revokeConsoleAccess()
}

const EXPANDED_HEIGHT = '42vh'
const MINIMIZED_HEIGHT = '26px'

function ensurePanel() {
  if (!supportUserId || !document.body) return null
  if (panel && document.body.contains(panel)) return panel
  panel = document.createElement('div')
  panel.id = '__dbg_panel'
  panel.style.cssText =
    `position:fixed;bottom:0;left:0;right:0;max-height:${EXPANDED_HEIGHT};overflow-y:auto;` +
    'background:rgba(0,0,0,0.92);color:#39ff6a;font:11px/1.45 monospace;' +
    'z-index:2147483647;padding:6px 8px;white-space:pre-wrap;pointer-events:auto;' +
    'border-top:2px solid #39ff6a;transition:max-height 0.15s ease'
  panel.title = ''

  const btnBar = document.createElement('div')
  btnBar.style.cssText = `position:fixed;bottom:${EXPANDED_HEIGHT};right:0;z-index:2147483647;display:flex;gap:4px;transition:bottom 0.15s ease`
  const mkBtn = (label, onClick) => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'background:#111;color:#39ff6a;border:1px solid #39ff6a;font:10px monospace;padding:2px 6px;cursor:pointer'
    b.onclick = (e) => { e.stopPropagation(); if (supportUserId) onClick() }
    return b
  }
  const pauseBtn = mkBtn('⏸ pause', () => {
    paused = !paused
    pauseBtn.textContent = paused ? '▶ resume' : '⏸ pause'
  })
  const minBtn = mkBtn('🗕 minimize', () => setMinimized(!minimized))
  btnBar.appendChild(mkBtn('✕ clear', () => { logs.length = 0; flush() }))
  btnBar.appendChild(pauseBtn)
  btnBar.appendChild(minBtn)

  document.body.appendChild(panel)
  document.body.appendChild(btnBar)
  panel._btnBar = btnBar
  panel._minBtn = minBtn
  return panel
}

function setMinimized(next) {
  if (!supportUserId) return
  minimized = next
  if (!panel) return
  panel.style.maxHeight = minimized ? MINIMIZED_HEIGHT : EXPANDED_HEIGHT
  panel.style.overflowY = minimized ? 'hidden' : 'auto'
  if (panel._btnBar) panel._btnBar.style.bottom = minimized ? MINIMIZED_HEIGHT : EXPANDED_HEIGHT
  if (panel._minBtn) panel._minBtn.textContent = minimized ? '🗖 expand' : '🗕 minimize'
  flush()
}

function flush() {
  const p = ensurePanel()
  if (!p) return
  // Recording never stops while minimized -- record()/logs keep filling
  // in the background regardless of what the panel currently displays.
  if (minimized) {
    const last = logs[logs.length - 1] || ''
    const lastLine = last.split('\n')[0]
    p.textContent = `▸ ${logs.length} logs captured (still recording) -- press 🗖 expand -- last: ${lastLine}`
    return
  }
  p.textContent = logs.slice(-100).join('\n')
  p.scrollTop = p.scrollHeight
}

function record(tag, msg, withStack) {
  if (!supportUserId) return
  seq += 1
  const t = new Date().toISOString().slice(11, 23)
  let line = `#${seq} [${t}] ${tag} :: ${msg}`
  if (withStack) {
    const stack = (new Error().stack || '')
      .split('\n')
      .slice(2, 14)               // drop "Error" line + this record() frame
      .map(l => '    ↳ ' + l.trim())
      .join('\n')
    if (stack) line += '\n' + stack
  }
  logs.push(line)
  if (logs.length > 600) logs.shift()
  if (!paused) flush()
}

export function dlog(tag, msg) {
  record(tag, msg, false)
}

/* Full caller-chain stack trace — use for navigate(), ADMIN.render(), POS.render() */
export function dstack(tag, msg) {
  record(tag, msg, true)
}

/* Legacy single-line caller lookup, kept for any existing call sites */
export function callerInfo() {
  const stack = new Error().stack || ''
  return stack.split('\n').slice(2, 4).map(l => l.trim()).join(' <- ')
}

/* ── Forward browser console; record only during verified support access ──
   This module must be loaded via its own <script type="module"> tag
   BEFORE main.js in index.html, so this patching happens before any
   other app module (shared.js, router.js, main.js, ...) evaluates. */
function argsToStr(args) {
  return args.map(a => {
    if (typeof a === 'string') return a
    try { return JSON.stringify(a) } catch { return String(a) }
  }).join(' ')
}

const _origLog   = console.log.bind(console)
const _origInfo  = console.info.bind(console)
const _origWarn  = console.warn.bind(console)
const _origError = console.error.bind(console)
const _origTrace = console.trace.bind(console)

console.log   = (...a) => { _origLog(...a);   record('console.log',   argsToStr(a), false) }
console.info  = (...a) => { _origInfo(...a);  record('console.info',  argsToStr(a), false) }
console.warn  = (...a) => { _origWarn(...a);  record('console.warn',  argsToStr(a), false) }
console.error = (...a) => { _origError(...a); record('console.error', argsToStr(a), true) }
console.trace = (...a) => { _origTrace(...a); record('console.trace', argsToStr(a), true) }

window.addEventListener('error', e => {
  record('window.onerror', `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`, true)
})
window.addEventListener('unhandledrejection', e => {
  record('unhandledrejection', String(e.reason?.stack || e.reason), true)
})

record('debuglog', `INITIALIZED ${new Date().toISOString()} -- capturing all console output + errors from this point forward`, false)

if (document.readyState !== 'loading') {
  ensurePanel(); flush()
} else {
  document.addEventListener('DOMContentLoaded', () => { ensurePanel(); flush() })
}
