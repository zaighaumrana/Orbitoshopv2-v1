/* ═══════════════════════════════════════════════════════════════════
   TEMPORARY DEBUG LOGGER
   - This file is loaded via its OWN <script type="module"> tag in
     index.html, BEFORE main.js, so console/error capture is active
     from the very first instant the page executes -- not just from
     wherever dlog() happens to be manually called later.
   - Captures every console.log/info/warn/error/trace call, every
     uncaught error, and every unhandled promise rejection, app-wide.
   - Renders a live on-screen panel appended to document.body (not
     #app), so it survives every #app innerHTML replacement.
   - dstack() additionally records a full call-stack trace, so you
     can see the whole caller chain, not just the immediate caller.
   DELETE THIS FILE, ITS <script> TAG IN index.html, AND ALL ITS
   IMPORTS ELSEWHERE ONCE THE BUG IS FOUND.
═══════════════════════════════════════════════════════════════════ */

const logs = []
let panel = null
let seq = 0
let paused = false

function ensurePanel() {
  if (!document.body) return null
  if (panel && document.body.contains(panel)) return panel
  panel = document.createElement('div')
  panel.id = '__dbg_panel'
  panel.style.cssText =
    'position:fixed;bottom:0;left:0;right:0;max-height:42vh;overflow-y:auto;' +
    'background:rgba(0,0,0,0.92);color:#39ff6a;font:11px/1.45 monospace;' +
    'z-index:2147483647;padding:6px 8px;white-space:pre-wrap;pointer-events:auto;' +
    'border-top:2px solid #39ff6a'

  const btnBar = document.createElement('div')
  btnBar.style.cssText = 'position:fixed;bottom:42vh;right:0;z-index:2147483647;display:flex;gap:4px'
  const mkBtn = (label, onClick) => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = 'background:#111;color:#39ff6a;border:1px solid #39ff6a;font:10px monospace;padding:2px 6px;cursor:pointer'
    b.onclick = onClick
    return b
  }
  const pauseBtn = mkBtn('⏸ pause', function () {
    paused = !paused
    this.textContent = paused ? '▶ resume' : '⏸ pause'
  })
  btnBar.appendChild(mkBtn('✕ clear', () => { logs.length = 0; flush() }))
  btnBar.appendChild(pauseBtn)

  document.body.appendChild(panel)
  document.body.appendChild(btnBar)
  return panel
}

function flush() {
  const p = ensurePanel()
  if (!p) return
  p.textContent = logs.slice(-100).join('\n')
  p.scrollTop = p.scrollHeight
}

function record(tag, msg, withStack) {
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

/* ── Capture EVERYTHING, from this instant forward ──
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
