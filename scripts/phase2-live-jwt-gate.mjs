// Destructive test harness for the Phase 2 release gate. Prerequisites:
// - the app is running at PHASE2_APP_ORIGIN (default http://127.0.0.1:4173)
// - an isolated Chrome instance exposes CDP at PHASE2_CDP_URL (default :9225)
// - its app tab has a live Business Owner session
//
// The harness creates disposable identities through account-admin, uses real
// Supabase JWTs in a separate worker tab, and deactivates created employees in
// finally. It prints only sanitized checks and identifiers, never credentials.
const DEBUG_URL = process.env.PHASE2_CDP_URL || 'http://127.0.0.1:9225'
const APP_ORIGIN = process.env.PHASE2_APP_ORIGIN || 'http://127.0.0.1:4173'

class CdpClient {
  constructor(socket) {
    this.socket = socket
    this.nextId = 0
    this.pending = new Map()
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      const waiter = this.pending.get(message.id)
      if (!waiter) return
      this.pending.delete(message.id)
      if (message.error) waiter.reject(new Error(message.error.message))
      else waiter.resolve(message.result)
    })
  }

  static async connect(target) {
    const socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    const client = new CdpClient(socket)
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    return client
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(fn, argument = null) {
    const execution = await this.send('Runtime.evaluate', {
      expression: `(${fn.toString()})(${JSON.stringify(argument)})`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (execution.exceptionDetails) {
      throw new Error(execution.exceptionDetails.exception?.description || execution.exceptionDetails.text)
    }
    return execution.result.value
  }

  close() {
    this.socket.close()
  }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const targets = async () => (await (await fetch(`${DEBUG_URL}/json`)).json())
const findOwnerTarget = async () => {
  const all = await targets()
  return all.find(item => item.type === 'page' && item.url.startsWith(APP_ORIGIN))
}
const createWorkerTarget = async () => {
  const url = `${DEBUG_URL}/json/new?${encodeURIComponent(`${APP_ORIGIN}/login`)}`
  return (await (await fetch(url, { method: 'PUT' })).json())
}

async function ownerSetup() {
  const checks = []
  const record = (name, passed) => {
    checks.push({ name, passed: Boolean(passed) })
    if (!passed) throw new Error(name)
  }
  const mod = await import('/src/shared.js')
  const { data: sessionData } = await mod.sb.auth.getSession()
  const session = sessionData?.session
  record('Owner browser session present', Boolean(session))
  const { data: profile, error: profileError } = await mod.sb.from('app_users')
    .select('auth_user_id, email, role, status')
    .eq('auth_user_id', session.user.id)
    .single()
  record('Owner canonical profile verified', !profileError && profile?.role === 'Business Owner' && profile?.status === 'Active')

  const { data: staleEmployees, error: staleError } = await mod.sb.from('employees')
    .select('id')
    .like('name', 'PHASE2 RG %')
    .eq('status', 'Active')
  record('Prior interrupted fixtures enumerated', !staleError)
  for (const employee of staleEmployees || []) {
    const deactivated = await mod.invokeAccountAdmin('update-employee', {
      employeeId: employee.id,
      status: 'Inactive',
    })
    record(`Prior fixture ${employee.id} deactivated`, deactivated.ok === true)
  }

  const entropy = Array.from(crypto.getRandomValues(new Uint32Array(3)))
    .map(value => value.toString(36))
    .join('')
  const tag = `${Date.now().toString(36)}-${entropy}`
  const manager = {
    name: `PHASE2 RG ${tag} Manager`,
    email: `phase2-rg+${tag}-manager@example.com`,
    password: `G9!Manager-${entropy}aZ`,
  }
  const managerCreate = await mod.invokeAccountAdmin('create-employee', {
    ...manager,
    role: 'Manager',
  })
  record('Owner creates Manager through account-admin', managerCreate.ok && Number.isFinite(managerCreate.employeeId))
  manager.employeeId = managerCreate.employeeId

  const ticket = await mod.sb.from('tickets').insert({
    ticket_number: `PHASE2JWT-${tag}`,
    customer_name: 'Phase 2 release gate',
    customer_phone: '0000000000',
    device_brand: 'Test',
    device_model: 'JWT fixture',
    status: 'Pending',
    technician_note: 'phase2-start',
    created_by: 'Phase 2 release gate',
  }).select('id').single()
  record('Owner creates isolated ticket fixture', !ticket.error && Boolean(ticket.data?.id))

  return {
    ok: true,
    checks,
    tag,
    ownerEmail: profile.email,
    manager,
    fixtureTicketId: ticket.data.id,
  }
}

async function authenticateWorker(args) {
  const mod = await import('/src/shared.js')
  const checks = []
  await mod.sb.auth.signOut({ scope: 'local' })
  const signedIn = await mod.sb.auth.signInWithPassword({ email: args.email, password: args.password })
  checks.push({ name: `${args.role} login`, passed: !signedIn.error && Boolean(signedIn.data?.session) })
  if (signedIn.error || !signedIn.data?.session) return { ok: false, stage: 'login', checks }
  const refreshed = await mod.sb.auth.refreshSession()
  checks.push({ name: `${args.role} refresh`, passed: !refreshed.error && Boolean(refreshed.data?.session) })
  if (refreshed.error || !refreshed.data?.session) return { ok: false, stage: 'refresh', checks }
  const current = await mod.loadCurrentSession()
  checks.push({ name: `${args.role} canonical session`, passed: current?.employee?.role === args.role })
  return {
    ok: current?.employee?.role === args.role,
    stage: 'canonical-session',
    authUserId: refreshed.data.session.user.id,
    checks,
  }
}

async function completeEmployeeGate(args) {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  let action = 'not-required'
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (location.pathname === args.expectedPath) {
      return { ok: true, action, path: location.pathname }
    }
    const clockIn = document.getElementById('clockin-btn')
    const proceed = document.getElementById('proceed-btn')
    if (clockIn && action === 'not-required') {
      action = 'clock-in'
      clockIn.click()
    } else if (proceed && action === 'not-required') {
      action = 'proceed'
      proceed.click()
    }
    await wait(500)
  }
  return {
    ok: location.pathname === args.expectedPath,
    action,
    path: location.pathname,
    loginVisible: Boolean(document.getElementById('login-title')),
    clockInVisible: Boolean(document.getElementById('clockin-btn')),
    proceedVisible: Boolean(document.getElementById('proceed-btn')),
  }
}

async function managerTests(args) {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  const checks = []
  let failure = null
  const record = (name, passed) => {
    checks.push({ name, passed: Boolean(passed) })
    if (!passed) throw new Error(name)
  }
  const mod = await import('/src/shared.js')
  const router = await import('/src/router.js')
  const entropy = args.tag.replace(/[^a-z0-9]/gi, '')
  const makeAccount = role => ({
    name: `PHASE2 RG ${args.tag} ${role}`,
    email: `phase2-rg+${args.tag}-${role.toLowerCase()}@example.com`,
    password: `H8!${role}-${entropy}bY`,
  })
  const cashier = makeAccount('Cashier')
  const technician = makeAccount('Technician')
  const deniedManager = makeAccount('ManagerDenied')

  try {
    const { data: sessionData } = await mod.sb.auth.getSession()
    record('Manager login persisted through app bootstrap', Boolean(sessionData?.session))
    const current = await mod.loadCurrentSession()
    record('Manager canonical live JWT session', current?.employee?.role === 'Manager')

    record('Manager dashboard RBAC allowed', mod.can('dashboard', 'Manager'))
    record('Manager Employees module RBAC allowed', mod.can('employees', 'Manager'))
    record('Manager Settings RBAC denied', !mod.can('settings', 'Manager'))
    record('Manager live dashboard route allowed', location.pathname === '/admin/dashboard')
    router.navigate('/admin/employees', { replace: true, force: true })
    await wait(500)
    record('Manager live Employees route allowed', location.pathname === '/admin/employees')
    router.navigate('/admin/settings', { replace: true, force: true })
    await wait(500)
    record('Manager live Settings route denied', location.pathname === '/admin/dashboard')

    const cashierCreate = await mod.invokeAccountAdmin('create-employee', {
      ...cashier,
      role: 'Cashier',
    })
    record('Manager creates Cashier', cashierCreate.ok && Number.isFinite(cashierCreate.employeeId))
    cashier.employeeId = cashierCreate.employeeId

    const cashierEdit = await mod.invokeAccountAdmin('update-employee', {
      employeeId: cashier.employeeId,
      name: `${cashier.name} Edited`,
    })
    record('Manager edits Cashier', cashierEdit.ok)
    cashier.name = `${cashier.name} Edited`
    const cashierDeactivate = await mod.invokeAccountAdmin('update-employee', {
      employeeId: cashier.employeeId,
      status: 'Inactive',
    })
    record('Manager deactivates Cashier', cashierDeactivate.ok)
    const cashierReactivate = await mod.invokeAccountAdmin('update-employee', {
      employeeId: cashier.employeeId,
      status: 'Active',
    })
    record('Manager reactivates Cashier', cashierReactivate.ok)
    const cashierReset = await mod.invokeAccountAdmin('reset-password', {
      email: cashier.email,
      newPassword: `J7!CashierReset-${entropy}cX`,
    })
    record('Manager resets Cashier password', cashierReset.ok)

    const technicianCreate = await mod.invokeAccountAdmin('create-employee', {
      ...technician,
      role: 'Technician',
    })
    record('Manager creates Technician', technicianCreate.ok && Number.isFinite(technicianCreate.employeeId))
    technician.employeeId = technicianCreate.employeeId

    const managerDenied = await mod.invokeAccountAdmin('create-employee', {
      ...deniedManager,
      role: 'Manager',
    })
    record('Manager cannot create Manager', managerDenied.ok === false)
    const promoteManager = await mod.invokeAccountAdmin('update-employee', {
      employeeId: cashier.employeeId,
      role: 'Manager',
    })
    record('Manager cannot promote to Manager', promoteManager.ok === false)
    const promoteOwner = await mod.invokeAccountAdmin('update-employee', {
      employeeId: cashier.employeeId,
      role: 'Business Owner',
    })
    record('Manager cannot promote to Business Owner', promoteOwner.ok === false)
    const resetManager = await mod.invokeAccountAdmin('reset-password', {
      email: args.managerEmail,
      newPassword: `K6!DeniedManager-${entropy}dW`,
    })
    record('Manager cannot reset Manager', resetManager.ok === false)
    const resetOwner = await mod.invokeAccountAdmin('reset-password', {
      email: args.ownerEmail,
      newPassword: `L5!DeniedOwner-${entropy}eV`,
    })
    record('Manager cannot reset Business Owner', resetOwner.ok === false)
    const configDenied = await mod.invokeAccountAdmin('update-config', {
      updates: { shop_name: `PHASE2-DENIED-${args.tag}` },
    })
    record('Manager cannot change Settings through account-admin', configDenied.ok === false)

    const rawConfig = await mod.sb.from('shop_config').select('id').limit(1)
    record('Manager raw shop_config access denied', Boolean(rawConfig.error))
    const directEmployee = await mod.sb.from('employees')
      .update({ name: `PHASE2-DIRECT-DENIED-${args.tag}` })
      .eq('id', args.managerEmployeeId)
      .select('id')
    record('Manager direct employee update denied', Boolean(directEmployee.error))
    const directRole = await mod.sb.from('app_users')
      .update({ role: 'Business Owner' })
      .eq('auth_user_id', sessionData.session.user.id)
      .select('auth_user_id')
    record('Manager direct role escalation denied', Boolean(directRole.error))
    const managerSalary = await mod.sb.from('salary_config').select('id').limit(1)
    record('Manager intended salary-table read allowed', !managerSalary.error)

    await mod.sb.auth.signOut({ scope: 'local' })
    const afterLogout = await mod.sb.auth.getSession()
    record('Manager logout', !afterLogout.data?.session)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  return {
    ok: !failure && checks.every(check => check.passed),
    failure,
    checks,
    cashier,
    technician,
  }
}

async function technicianTests(args) {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  const checks = []
  let failure = null
  const record = (name, passed) => {
    checks.push({ name, passed: Boolean(passed) })
    if (!passed) throw new Error(name)
  }
  const mod = await import('/src/shared.js')
  const router = await import('/src/router.js')
  const deniedAccount = {
    name: `PHASE2 RG ${args.tag} Technician Denied`,
    email: `phase2-rg+${args.tag}-technician-denied@example.com`,
    password: `M4!TechDenied-${args.tag.replace(/[^a-z0-9]/gi, '')}fU`,
  }

  try {
    const { data: sessionData } = await mod.sb.auth.getSession()
    record('Technician login persisted through app bootstrap', Boolean(sessionData?.session))
    const current = await mod.loadCurrentSession()
    record('Technician canonical live JWT session', current?.employee?.role === 'Technician')
    record('Technician Workshop RBAC allowed', mod.can('workshop', 'Technician'))
    record('Technician Admin dashboard RBAC denied', !mod.can('dashboard', 'Technician'))
    record('Technician Employees module RBAC denied', !mod.can('employees', 'Technician'))
    record('Technician POS RBAC denied by current matrix', !mod.can('pos', 'Technician'))
    record('Technician live Workshop route allowed', location.pathname === '/workshop')
    router.navigate('/admin/dashboard', { replace: true, force: true })
    await wait(500)
    record('Technician live Admin route denied', location.pathname === '/workshop')
    router.navigate('/pos', { replace: true, force: true })
    await wait(500)
    record('Technician live POS route denied', location.pathname === '/workshop')

    const employeeManagement = await mod.invokeAccountAdmin('create-employee', {
      ...deniedAccount,
      role: 'Cashier',
    })
    record('Technician employee management denied', employeeManagement.ok === false)
    const directEmployee = await mod.sb.from('employees')
      .update({ name: `PHASE2-TECH-DIRECT-DENIED-${args.tag}` })
      .eq('id', args.technicianEmployeeId)
      .select('id')
    record('Technician direct employee update denied', Boolean(directEmployee.error))
    const salaryConfig = await mod.sb.from('salary_config').select('id').limit(1)
    record(
      'Technician salary_config rows hidden by RLS',
      !salaryConfig.error && salaryConfig.data?.length === 0,
    )
    const salarySlips = await mod.sb.from('salary_slips').select('id').limit(1)
    record(
      'Technician salary_slip rows hidden by RLS',
      !salarySlips.error && salarySlips.data?.length === 0,
    )
    const inventory = await mod.sb.from('inventory').select('id').limit(1)
    record(
      'Technician inventory/POS rows hidden by RLS',
      !inventory.error && inventory.data?.length === 0,
    )
    const employeeScope = await mod.sb.from('employees').select('id')
    record(
      'Technician employee read restricted to self',
      !employeeScope.error && employeeScope.data?.length === 1 && employeeScope.data[0].id === args.technicianEmployeeId,
    )

    const ticketRead = await mod.sb.from('tickets')
      .select('id, technician_note')
      .eq('id', args.fixtureTicketId)
      .single()
    record('Technician ticket read allowed', !ticketRead.error && ticketRead.data?.id === args.fixtureTicketId)
    const ticketUpdate = await mod.sb.from('tickets')
      .update({ technician_note: `phase2-updated-${args.tag}` })
      .eq('id', args.fixtureTicketId)
      .select('id')
      .single()
    record('Technician intended ticket update allowed', !ticketUpdate.error && ticketUpdate.data?.id === args.fixtureTicketId)
    const ticketInsert = await mod.sb.from('tickets').insert({
      ticket_number: `PHASE2JWT-${args.tag}-DENIED`,
      customer_name: 'Phase 2 denied insert',
      customer_phone: '0000000000',
      status: 'Pending',
      created_by: 'Phase 2 release gate',
    }).select('id')
    record('Technician ticket creation denied', Boolean(ticketInsert.error))
    const directRole = await mod.sb.from('app_users')
      .update({ role: 'Manager' })
      .eq('auth_user_id', sessionData.session.user.id)
      .select('auth_user_id')
    record('Technician direct role escalation denied', Boolean(directRole.error))

    await mod.sb.auth.signOut({ scope: 'local' })
    const afterLogout = await mod.sb.auth.getSession()
    record('Technician logout', !afterLogout.data?.session)
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  return { ok: !failure && checks.every(check => check.passed), failure, checks }
}

async function ownerCleanup(args) {
  const mod = await import('/src/shared.js')
  const checks = []
  const { data: sessionData } = await mod.sb.auth.getSession()
  const owner = await mod.loadCurrentSession()
  checks.push({
    name: 'Owner session remained isolated and active',
    passed: Boolean(sessionData?.session) && owner?.employee?.role === 'Business Owner',
  })
  const { data: employees, error } = await mod.sb.from('employees')
    .select('id, status')
    .like('name', `PHASE2 RG ${args.tag}%`)
  checks.push({ name: 'Disposable employee rows enumerated', passed: !error })
  for (const employee of employees || []) {
    const result = await mod.invokeAccountAdmin('update-employee', {
      employeeId: employee.id,
      status: 'Inactive',
    })
    checks.push({ name: `Disposable employee ${employee.id} deactivated`, passed: result.ok === true })
  }
  return { ok: checks.every(check => check.passed), checks, employeeIds: (employees || []).map(item => item.id) }
}

const report = {
  ok: false,
  setup: null,
  managerAuth: null,
  managerGate: null,
  manager: null,
  technicianAuth: null,
  technicianGate: null,
  technician: null,
  cleanup: null,
}
let ownerClient = null
let workerClient = null

try {
  const ownerTarget = await findOwnerTarget()
  if (!ownerTarget?.webSocketDebuggerUrl) throw new Error(`No Owner page found for ${APP_ORIGIN}`)
  ownerClient = await CdpClient.connect(ownerTarget)
  report.setup = await ownerClient.evaluate(ownerSetup)
  if (!report.setup?.ok) throw new Error('Owner setup failed')

  const workerTarget = await createWorkerTarget()
  await delay(1000)
  workerClient = await CdpClient.connect(workerTarget)

  report.managerAuth = await workerClient.evaluate(authenticateWorker, {
    email: report.setup.manager.email,
    password: report.setup.manager.password,
    role: 'Manager',
  })
  if (!report.managerAuth?.ok) throw new Error(`Manager ${report.managerAuth?.stage || 'authentication'} failed`)
  await workerClient.send('Page.reload', { ignoreCache: true })
  report.managerGate = await workerClient.evaluate(completeEmployeeGate, { expectedPath: '/admin/dashboard' })
  if (!report.managerGate?.ok) throw new Error(`Manager EMS ${report.managerGate?.action || 'gate'} failed at ${report.managerGate?.path}`)
  report.manager = await workerClient.evaluate(managerTests, {
    tag: report.setup.tag,
    ownerEmail: report.setup.ownerEmail,
    managerEmail: report.setup.manager.email,
    managerEmployeeId: report.setup.manager.employeeId,
  })
  if (!report.manager?.ok) throw new Error(report.manager?.failure || 'Manager tests failed')

  report.technicianAuth = await workerClient.evaluate(authenticateWorker, {
    email: report.manager.technician.email,
    password: report.manager.technician.password,
    role: 'Technician',
  })
  if (!report.technicianAuth?.ok) throw new Error(`Technician ${report.technicianAuth?.stage || 'authentication'} failed`)
  await workerClient.send('Page.reload', { ignoreCache: true })
  report.technicianGate = await workerClient.evaluate(completeEmployeeGate, { expectedPath: '/workshop' })
  if (!report.technicianGate?.ok) throw new Error(`Technician EMS ${report.technicianGate?.action || 'gate'} failed at ${report.technicianGate?.path}`)
  report.technician = await workerClient.evaluate(technicianTests, {
    tag: report.setup.tag,
    technicianEmployeeId: report.manager.technician.employeeId,
    fixtureTicketId: report.setup.fixtureTicketId,
  })
  if (!report.technician?.ok) throw new Error(report.technician?.failure || 'Technician tests failed')
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error)
} finally {
  if (ownerClient && report.setup?.tag) {
    try {
      report.cleanup = await ownerClient.evaluate(ownerCleanup, { tag: report.setup.tag })
    } catch (error) {
      report.cleanup = { ok: false, failure: error instanceof Error ? error.message : String(error), checks: [] }
    }
  }
  if (workerClient) {
    try { await workerClient.send('Page.close') } catch {}
    workerClient.close()
  }
  ownerClient?.close()
}

report.ok = !report.failure && report.setup?.ok && report.manager?.ok && report.technician?.ok && report.cleanup?.ok
const safeReport = {
  ok: report.ok,
  failure: report.failure || null,
  runTag: report.setup?.tag || null,
  fixtureTicketId: report.setup?.fixtureTicketId || null,
  createdEmployeeIds: report.cleanup?.employeeIds || [],
  setupChecks: report.setup?.checks || [],
  managerAuthChecks: report.managerAuth?.checks || [],
  managerGate: report.managerGate || null,
  managerChecks: report.manager?.checks || [],
  technicianAuthChecks: report.technicianAuth?.checks || [],
  technicianGate: report.technicianGate || null,
  technicianChecks: report.technician?.checks || [],
  cleanupChecks: report.cleanup?.checks || [],
}
console.log(JSON.stringify(safeReport, null, 2))
if (!report.ok) process.exitCode = 1
