# DEBUG INSTRUMENTATION — REMOVAL CHECKLIST

This is temporary logging added to catch the exact function responsible for the
"Admin creates first repair ticket → app redirects to Dashboard" bug. Logging
now covers the whole app, not just the POS/Admin/router path.

Every addition is either a new standalone file, a new `<script>` tag, a new
`import` line, or a `dlog(...)`/`dstack(...)` call inserted on its own line
(a few are inline with an existing one-line guard clause — called out below).
**Nothing existing was deleted, reordered, or changed in behavior.**

Once the bug is found and fixed, remove everything listed below, in this order.

---

## 1. New file — delete entirely

**`src/debuglog.js`**
The whole file is new. It renders the on-screen log panel, patches
`console.log/info/warn/error/trace` globally, and captures uncaught
errors/unhandled rejections. Delete the file.

---

## 2. `index.html` — remove 1 line

```diff
  <body>
    <div id="app"></div>
-   <script type="module" src="/src/debuglog.js"></script>
    <script type="module" src="/src/main.js"></script>
  </body>
```

---

## 3. `src/router.js` — remove 1 import + 9 log lines

**Import (line 7):** `import { dlog, dstack, callerInfo } from './debuglog.js'`

**Inside `navigate()`:** lines 32, 38, 44, 47
**Inside `resolve()`:** lines 89, 95, 98, 101
**Inside `startRouter()`:** lines 111, 115

---

## 4. `src/main.js` — remove 1 import + 5 log lines

**Import (line 4):** `import { dlog } from './debuglog.js'`

**Inside `onLoginSuccess()`:** lines 75, 80, 85 are standalone `dlog(...)` lines.
Lines 82–84 each have a `dlog(...);` **inline** with an existing `navigate(...)`
call — restore each to a plain single-statement line, e.g.:
```diff
- if (role === 'Business Owner' || role === 'Manager') { dlog('main.onLoginSuccess', 'calling navigate(/admin/dashboard)'); navigate('/admin/dashboard') }
+ if (role === 'Business Owner' || role === 'Manager') navigate('/admin/dashboard')
```

---

## 5. `src/admin/admin.js` — remove 1 import + 11 log lines

**Import (line 13):** `import { dlog, dstack, callerInfo } from '../debuglog.js'`

Lines: 45, 75, 100, 1091, 1098, 1110, 1114, 1118, 1615, 1765

---

## 6. `src/pos/pos.js` — remove 1 import + 18 log lines

**Import (line 24):** `import { dlog, dstack, callerInfo } from '../debuglog.js'`

Lines: 47, 75, 89, 1078, 1083, 1116, 1124, 1127, 1255, 1261, 1274, 1283, 1447, 1707, 1710, 1849

Two are **inline** with existing guard clauses — restore both to their plain form:
```diff
- if (!ticketItem) { dlog('POS.placeOrder', 'no ticketItem in cart -- abort'); return }
+ if (!ticketItem) return
```
```diff
- if (error) { dlog('POS.placeOrder', `INSERT FAILED: ${error.message}`); alert('Error placing order: ' + error.message); return }
+ if (error) { alert('Error placing order: ' + error.message); return }
```

---

## 7. `src/shared.js` — remove 1 import + 20 log lines

**Import (line 2):** `import { dlog, dstack } from './debuglog.js'`

Lines: 57, 59, 62, 70, 92, 94 (inline — restore to `if (error) { console.warn('Config load failed:', error.message); return }`), 96, 159, 160, 161, 163, 169, 177, 178, 194 (inline — restore to `if (error) { console.warn('next_invoice_seq failed, falling back:', error.message) }`), 197, 205 (inline, same pattern for `next_ticket_seq`), 208, 340, 360, 361, 366, 377, 378

*(`createTicket()` at line ~339 is currently dead code — zero callers anywhere in the app. Worth investigating separately, unrelated to this cleanup.)*

---

## 8. `src/auth.js` — remove 1 import + 3 log lines

**Import (line 5):** `import { dlog, dstack } from './debuglog.js'`

Lines: 10, 121, 131

---

## 9. `src/admin/ems.js` — remove 1 import + 15 log lines

**Import (line 12):** `import { dlog, dstack } from '../debuglog.js'`

Lines: 35, 41, 47, 65, 68, 76, 88, 94, 161, 611, 626 — line 625 is standalone but line 640 is **inline**:
```diff
- if (!confirm('Clock out and end your shift?')) { dlog('EMS.handleClockOut', 'user cancelled confirm()'); return }
+ if (!confirm('Clock out and end your shift?')) return
```
Plus lines 639, 653.

---

## 10. `src/pos/workshop.js` — remove 1 import + 10 log lines

**Import (line 21):** `import { dlog, dstack, callerInfo } from '../debuglog.js'`

Lines: 34, 46, 52, 503, 533, 543, 552, 744, 818

---

## 11. `src/print/print.js` — remove 1 import + 3 log lines

**Import (line 2):** `import { dlog, dstack } from '../debuglog.js'`

Lines: 5, 24, 63

*(Note: `window.print()` itself fires inside the print iframe's own JS context — a separate window this logger cannot reach. The `printThermal()` log marks the trigger moment, which is what matters for tracing the caller.)*

---

## 12. `src/inventory.js` — remove 1 import + 11 log lines

**Import (line 9):** `import { dlog } from './debuglog.js'`

Lines: 114, 119, 123, 128, 136, 141, 148 are standalone. Lines 120, 122, 134, 147 are **inline** with existing guard clauses — restore each, e.g.:
```diff
- if (!confirm('Delete this item?')) { dlog('inventory.handleInvDelete', 'user cancelled confirm()'); return { deleted:false } }
+ if (!confirm('Delete this item?')) return { deleted:false }
```
(same pattern for the two `if (error) { ... }` guards in `submitInvAdd`/`submitInvEdit`)

---

## 13. `public/sw.js` — remove 3 `console.log` lines

Lines: 4 (`console.log('[SW] install')`), 9 (`console.log('[SW] activate')`), 16 (`console.log('[SW] fetch fallback to cache for', e.request.url)`).

**Note:** the service worker runs in its own execution context (no DOM), so
these logs only ever appeared in DevTools → Application → Service Workers,
never in the on-screen panel from `debuglog.js`. Safe to remove independently
of everything else.

---

## Files intentionally left untouched (no executable logic to instrument)

- `supabase/migrations/*.sql` — SQL, not JS
- `src/style.css`, `public/manifest.webmanifest`, `public/_headers`, `public/_redirects`, `public/favicon.svg`, `public/icons.svg` — static assets/config
- `public/track.html` — standalone customer-facing page, unrelated to the admin/POS bug path
- `vite.config.js`, `package.json`, `.env.example.txt`, `.gitignore` — build/tooling config

---

## Fast way to verify a clean removal

After removing everything above, run this from the project root — it should return **nothing**:

```bash
grep -rn "dlog(\|dstack(\|callerInfo(\|debuglog\|\[SW\]" src/ public/sw.js index.html
```

If that command is silent, every trace of the instrumentation is gone.

---

## Files touched by this instrumentation (summary)

| File | Change type |
|---|---|
| `src/debuglog.js` | **new file** — delete it |
| `index.html` | +1 line (script tag) |
| `src/router.js` | +1 import, +9 log lines |
| `src/main.js` | +1 import, +5 log lines (3 inline) |
| `src/admin/admin.js` | +1 import, +11 log lines |
| `src/pos/pos.js` | +1 import, +18 log lines (2 inline) |
| `src/shared.js` | +1 import, +20 log lines (2 inline) |
| `src/auth.js` | +1 import, +3 log lines |
| `src/admin/ems.js` | +1 import, +15 log lines (1 inline) |
| `src/pos/workshop.js` | +1 import, +10 log lines |
| `src/print/print.js` | +1 import, +3 log lines |
| `src/inventory.js` | +1 import, +11 log lines (4 inline) |
| `public/sw.js` | +3 plain `console.log` lines (no import needed — separate context) |

**13 files touched total** (1 new + 12 modified).
