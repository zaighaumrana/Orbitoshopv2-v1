/* ═══════════════════════════════════════════════════════════════════
   features/admin/ems/index.js
   Admin-exclusive EMS dashboard -- attendance/leave/salary tabs,
   salary slip generation, and the mega click/submit handler covering
   all three. Verified by actual caller: loadEMSData/emsView/
   attachEMSEvents/resetEMSEvents/generateSalarySlip/buildSalarySlipHTML
   are called only from admin.js.

   The shared clock-in gate (checkClockIn, called from main.js) and the
   POS+Workshop-shared leave/clock-out functions live in
   features/ems/index.js instead -- confirmed zero cross-reference
   between the two halves before splitting.

   NOT YET SPLIT further: attachEMSEvents() (87 lines) still mixes
   attendance+leave+salary action handling together, the same shape of
   problem admin.js's own attachEvents() has at a larger scale. Real
   follow-up work if this file needs to shrink further later.

   SESSION here is a private module variable, independently declared
   from the copy in features/ems/index.js -- confirmed safe (see that
   file's header comment for why).
═══════════════════════════════════════════════════════════════════ */
import {
  sb, state, CFG, money,
  _clearSession, showToast,
} from '../../../shared.js'
import { navigate } from '../../../router.js'
import { dlog, dstack } from '../../../debuglog.js'

let SESSION         = {}
let _eventsAttached = false

const emsState = {
  tab:              'attendance',  // attendance | leaves | salary | slips
  attendanceFilter: '',
  leaveFilter:      'Pending',     // Pending | Approved | Rejected | all
  selectedEmployee: null,
  selectedMonth:    new Date().getMonth() + 1,
  selectedYear:     new Date().getFullYear(),
}

/* ════════════════════════════════════════════════════════════════
   CLOCK-IN GATE
   Call checkClockIn(SESSION, CFG, onProceed) before any view loads.
   If gate is needed it renders the clock-in screen.
   If not needed it calls onProceed() immediately.
════════════════════════════════════════════════════════════════ */
export async function loadEMSData() {
  const today = new Date().toISOString().slice(0, 10)
  const [employees, attendance, leaves, salaryConfigs, slips] = await Promise.all([
    sb.from('employees').select('id, name, role, status, email').order('name'),
    sb.from('attendance').select('*, employees(name, role)')
      .order('clock_in', { ascending: false }).limit(200),
    sb.from('leaves').select('*, employees!leaves_employee_id_fkey(name, role)')
      .order('created_at', { ascending: false }),
    sb.from('salary_config').select('*, employees(name, role)'),
    sb.from('salary_slips').select('*, employees(name)').order('year', { ascending: false }).order('month', { ascending: false }),
  ])

  // Who is live clocked in right now
  const { data: liveNow } = await sb.from('attendance')
    .select('*, employees(name, role)')
    .eq('date', today)
    .is('clock_out', null)

  return {
    employees:     employees.data    || [],
    attendance:    attendance.data   || [],
    leaves:        leaves.data       || [],
    salaryConfigs: salaryConfigs.data|| [],
    slips:         slips.data        || [],
    liveNow:       liveNow           || [],
  }
}

export function emsView(emsData, sess) {
  SESSION = sess
  const tabs = [
    ['attendance', '🕐 Attendance'],
    ['leaves',     '📋 Leaves'],
    ['salary',     '💰 Salary'],
    ['slips',      '📄 Slips'],
  ]
  return `
    <div style="display:grid;gap:16px">
      <!-- Live now banner -->
      ${liveBanner(emsData.liveNow)}

      <!-- Tabs -->
      <div class="settings-tabs">
        ${tabs.map(([k,l]) => `
          <button class="settings-tab ${emsState.tab === k ? 'active' : ''}"
            data-ems-tab="${k}">${l}</button>`).join('')}
      </div>

      <!-- Tab content -->
      ${emsState.tab === 'attendance' ? attendanceTab(emsData) : ''}
      ${emsState.tab === 'leaves'     ? leavesTab(emsData)     : ''}
      ${emsState.tab === 'salary'     ? salaryTab(emsData)     : ''}
      ${emsState.tab === 'slips'      ? slipsTab(emsData)      : ''}
    </div>`
}

/* ── Live banner ── */
function liveBanner(liveNow) {
  if (!liveNow.length) return `
    <div style="padding:12px 16px;background:var(--surface-2);
                border-radius:10px;font-size:13px;color:var(--muted)">
      No employees currently clocked in.
    </div>`

  return `
    <div style="padding:12px 16px;background:color-mix(in srgb,var(--success) 10%,var(--surface));
                border:1px solid color-mix(in srgb,var(--success) 20%,var(--border));
                border-radius:10px">
      <p style="font-size:12px;font-weight:600;color:var(--muted);
                text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">
        Currently On Shift
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${liveNow.map(r => {
          const since   = new Date(r.clock_in)
          const elapsed = Math.floor((Date.now() - since) / 60000)
          const dur     = elapsed >= 60
            ? `${Math.floor(elapsed/60)}h ${elapsed%60}m`
            : `${elapsed}m`
          return `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;
                        background:var(--surface);border-radius:8px;font-size:13px">
              <span style="width:8px;height:8px;background:var(--success);
                           border-radius:50%;flex-shrink:0"></span>
              <strong>${r.employees?.name || '—'}</strong>
              <span class="muted">${r.employees?.role || ''}</span>
              <span class="muted">· ${dur}</span>
            </div>`
        }).join('')}
      </div>
    </div>`
}

/* ── Attendance tab ── */
function attendanceTab(emsData) {
  const search  = emsState.attendanceFilter.toLowerCase()
  const records = emsData.attendance.filter(r =>
    !search || (r.employees?.name || '').toLowerCase().includes(search)
  )

  // Group by date
  const byDate = {}
  records.forEach(r => {
    const d = (r.date || r.clock_in?.slice(0,10) || '—')
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(r)
  })

  return `
    <div style="display:grid;gap:12px">
      <input class="search" placeholder="Search employee…"
        data-ems-attendance-filter value="${emsState.attendanceFilter}"
        style="max-width:300px">

      ${Object.keys(byDate).length === 0
        ? `<div class="empty">No attendance records yet.</div>`
        : Object.entries(byDate).map(([date, rows]) => `
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:10px 14px;background:var(--surface-2);
                      font-size:12px;font-weight:600;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.5px">
            ${new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
              weekday:'long', day:'numeric', month:'long', year:'numeric'
            })}
          </div>
          <div class="table-wrap"><table>
            <thead><tr>
              <th>Employee</th><th>Role</th>
              <th>Clock In</th><th>Clock Out</th>
              <th>Duration</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => {
                const inTime  = new Date(r.clock_in)
                const outTime = r.clock_out ? new Date(r.clock_out) : null
                const durMin  = outTime ? Math.floor((outTime - inTime) / 60000) : null
                const durStr  = durMin !== null
                  ? `${Math.floor(durMin/60)}h ${durMin%60}m`
                  : '—'
                return `<tr>
                  <td><strong>${r.employees?.name || '—'}</strong></td>
                  <td>${r.employees?.role || '—'}</td>
                  <td>${inTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
                  <td>${outTime ? outTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '<span class="badge warn">Active</span>'}</td>
                  <td>${durStr}</td>
                  <td>${outTime ? '<span class="badge good">Complete</span>' : '<span class="badge warn">On Shift</span>'}</td>
                </tr>`
              }).join('')}
            </tbody>
          </table></div>
        </div>`).join('')}
    </div>`
}

/* ── Leaves tab ── */
function leavesTab(emsData) {
  const filters = ['Pending','Approved','Rejected','all']
  const leaves  = emsData.leaves.filter(l =>
    emsState.leaveFilter === 'all' || l.status === emsState.leaveFilter
  )

  return `
    <div style="display:grid;gap:12px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${filters.map(f => `
          <button class="${emsState.leaveFilter === f ? 'primary-button' : 'secondary-button'}"
            style="font-size:12px;padding:5px 14px" data-ems-leave-filter="${f}">
            ${f === 'all' ? 'All' : f}
            (${f === 'all' ? emsData.leaves.length : emsData.leaves.filter(l=>l.status===f).length})
          </button>`).join('')}
      </div>

      ${leaves.length === 0
        ? `<div class="empty">No leave requests found.</div>`
        : leaves.map(l => {
          const emp    = l.employees || {}
          const from   = new Date(l.from_date + 'T00:00:00').toLocaleDateString()
          const to     = new Date(l.to_date   + 'T00:00:00').toLocaleDateString()
          const days   = Math.ceil((new Date(l.to_date) - new Date(l.from_date)) / 86400000) + 1
          const badge  = l.status === 'Approved' ? 'good' : l.status === 'Rejected' ? 'bad' : 'warn'
          return `
            <div class="card" style="display:grid;gap:10px">
              <div style="display:flex;justify-content:space-between;align-items:start;gap:12px">
                <div>
                  <strong>${emp.name || '—'}</strong>
                  <span class="muted" style="font-size:12px;margin-left:6px">${emp.role || ''}</span><br>
                  <span class="muted" style="font-size:12px">
                    ${l.leave_type} · ${from} → ${to} · ${days} day${days!==1?'s':''}
                  </span>
                </div>
                <span class="badge ${badge}">${l.status}</span>
              </div>
              ${l.reason ? `<p style="font-size:13px">${l.reason}</p>` : ''}
              ${l.status === 'Pending' ? `
                <div style="display:flex;gap:8px">
                  <button class="primary-button" style="font-size:12px;padding:6px 14px"
                    data-ems-leave-action="Approved" data-leave-id="${l.id}">
                    ✓ Approve
                  </button>
                  <button class="secondary-button" style="font-size:12px;padding:6px 14px;color:var(--danger)"
                    data-ems-leave-action="Rejected" data-leave-id="${l.id}">
                    ✗ Reject
                  </button>
                </div>` : `
                <p class="muted" style="font-size:12px">
                  ${l.status} ${l.reviewed_at
                    ? '· ' + new Date(l.reviewed_at).toLocaleDateString() : ''}
                </p>`}
            </div>`
        }).join('')}
    </div>`
}

/* ── Salary config tab ── */
function salaryTab(emsData) {
  const employees = (emsData.employees || []).filter(e =>
    e.role !== 'Business Owner' && e.status === 'Active'
  )

  return `
    <div style="display:grid;gap:12px">
      <p class="muted" style="font-size:13px">
        Set salary type and rate per employee. Used when generating monthly salary slips.
      </p>
      ${employees.map(emp => {
        const config = (emsData.salaryConfigs || []).find(c => c.employee_id === emp.id)
        return `
          <div class="card" style="display:grid;gap:12px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <strong>${emp.name}</strong>
                <span class="muted" style="font-size:12px;margin-left:6px">${emp.role}</span>
              </div>
              ${config ? `<span class="badge good">Configured</span>` : `<span class="badge warn">Not set</span>`}
            </div>
            <form data-form="salary-config" data-emp-id="${emp.id}"
              style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end">
              <label class="field" style="margin:0">
                <span style="font-size:12px">Salary Type</span>
                <select name="salary_type">
                  <option ${config?.salary_type==='Monthly'?'selected':''}>Monthly</option>
                  <option ${config?.salary_type==='Daily'?'selected':''}>Daily</option>
                </select>
              </label>
              <label class="field" style="margin:0">
                <span style="font-size:12px">Rate (Rs.)</span>
                <input name="rate" type="number" step="any" min="0"
                  value="${config?.rate || ''}" placeholder="e.g. 25000">
              </label>
              <button class="primary-button" style="padding:9px 14px;font-size:13px">
                Save
              </button>
            </form>
          </div>`
      }).join('')}
    </div>`
}

/* ── Salary slips tab ── */
function slipsTab(emsData) {
  const employees = (emsData.employees || []).filter(e =>
    e.role !== 'Business Owner' && e.status === 'Active'
  )
  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ]

  return `
    <div style="display:grid;gap:16px">
      <!-- Generate new slip -->
      <div class="card" style="display:grid;gap:12px">
        <h2 style="font-size:15px">Generate Salary Slip</h2>
        <form data-form="generate-slip"
          style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end">
          <label class="field" style="margin:0">
            <span style="font-size:12px">Employee</span>
            <select name="employee_id">
              ${employees.map(e =>
                `<option value="${e.id}" ${emsState.selectedEmployee===e.id?'selected':''}>${e.name}</option>`
              ).join('')}
            </select>
          </label>
          <label class="field" style="margin:0">
            <span style="font-size:12px">Month</span>
            <select name="month">
              ${months.map((m,i) =>
                `<option value="${i+1}" ${emsState.selectedMonth===i+1?'selected':''}>${m}</option>`
              ).join('')}
            </select>
          </label>
          <label class="field" style="margin:0">
            <span style="font-size:12px">Year</span>
            <input name="year" type="number" step="1" min="2020"
              value="${emsState.selectedYear}" style="width:100%">
          </label>
          <button class="primary-button" style="padding:9px 14px;font-size:13px;white-space:nowrap">
            Generate
          </button>
        </form>
      </div>

      <!-- Existing slips -->
      ${emsData.slips.length ? `
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:10px 14px;background:var(--surface-2);
                      font-size:12px;font-weight:600;color:var(--muted);
                      text-transform:uppercase;letter-spacing:.5px">
            Generated Slips
          </div>
          <div class="table-wrap"><table>
            <thead><tr>
              <th>Employee</th><th>Period</th><th>Days Present</th>
              <th>Leaves</th><th>Absent</th><th>Net Salary</th><th></th>
            </tr></thead>
            <tbody>
              ${emsData.slips.map(s => `<tr>
                <td><strong>${s.employees?.name || '—'}</strong></td>
                <td>${months[s.month-1]} ${s.year}</td>
                <td>${s.days_present}</td>
                <td>${s.leaves_approved}</td>
                <td>${s.days_absent}</td>
                <td><strong>${money(s.net_salary)}</strong></td>
                <td>
                  <button class="secondary-button" style="font-size:12px;padding:4px 10px"
                    data-print-slip="${s.id}">Print</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>` : `
        <div class="empty">No salary slips generated yet.</div>`}
    </div>`
}

/* ════════════════════════════════════════════════════════════════
   LEAVE REQUEST — rendered in the employee-facing view (POS/Workshop)
   Call renderLeaveRequest(sess, onDone) to show the form
════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════
   SALARY SLIP GENERATOR
════════════════════════════════════════════════════════════════ */
export async function generateSalarySlip(employeeId, month, year, generatedBy) {
  // Get salary config
  const { data: config } = await sb.from('salary_config')
    .select('*').eq('employee_id', employeeId).single()
  if (!config) return { ok: false, error: 'No salary configuration found for this employee. Please set it in the Salary tab first.' }

  // Calculate working days in the month
  const daysInMonth  = new Date(year, month, 0).getDate()
  const workingDays  = countWorkingDays(year, month)

  // Get attendance for this month
  const monthStr = `${year}-${String(month).padStart(2,'0')}`
  const { data: attendance } = await sb.from('attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('date', `${monthStr}-01`)
    .lte('date', `${monthStr}-${daysInMonth}`)

  const daysPresent = (attendance || []).filter(r => r.clock_out).length

  // Get approved leaves for this month
  const { data: leaves } = await sb.from('leaves')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('status', 'Approved')
    .or(`from_date.gte.${monthStr}-01,to_date.lte.${monthStr}-${daysInMonth}`)

  const leaveDays = (leaves || []).reduce((total, l) => {
    const from = new Date(Math.max(new Date(l.from_date), new Date(`${monthStr}-01`)))
    const to   = new Date(Math.min(new Date(l.to_date),   new Date(`${monthStr}-${daysInMonth}`)))
    return total + Math.max(0, Math.ceil((to - from) / 86400000) + 1)
  }, 0)

  const daysAbsent = Math.max(0, workingDays - daysPresent - leaveDays)

  // Calculate salary
  let gross = 0
  if (config.salary_type === 'Monthly') {
    const dailyRate = config.rate / workingDays
    gross = config.rate - (daysAbsent * dailyRate)
  } else {
    // Daily — approved leaves count as paid
    gross = (daysPresent + leaveDays) * config.rate
  }
  gross = Math.max(0, gross)

  // Upsert slip
  const { data: slip, error } = await sb.from('salary_slips').upsert({
    employee_id:     employeeId,
    month,
    year,
    days_in_month:   daysInMonth,
    days_present:    daysPresent,
    days_absent:     daysAbsent,
    leaves_approved: leaveDays,
    salary_type:     config.salary_type,
    rate:            config.rate,
    gross_salary:    gross,
    deductions:      0,
    net_salary:      gross,
    generated_by:    generatedBy,
    generated_at:    new Date().toISOString(),
  }, { onConflict: 'employee_id,month,year' }).select().single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: slip }
}

function countWorkingDays(year, month) {
  let count = 0
  const days = new Date(year, month, 0).getDate()
  for (let d = 1; d <= days; d++) {
    const day = new Date(year, month - 1, d).getDay()
    if (day !== 0) count++ // Exclude Sundays — adjust if needed
  }
  return count
}

/* ════════════════════════════════════════════════════════════════
   SALARY SLIP PRINT
════════════════════════════════════════════════════════════════ */
export function buildSalarySlipHTML(slip, employeeName, shopName) {
  const months = ['January','February','March','April','May','June',
    'July','August','September','October','November','December']
  return `
    <div class="c b lg">${shopName || 'RetailOS'}</div>
    <div class="ln"></div>
    <div class="c b">SALARY SLIP</div>
    <div class="c">${months[slip.month-1]} ${slip.year}</div>
    <div class="ln"></div>
    <div class="row"><span>Employee</span><span>${employeeName}</span></div>
    <div class="row"><span>Salary Type</span><span>${slip.salary_type}</span></div>
    <div class="row"><span>Rate</span><span>${money(slip.rate)}${slip.salary_type==='Daily'?' / day':' / month'}</span></div>
    <div class="ln"></div>
    <div class="row"><span>Working Days</span><span>${slip.days_in_month}</span></div>
    <div class="row"><span>Days Present</span><span>${slip.days_present}</span></div>
    <div class="row"><span>Approved Leaves</span><span>${slip.leaves_approved}</span></div>
    <div class="row"><span>Days Absent</span><span>${slip.days_absent}</span></div>
    <div class="ln"></div>
    <div class="row"><span>Gross Salary</span><span>${money(slip.gross_salary)}</span></div>
    ${slip.deductions > 0 ? `<div class="row"><span>Deductions</span><span>${money(slip.deductions)}</span></div>` : ''}
    <div class="row b lg"><span>NET SALARY</span><span>${money(slip.net_salary)}</span></div>
    <div class="ln"></div>
    <div class="c sm">Generated ${new Date(slip.generated_at).toLocaleDateString()}</div>`
}

/* ════════════════════════════════════════════════════════════════
   EMS EVENT HANDLERS
   Call attachEMSEvents(app, emsData, reloadFn, sess) from admin.js
════════════════════════════════════════════════════════════════ */
export function attachEMSEvents(app, getEMSData, reloadFn, sess) {
  if (_eventsAttached) return
  _eventsAttached = true
  SESSION = sess

  app.addEventListener('click', async e => {
    const el = e.target.closest(
      '[data-ems-tab],[data-ems-leave-filter],[data-ems-leave-action],[data-print-slip]'
    )
    if (!el) return

    if (el.dataset.emsTab) {
      emsState.tab = el.dataset.emsTab
      reloadFn(); return
    }

    if (el.dataset.emsLeaveFilter) {
      emsState.leaveFilter = el.dataset.emsLeaveFilter
      reloadFn(); return
    }

    if (el.dataset.emsLeaveAction) {
      const leaveId = Number(el.dataset.leaveId)
      const action  = el.dataset.emsLeaveAction
      const { error } = await sb.from('leaves').update({
        status:      action,
        reviewed_by: sess.employee?.id || null,
        reviewed_at: new Date().toISOString(),
      }).eq('id', leaveId)
      if (error) { showToast('Error: ' + error.message, 'error'); return }
      await reloadFn(); return
    }

    if (el.dataset.printSlip) {
      const slipId   = Number(el.dataset.printSlip)
      const emsData  = getEMSData()
      const slip     = emsData.slips.find(s => s.id === slipId)
      if (!slip) return
      const { printThermal } = await import('../../../print/print.js')
      printThermal(buildSalarySlipHTML(slip, slip.employees?.name || '—', CFG.shop_name))
      return
    }
  })

  app.addEventListener('input', e => {
    const t = e.target
    if (t.dataset.emsAttendanceFilter !== undefined) {
      emsState.attendanceFilter = t.value; reloadFn()
    }
  })

  app.addEventListener('submit', async e => {
    const form = e.target
    if (!form.dataset.form) return
    e.preventDefault()
    const data = Object.fromEntries(new FormData(form).entries())

    if (form.dataset.form === 'salary-config') {
      const empId = Number(form.dataset.empId)
      if (!data.rate || Number(data.rate) <= 0) { showToast('Enter a valid rate.', 'warning'); return }
      const { error } = await sb.from('salary_config').upsert({
        employee_id:    empId,
        salary_type:    data.salary_type,
        rate:           Number(data.rate),
        effective_from: new Date().toISOString().slice(0,10),
      }, { onConflict: 'employee_id' })
      if (error) { showToast('Error: ' + error.message, 'error'); return }
      await reloadFn(); return
    }

    if (form.dataset.form === 'generate-slip') {
      const empId = Number(data.employee_id)
      const month = Number(data.month)
      const year  = Number(data.year)
      if (!empId || !month || !year) { showToast('Please fill all fields.', 'warning'); return }
      const btn = form.querySelector('button[type="submit"]') || form.querySelector('button')
      if (btn) { btn.disabled = true; btn.textContent = 'Generating…' }
      const result = await generateSalarySlip(empId, month, year, sess.employee?.id)
      if (btn) { btn.disabled = false; btn.textContent = 'Generate' }
      if (!result.ok) { showToast('Error: ' + result.error, 'error'); return }
      showToast('Salary slip generated successfully.', 'success')
      await reloadFn(); return
    }
  })
}

/* Reset events flag when EMS view is unmounted */
export function resetEMSEvents() {
  _eventsAttached = false
}
