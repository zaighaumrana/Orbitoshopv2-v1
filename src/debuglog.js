/* ═══════════════════════════════════════════════════════════════════
   TEMPORARY DEBUG LOGGER — for diagnosing the admin-login dashboard
   redirect bug. Renders a live on-screen panel (bottom of viewport)
   that survives every #app innerHTML replacement, since it's appended
   directly to document.body, not #app.
   DELETE THIS FILE AND ALL ITS IMPORTS ONCE THE BUG IS FOUND.
═══════════════════════════════════════════════════════════════════ */
const logs = []
let panel = null
let seq = 0

function ensurePanel() {
  if (panel && document.body.contains(panel)) return panel
  panel = document.createElement('div')
  panel.id = '__dbg_panel'
  panel.style.cssText =
    'position:fixed;bottom:0;left:0;right:0;max-height:38vh;overflow-y:auto;' +
    'background:rgba(0,0,0,0.92);color:#39ff6a;font:11px/1.4 monospace;' +
    'z-index:2147483647;padding:6px 8px;white-space:pre-wrap;pointer-events:auto;' +
    'border-top:2px solid #39ff6a'
  const clearBtn = document.createElement('button')
  clearBtn.textContent = '✕ clear'
  clearBtn.style.cssText =
    'position:fixed;bottom:38vh;right:0;z-index:2147483647;background:#111;color:#39ff6a;' +
    'border:1px solid #39ff6a;font:10px monospace;padding:2px 6px;cursor:pointer'
  clearBtn.onclick = () => { logs.length = 0; render() }
  document.body.appendChild(panel)
  document.body.appendChild(clearBtn)
  return panel
}

function render() {
  const p = ensurePanel()
  p.textContent = logs.slice(-60).join('\n')
  p.scrollTop = p.scrollHeight
}

export function dlog(tag, msg) {
  seq += 1
  const t = new Date().toISOString().slice(11, 23)
  const line = `#${seq} [${t}] ${tag} :: ${msg}`
  logs.push(line)
  if (logs.length > 300) logs.shift()
  console.log(line)
  render()
}

/* Best-effort caller extraction from a stack trace, for navigate()/render() calls */
export function callerInfo() {
  const stack = new Error().stack || ''
  const lines = stack.split('\n').slice(2, 4).map(l => l.trim())
  return lines.join(' <- ')
}
