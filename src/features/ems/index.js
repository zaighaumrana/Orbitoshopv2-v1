/* ═══════════════════════════════════════════════════════════════════
   features/ems/index.js
   The genuinely shared slice of EMS -- verified by actual caller, not
   assumed by domain name. checkClockIn (+ its private helpers
   renderClockInScreen/renderBreakGate/_clockOut/_greeting) is called
   from main.js; leaveRequestHTML/submitLeaveRequest/handleClockOut are
   called from BOTH pos.js and workshop.js. All confirmed to have zero
   internal cross-reference with the admin-only half.

   The admin-only EMS dashboard (loadEMSData, emsView, attachEMSEvents,
   salary slip generation, and every tab renderer) lives in
   features/admin/ems/index.js instead -- verified those functions have
   exactly one caller (admin.js) each, and zero calls back into this
   file's functions.

   Note: SESSION here is a private module variable, independently
   declared in both this file and features/admin/ems/index.js. Checked
   before splitting: it's written by three different functions across
   the original single file but never actually READ anywhere -- so two
   independent copies behave identically to the one shared copy did.
═══════════════════════════════════════════════════════════════════ */
import {
  sb, state, CFG, money,
  _clearSession,
} from '../../shared.js'
import { navigate } from '../../router.js'
import { dlog, dstack } from '../../debuglog.js'

let SESSION         = {}
let _onProceed      = null   // callback after clock-in

export async function checkClockIn(sess, cfg, onProceed) {
  dlog('EMS.checkClockIn', `ENTRY isAdmin=${sess.isAdmin} role=${sess.employee?.role} ems_enabled=${cfg.ems_enabled}`)
  SESSION    = sess
  _onProceed = onProceed

  // Owner never needs to clock in
  if (sess.isAdmin || sess.employee?.role === 'Business Owner') {
    dlog('EMS.checkClockIn', 'Owner branch -- calling onProceed() immediately')
    onProceed(); return
  }

  // EMS not enabled for this client
  if (!cfg.ems_enabled) {
    dlog('EMS.checkClockIn', 'ems_enabled=false -- calling onProceed() immediately')
    onProceed(); return
  }

  // Check if employee has an open attendance record today
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await sb.from('attendance')
    .select('id, clock_in, clock_out')
    .eq('employee_id', sess.employee.id)
    .eq('date', today)
    .order('id', { ascending: false })
    .limit(1)

  const record = data?.[0] || null

  if (record && !record.clock_out) {
    // Already clocked in today
    if (cfg.ems_track_breaks) {
      dlog('EMS.checkClockIn', 'already clocked in, break-tracking ON -- showing break gate')
      renderBreakGate(sess, record)
    } else {
      dlog('EMS.checkClockIn', 'already clocked in, break-tracking OFF -- calling onProceed()')
      onProceed()
    }
    return
  }

  if (record && record.clock_out) {
    // Clocked out — need to clock back in
    dlog('EMS.checkClockIn', 'clocked out already today -- showing clock-in screen (isReturn)')
    if (cfg.ems_track_breaks) {
      renderClockInScreen(sess, true) // isReturn = true
    } else {
      // Break tracking OFF — treat clock-out as end of shift
      // They need to clock in fresh
      renderClockInScreen(sess, false)
    }
    return
  }

  // No record today — first clock-in of the day
  dlog('EMS.checkClockIn', 'no attendance record today -- showing clock-in screen')
  renderClockInScreen(sess, false)
}

/* ── Clock-in screen ── */
function renderClockInScreen(sess, isReturn) {
  dstack('EMS.renderClockInScreen', `*** #app REWRITE *** isReturn=${isReturn}`)
  const now  = new Date()
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString(undefined, { weekday:'long', day:'numeric', month:'long', year:'numeric' })

  document.getElementById('app').innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;
                background:var(--bg);padding:24px">
      <div class="card" style="width:min(420px,95vw);display:grid;gap:24px;padding:32px;text-align:center">
        <div>
          <div style="font-size:48px;margin-bottom:8px">
            ${isReturn ? '👋' : '🕐'}
          </div>
          <h2 style="margin:0 0 6px">
            ${isReturn ? 'Welcome Back' : `Good ${_greeting()}, ${sess.employee.name.split(' ')[0]}!`}
          </h2>
          <p class="muted" style="font-size:13px">${date}</p>
        </div>

        <div style="background:var(--surface-2);border-radius:12px;padding:20px">
          <div style="font-size:36px;font-weight:700;font-variant-numeric:tabular-nums"
            id="live-clock">${time}</div>
          <p class="muted" style="font-size:13px;margin-top:4px">Current Time</p>
        </div>

        ${isReturn ? `
        <div style="background:color-mix(in srgb,var(--warning) 10%,var(--surface));
                    border:1px solid color-mix(in srgb,var(--warning) 30%,var(--border));
                    border-radius:8px;padding:12px;font-size:13px">
          You were on a break. Clock back in to continue your shift.
        </div>` : ''}

        <button class="primary-button" style="font-size:16px;padding:14px"
          id="clockin-btn">
          ${isReturn ? '⏱ Clock Back In' : '⏱ Clock In'}
        </button>

        <p class="muted" style="font-size:12px">
          ${sess.employee.role} · ${CFG.shop_name || 'RetailOS'}
        </p>
      </div>
    </div>`

  // Tick the live clock
  const clockEl = document.getElementById('live-clock')
  const ticker  = setInterval(() => {
    if (!clockEl || !document.body.contains(clockEl)) { clearInterval(ticker); return }
    clockEl.textContent = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
  }, 60000)

  document.getElementById('clockin-btn').addEventListener('click', async () => {
    const btn = document.getElementById('clockin-btn')
    btn.disabled = true; btn.textContent = 'Clocking in…'
    const today = new Date().toISOString().slice(0, 10)
    const { error } = await sb.from('attendance').insert({
      employee_id: sess.employee.id,
      clock_in:    new Date().toISOString(),
      date:        today,
    })
    if (error) { alert('Clock-in failed: ' + error.message); btn.disabled = false; btn.textContent = '⏱ Clock In'; return }
    clearInterval(ticker)
    _onProceed && _onProceed()
  })
}

/* ── Break gate (ems_track_breaks = true, already clocked in) ── */
function renderBreakGate(sess, record) {
  dstack('EMS.renderBreakGate', '*** #app REWRITE ***')
  const clockedInAt  = new Date(record.clock_in)
  const elapsed      = Math.floor((Date.now() - clockedInAt) / 60000) // minutes
  const elapsedStr   = elapsed >= 60
    ? `${Math.floor(elapsed/60)}h ${elapsed%60}m`
    : `${elapsed}m`

  document.getElementById('app').innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;
                background:var(--bg);padding:24px">
      <div class="card" style="width:min(420px,95vw);display:grid;gap:20px;padding:32px;text-align:center">
        <div>
          <div style="font-size:48px;margin-bottom:8px">✅</div>
          <h2 style="margin:0 0 6px">You're Clocked In</h2>
          <p class="muted" style="font-size:13px">
            Since ${clockedInAt.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
            · ${elapsedStr} on shift
          </p>
        </div>

        <button class="primary-button" style="font-size:15px;padding:13px"
          id="proceed-btn">
          Continue to ${sess.employee.role === 'Manager' ? 'Dashboard' : sess.employee.role === 'Technician' ? 'Workshop' : 'POS'}
        </button>

        <button class="secondary-button" style="font-size:14px;padding:11px"
          id="breakout-btn">
          🍵 Clock Out for Break
        </button>

        <button class="icon-button" style="font-size:13px;color:var(--danger)"
          id="shiftend-btn">
          End Shift & Logout
        </button>
      </div>
    </div>`

  document.getElementById('proceed-btn').addEventListener('click', () => {
    _onProceed && _onProceed()
  })

  document.getElementById('breakout-btn').addEventListener('click', async () => {
    const btn = document.getElementById('breakout-btn')
    btn.disabled = true; btn.textContent = 'Clocking out…'
    await _clockOut(sess, record.id)
    renderClockInScreen(sess, true)
  })

  document.getElementById('shiftend-btn').addEventListener('click', async () => {
    if (!confirm('End your shift and log out?')) return
    await _clockOut(sess, record.id)
    _clearSession()
    navigate('/login')
  })
}

async function _clockOut(sess, attendanceId) {
  await sb.from('attendance')
    .update({ clock_out: new Date().toISOString() })
    .eq('id', attendanceId)
}

function _greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}

/* ════════════════════════════════════════════════════════════════
   EMS DASHBOARD
   Rendered inside the admin panel as a tab-like section
   Called by admin.js when adminModule === 'ems'
════════════════════════════════════════════════════════════════ */
export function leaveRequestHTML() {
  return `
    <div class="modal-backdrop">
      <form class="modal modal-sm" data-form="leave-request">
        <h2>Apply for Leave</h2>
        <div class="form-grid">
          <label class="field"><span>Leave Type</span>
            <select name="leave_type">
              <option>Casual</option>
              <option>Sick</option>
              <option>Emergency</option>
              <option>Other</option>
            </select>
          </label>
          <label class="field"><span>From Date</span>
            <input name="from_date" type="date" required
              min="${new Date().toISOString().slice(0,10)}">
          </label>
          <label class="field"><span>To Date</span>
            <input name="to_date" type="date" required
              min="${new Date().toISOString().slice(0,10)}">
          </label>
          <label class="field" style="grid-column:1/-1"><span>Reason</span>
            <textarea name="reason" style="min-height:72px"
              placeholder="Brief description of your leave reason"></textarea>
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" class="secondary-button" data-close>Cancel</button>
          <button class="primary-button">Submit Request</button>
        </div>
      </form>
    </div>`
}

/* ── Submit leave request (called from pos.js / workshop.js submit handler) ── */
export async function submitLeaveRequest(sess, formData) {
  dlog('EMS.submitLeaveRequest', `ENTRY employee=${sess.employee?.name}`)
  const from = formData.from_date
  const to   = formData.to_date
  if (!from || !to) return { ok: false, error: 'Please select dates.' }
  if (new Date(to) < new Date(from)) return { ok: false, error: 'To date must be after from date.' }

  const { error } = await sb.from('leaves').insert({
    employee_id: sess.employee.id,
    leave_type:  formData.leave_type || 'Casual',
    from_date:   from,
    to_date:     to,
    reason:      formData.reason || '',
    status:      'Pending',
  })
  if (error) { dlog('EMS.submitLeaveRequest', `FAILED: ${error.message}`); return { ok: false, error: error.message } }
  dlog('EMS.submitLeaveRequest', 'SUCCEEDED')
  return { ok: true }
}

/* ════════════════════════════════════════════════════════════════
   CLOCK OUT BUTTON HTML — inject into topbar for non-owner roles
════════════════════════════════════════════════════════════════ */
export function clockOutButtonHTML() {
  return `<button class="secondary-button" data-action="ems-clock-out"
    style="font-size:12px">🕐 Clock Out</button>`
}

export async function handleClockOut(sess, onComplete) {
  dlog('EMS.handleClockOut', `ENTRY employee=${sess.employee?.name}`)
  if (!confirm('Clock out and end your shift?')) { dlog('EMS.handleClockOut', 'user cancelled confirm()'); return }
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await sb.from('attendance')
    .select('id')
    .eq('employee_id', sess.employee.id)
    .eq('date', today)
    .is('clock_out', null)
    .limit(1)
  if (data?.[0]) {
    await sb.from('attendance')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', data[0].id)
  }
  dlog('EMS.handleClockOut', 'DONE -- calling onComplete()')
  onComplete && onComplete()
}
