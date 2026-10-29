import {withPrintAttribution} from '../../../print/presentation.js'
import { escapeHTML } from "../../../html.js"
/* ═══════════════════════════════════════════════════════════════════
   features/admin/ems/index.js
   Admin-exclusive EMS dashboard -- attendance/leave/salary tabs,
   salary slip generation, and the mega click/submit handler covering
   all three. Verified by actual caller: loadEMSData/emsView/
   attachEMSEvents/generateSalarySlip/buildSalarySlipHTML
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
  sb, state, CFG, money, moneyHTML, can,
  _clearSession, showBlockingError, showToast,
} from '../../../shared.js'
import { navigate } from '../../../router.js'
import { dlog, dstack } from '../../../debuglog.js'
import {onPrivateReset,authorityIdentity} from '../../../ui-authority.js'
import {settleRead} from '../../../read-state.js'
import {captureView,ViewExpired,listenOwned,viewAwait} from '../../../ui-lifecycle.js'
import {readPage,readComplete,pageControls,searchColumns} from '../../../bounded-read.js'

let SESSION         = {}
let _eventsAttached = false
let emsController=null
const pendingEMSActions=new Set()
const ownsEMS=()=>!!emsController&&emsController.isCurrent()&&window.location.pathname==='/admin/ems'&&can('ems',state.role)&&state.role===emsController.sess.employee?.role

const emsState = {
  tab:              'attendance',  // attendance | leaves | salary | slips
  attendanceFilter: '',
  leaveFilter:      'Pending',     // Pending | Approved | Rejected | all
  selectedEmployee: null,
  selectedMonth:    new Date().getMonth() + 1,
  selectedYear:     new Date().getFullYear(),
  offset:0,
  search:'',
  slipOffset:0,
}
const initialEMS={...emsState}
onPrivateReset(()=>{SESSION={};emsController=null;Object.assign(emsState,initialEMS)})

/* ════════════════════════════════════════════════════════════════
   CLOCK-IN GATE
   Call checkClockIn(SESSION, CFG, onProceed) before any view loads.
   If gate is needed it renders the clock-in screen.
   If not needed it calls onProceed() immediately.
════════════════════════════════════════════════════════════════ */
export async function loadEMSData(options={}) {
  const current=captureView()
  const today = new Date().toISOString().slice(0, 10)
  const tab=emsState.tab,offset=emsState.offset,search=emsState.search,slipOffset=emsState.slipOffset
  const owned=()=>current()&&tab===emsState.tab&&offset===emsState.offset&&search===emsState.search&&slipOffset===emsState.slipOffset
  const data={employees:[],attendance:[],leaves:[],salaryConfigs:[],slips:[],liveNow:options.previous?.liveNow??null,page:null,tab}
  const live=options.tabOnly?Promise.resolve({data:data.liveNow}):settleRead(readComplete(()=>sb.from('attendance')
    .select('id,employee_id,date,clock_in,clock_out,employees(name,role)',{count:'exact'})
    .eq('date',today).is('clock_out',null).order('id'),{current:owned}))
  if(!options.liveOnly){
    const query=()=>{
      if(tab==='salary'||tab==='slips')return searchColumns(sb.from('employees').select('id,name,role,status,email',{count:'exact'}).eq('status','Active'),['name','email'],search).order('name').order('id')
      let builder=sb.from(tab==='attendance'?'attendance':'leaves')
        .select(tab==='attendance'?`id,employee_id,date,clock_in,clock_out,employees${search?'!inner':''}(name,role)`:`*,employees:employees!leaves_employee_id_fkey${search?'!inner':''}(name,role)`,{count:'exact'})
      if(search)builder=builder.ilike('employees.name','%'+search.replace(/[\\%_]/g,'\\$&')+'%')
      return builder.order(tab==='attendance'?'clock_in':'created_at',{ascending:false}).order('id',{ascending:false})
    }
    const page=await readPage(query,{offset,size:offset?options.previous?.page?.size||25:25,current:owned})
    if(!owned())throw new ViewExpired()
    data.page=page
    if(tab==='attendance')data.attendance=page.data
    if(tab==='leaves')data.leaves=page.data
    if(tab==='salary'||tab==='slips'){
      data.employees=page.data
      if(tab==='salary'&&page.data.length)data.salaryConfigs=(await readComplete(()=>sb.from('salary_config').select('*,employees(name,role)',{count:'exact'}).in('employee_id',page.data.map(e=>e.id)).order('id'),{current:owned})).data
      if(tab==='slips'){
        const slips=await readPage(()=>sb.from('salary_slips').select('*,employees(name)',{count:'exact'}).order('year',{ascending:false}).order('month',{ascending:false}).order('id',{ascending:false}),{offset:slipOffset,size:slipOffset?options.previous?.slipPage?.size||25:25,current:owned})
        data.slips=slips.data;data.slipPage=slips
      }
    }
  }else Object.assign(data,options.previous)
  const result=await live
  if(!owned())throw new ViewExpired()
  data.liveNow=result.error?null:result.data
  return data
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

      <div class="toolbar"><label>Search all ${emsState.tab==='salary'||emsState.tab==='slips'?'active employees':'matching history'} by employee name<input class="search" data-ems-server-search value="${escapeHTML(emsState.search)}"></label><button class="secondary-button" data-ems-run-search>Search</button></div>
      ${pageControls(emsData.page,'data-ems-page')}
      <p class="muted">History and directory pages are separate from complete payroll-period reads. Presentation filters below apply to this page.</p>

      <!-- Tab content -->
      ${emsState.tab === 'attendance' ? attendanceTab(emsData) : ''}
      ${emsState.tab === 'leaves'     ? leavesTab(emsData)     : ''}
      ${emsState.tab === 'salary'     ? salaryTab(emsData)     : ''}
      ${emsState.tab === 'slips'      ? slipsTab(emsData)      : ''}
    </div>`
}

/* ── Live banner ── */
function liveBanner(liveNow) {
  if(!Array.isArray(liveNow))return `<div role="alert">Current attendance indicator unavailable.<button class="secondary-button" data-ems-retry-live>Retry current attendance</button></div>`
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
              <strong>${escapeHTML(r.employees?.name || '—')}</strong>
              <span class="muted">${escapeHTML(r.employees?.role || '')}</span>
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
      <input class="search" placeholder="Filter this page by employee…"
        data-ems-attendance-filter value="${escapeHTML(emsState.attendanceFilter)}"
        style="max-width:300px">

      ${Object.keys(byDate).length === 0
        ? `<div class="empty">No attendance matches on this page.</div>`
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
                  <td><strong>${escapeHTML(r.employees?.name || '—')}</strong></td>
                  <td>${escapeHTML(r.employees?.role || '—')}</td>
                  <td>${inTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
                  <td>${outTime ? outTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '<span class="badge warn">Active</span>'}</td>
                  <td>${escapeHTML(durStr)}</td>
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
                  <strong>${escapeHTML(emp.name || '—')}</strong>
                  <span class="muted" style="font-size:12px;margin-left:6px">${escapeHTML(emp.role || '')}</span><br>
                  <span class="muted" style="font-size:12px">
                    ${escapeHTML(l.leave_type)} · ${escapeHTML(from)} → ${escapeHTML(to)} · ${days} day${days!==1?'s':''}
                  </span>
                </div>
                <span class="badge ${badge}">${escapeHTML(l.status)}</span>
              </div>
              ${l.reason ? `<p style="font-size:13px">${escapeHTML(l.reason)}</p>` : ''}
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
                  ${escapeHTML(l.status)} ${l.reviewed_at
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
                <strong>${escapeHTML(emp.name)}</strong>
                <span class="muted" style="font-size:12px;margin-left:6px">${escapeHTML(emp.role)}</span>
              </div>
              ${config ? `<span class="badge good">Configured</span>` : `<span class="badge warn">Not set</span>`}
            </div>
            <form class="rs-responsive-form" data-form="salary-config" data-emp-id="${emp.id}"
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
        <form class="rs-responsive-form" data-form="generate-slip"
          style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end">
          <label class="field" style="margin:0">
            <span style="font-size:12px">Employee</span>
            <select name="employee_id">
              ${employees.map(e =>
                `<option value="${e.id}" ${emsState.selectedEmployee===e.id?'selected':''}>${escapeHTML(e.name)}</option>`
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
      ${pageControls(emsData.slipPage,'data-ems-slip-page')}
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
                <td><strong>${escapeHTML(s.employees?.name || '—')}</strong></td>
                <td>${months[s.month-1]} ${s.year}</td>
                <td>${s.days_present}</td>
                <td>${s.leaves_approved}</td>
                <td>${s.days_absent}</td>
                <td><strong>${moneyHTML(s.net_salary)}</strong></td>
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
  const current=captureView()
  // Get salary config
  const { data: config,error:configError } = await sb.from('salary_config')
    .select('*').eq('employee_id', employeeId).single()
  if(!current())throw new ViewExpired()
  if(configError)return {ok:false,error:'Salary configuration is unavailable.'}
  if (!config) return { ok: false, error: 'No salary configuration found for this employee. Please set it in the Salary tab first.' }

  // Calculate working days in the month
  const daysInMonth  = new Date(year, month, 0).getDate()
  const workingDays  = countWorkingDays(year, month)

  // Get attendance for this month
  const monthStr = `${year}-${String(month).padStart(2,'0')}`
  const { data: attendance,error:attendanceError } = await settleRead(readComplete(()=>sb.from('attendance')
    .select('*',{count:'exact'})
    .eq('employee_id', employeeId)
    .gte('date', `${escapeHTML(monthStr)}-01`)
    .lte('date', `${escapeHTML(monthStr)}-${daysInMonth}`).order('id'),{current}))
  if(!current())throw new ViewExpired()
  if(attendanceError||!Array.isArray(attendance))return {ok:false,error:'Required attendance is unavailable; salary was not generated.'}

  const daysPresent = (attendance || []).filter(r => r.clock_out).length

  // Get approved leaves for this month
  const { data: leaves,error:leavesError } = await settleRead(readComplete(()=>sb.from('leaves')
    .select('*',{count:'exact'})
    .eq('employee_id', employeeId)
    .eq('status', 'Approved')
    .lte('from_date',`${monthStr}-${daysInMonth}`).gte('to_date',`${monthStr}-01`).order('id'),{current}))
  if(!current())throw new ViewExpired()
  if(leavesError||!Array.isArray(leaves))return {ok:false,error:'Required leave history is unavailable; salary was not generated.'}

  const leaveDays = (leaves || []).reduce((total, l) => {
    const from = new Date(Math.max(new Date(l.from_date), new Date(`${escapeHTML(monthStr)}-01`)))
    const to   = new Date(Math.min(new Date(l.to_date),   new Date(`${escapeHTML(monthStr)}-${daysInMonth}`)))
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
  return withPrintAttribution(`
    <div class="c b lg">${escapeHTML(shopName || 'RetailOS')}</div>
    <div class="ln"></div>
    <div class="c b">SALARY SLIP</div>
    <div class="c">${months[slip.month-1]} ${slip.year}</div>
    <div class="ln"></div>
    <div class="row"><span>Employee</span><span>${escapeHTML(employeeName)}</span></div>
    <div class="row"><span>Salary Type</span><span>${escapeHTML(slip.salary_type)}</span></div>
    <div class="row"><span>Rate</span><span>${moneyHTML(slip.rate)}${slip.salary_type==='Daily'?' / day':' / month'}</span></div>
    <div class="ln"></div>
    <div class="row"><span>Working Days</span><span>${slip.days_in_month}</span></div>
    <div class="row"><span>Days Present</span><span>${slip.days_present}</span></div>
    <div class="row"><span>Approved Leaves</span><span>${slip.leaves_approved}</span></div>
    <div class="row"><span>Days Absent</span><span>${slip.days_absent}</span></div>
    <div class="ln"></div>
    <div class="row"><span>Gross Salary</span><span>${moneyHTML(slip.gross_salary)}</span></div>
    ${slip.deductions > 0 ? `<div class="row"><span>Deductions</span><span>${moneyHTML(slip.deductions)}</span></div>` : ''}
    <div class="row b lg"><span>NET SALARY</span><span>${moneyHTML(slip.net_salary)}</span></div>
    <div class="ln"></div>
    <div class="c sm">Generated ${new Date(slip.generated_at).toLocaleDateString()}</div>`)
}

/* ════════════════════════════════════════════════════════════════
   EMS EVENT HANDLERS
   Call attachEMSEvents(app, emsData, reloadFn, sess) from admin.js
════════════════════════════════════════════════════════════════ */
export function attachEMSEvents(app, getEMSData, reloadFn, sess, isCurrent=captureView(),renderFn=()=>{}) {
  emsController={getEMSData,reloadFn,renderFn,sess,isCurrent,busy:pendingEMSActions}
  SESSION = sess
  if (_eventsAttached) return
  _eventsAttached = true
  SESSION = sess

  listenOwned(app,'click',ownsEMS,async (e,eventCurrent) => {

    const controller=emsController,{getEMSData,reloadFn,sess}=controller,current=()=>eventCurrent()&&emsController===controller
    if (window.location.pathname !== '/admin/ems' || !can('ems', state.role)) return
    const el = e.target.closest(
      '[data-ems-tab],[data-ems-leave-filter],[data-ems-leave-action],[data-print-slip],[data-ems-page],[data-ems-slip-page],[data-ems-run-search],[data-ems-retry-live]'
    )
    if (!el) return
    if(el.dataset.emsRetryLive!==undefined){await viewAwait(current,()=>reloadFn({liveOnly:true}));return}
    if(el.dataset.emsRunSearch!==undefined){emsState.offset=0;await viewAwait(current,()=>reloadFn({tabOnly:true}));return}
    if(el.dataset.emsPage){const page=getEMSData().page;if(page){emsState.offset=el.dataset.emsPage==='next'?page.nextOffset:Math.max(0,page.offset-page.size);await viewAwait(current,()=>reloadFn({tabOnly:true}))}return}
    if(el.dataset.emsSlipPage){const page=getEMSData().slipPage;if(page){emsState.slipOffset=el.dataset.emsSlipPage==='next'?page.nextOffset:Math.max(0,page.offset-page.size);await viewAwait(current,()=>reloadFn({tabOnly:true}))}return}

    if (el.dataset.emsTab) {
      emsState.tab = el.dataset.emsTab
      emsState.offset=0;emsState.search='';emsState.slipOffset=0
      await viewAwait(current,()=>reloadFn()); return
    }

    if (el.dataset.emsLeaveFilter) {
      emsState.leaveFilter = el.dataset.emsLeaveFilter
      controller.renderFn();return
    }

    if (el.dataset.emsLeaveAction) {
      const leaveId = Number(el.dataset.leaveId)
      const action  = el.dataset.emsLeaveAction
      const { error } = await sb.from('leaves').update({
        status:      action,
        reviewed_by: sess.employee?.id || null,
        reviewed_at: new Date().toISOString(),
      }).eq('id', leaveId)
      if(!current())return
      if (error) { showBlockingError('Error: ' + error.message); return }
      await reloadFn(); return
    }

    if (el.dataset.printSlip) {
      const slipId   = Number(el.dataset.printSlip)
      const emsData  = getEMSData()
      const selected=await sb.from('salary_slips').select('*,employees(name)').eq('id',slipId).single()
      if(!current())return
      const slip=selected.data
      if(selected.error||!slip){showBlockingError('Complete selected salary slip unavailable. Retry reads.');return}
      const { printThermal } = await import('../../../print/print.js')
      if(!current())return
      printThermal(buildSalarySlipHTML(slip, slip.employees?.name || '—', CFG.shop_name))
      return
    }
  },error=>showBlockingError(error.message))

  listenOwned(app,'input',ownsEMS,async (e,eventCurrent) => {
    const controller=emsController
    if (window.location.pathname !== '/admin/ems' || !can('ems', state.role)) return
    const t = e.target
    if (t.dataset.emsAttendanceFilter !== undefined) {
      emsState.attendanceFilter=t.value
      if(eventCurrent()&&emsController===controller)controller.renderFn()
    }
    if(t.dataset.emsServerSearch!==undefined)emsState.search=t.value
  },error=>showBlockingError(error.message))

  listenOwned(app,'submit',ownsEMS,async (e,eventCurrent) => {

    const controller=emsController,{reloadFn,sess}=controller,current=()=>eventCurrent()&&emsController===controller
    if (window.location.pathname !== '/admin/ems' || !can('ems', state.role)) return
    const form = e.target
    if (!form.dataset.form) return
    e.preventDefault()
    const data = Object.fromEntries(new FormData(form).entries())

    if (form.dataset.form === 'salary-config') {
      const empId = Number(form.dataset.empId)
      if (!data.rate || Number(data.rate) <= 0) { showBlockingError('Enter a valid rate.'); return }
      const { error } = await sb.from('salary_config').upsert({
        employee_id:    empId,
        salary_type:    data.salary_type,
        rate:           Number(data.rate),
        effective_from: new Date().toISOString().slice(0,10),
      }, { onConflict: 'employee_id' })
      if(!current())return
      if (error) { showBlockingError('Error: ' + error.message); return }
      await reloadFn(); return
    }

    if (form.dataset.form === 'generate-slip') {
      const empId = Number(data.employee_id)
      const month = Number(data.month)
      const year  = Number(data.year)
      if (!empId || !month || !year) { showBlockingError('Please fill all fields.'); return }
      const busyKey=`${authorityIdentity()}:${empId}:${month}:${year}`
      if(controller.busy.has(busyKey))return
      controller.busy.add(busyKey)
      const btn = form.querySelector('button[type="submit"]') || form.querySelector('button')
      if (btn) { btn.disabled = true; btn.textContent = 'Generating…' }
      let result
      try{result=await generateSalarySlip(empId, month, year, sess.employee?.id)}
      catch(error){if(!current())return;result={ok:false,error:'Salary outcome is unconfirmed. Review the original employee/month before retrying.'}}
      finally{controller.busy.delete(busyKey);if(current()&&btn){btn.disabled=false;btn.textContent='Generate'}}
      if(!current())return
      if (btn) { btn.disabled = false; btn.textContent = 'Generate' }
      if (!result.ok) { showBlockingError('Error: ' + result.error); return }
      showToast('Salary slip generated successfully.', 'success')
      await reloadFn(); return
    }
  },error=>showBlockingError(error.message))
}
