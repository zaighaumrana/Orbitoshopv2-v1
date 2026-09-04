import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Role = 'Business Owner' | 'Manager' | 'Cashier' | 'Technician' | 'Orbito Support'
type Profile = {
  auth_user_id: string
  employee_id: number | null
  email: string
  display_name: string
  role: Role
  status: 'Active' | 'Inactive'
}

const employeeRoles: Role[] = ['Manager', 'Cashier', 'Technician']
const statuses = ['Active', 'Inactive']
const configKeys = new Set([
  'shop_name', 'shop_address', 'shop_phone', 'shop_logo', 'shop_description',
  'primary_color', 'secondary_color', 'currency', 'tax_rate',
  'discount_pin_required', 'partial_udhar_allowed', 'terms_text',
  'invoice_prefix', 'ticket_prefix',
])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
const emailOf = (value: unknown) => String(value ?? '').toLowerCase().trim()
const goodPassword = (value: unknown) => {
  const password = String(value ?? '')
  return password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)
}
const canManage = (caller: Role, target: Role) => {
  if (caller === 'Manager') return target === 'Cashier' || target === 'Technician'
  if (caller === 'Business Owner' || caller === 'Orbito Support') return employeeRoles.includes(target)
  return false
}

async function context(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON || !SUPABASE_SERVICE_ROLE) throw new Error('Server configuration is incomplete.')
  const authorization = req.headers.get('authorization') ?? ''
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return null

  const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, opts)
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, opts)
  const { data: userData, error: userError } = await userClient.auth.getUser(token)
  if (userError || !userData.user) return null
  const { data: caller, error: callerError } = await admin
    .from('app_users')
    .select('auth_user_id, employee_id, email, display_name, role, status')
    .eq('auth_user_id', userData.user.id)
    .single()
  if (callerError || !caller || caller.status !== 'Active') return null
  const { data: shop, error: shopError } = await admin.from('shop_config').select('suspended').eq('id', 1).single()
  if (shopError || !shop) return null
  if (shop.suspended && caller.role !== 'Orbito Support') return null
  return { admin, caller: caller as Profile }
}

async function createEmployee(admin: any, caller: Profile, body: any) {
  const name = String(body.name ?? '').trim()
  const email = emailOf(body.email)
  const role = String(body.role ?? 'Cashier') as Role
  const password = String(body.password ?? '')
  if (!name || !email || !goodPassword(password) || !employeeRoles.includes(role)) {
    return { ok: false, error: 'Valid name, email, role, and password are required.' }
  }
  if (!canManage(caller.role, role)) return { ok: false, error: 'You cannot create that role.' }

  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (createError || !created.user) return { ok: false, error: 'That email is unavailable or the Auth user could not be created.' }
  const { data: employee, error: employeeError } = await admin
    .from('employees')
    .insert({ name, email, role, status: 'Active', password: null, pin_code: null })
    .select('id')
    .single()
  if (employeeError || !employee) {
    await admin.auth.admin.deleteUser(created.user.id)
    return { ok: false, error: 'Employee record could not be created.' }
  }
  const { error: mappingError } = await admin.from('app_users').insert({
    auth_user_id: created.user.id,
    employee_id: employee.id,
    email,
    display_name: name,
    role,
    status: 'Active',
  })
  if (mappingError) {
    await admin.from('employees').delete().eq('id', employee.id)
    await admin.auth.admin.deleteUser(created.user.id)
    return { ok: false, error: 'Employee authorization mapping could not be created.' }
  }
  return { ok: true, employeeId: employee.id }
}

async function updateEmployee(admin: any, caller: Profile, body: any) {
  const employeeId = Number(body.employeeId)
  const { data: employee, error } = await admin
    .from('employees').select('id, name, email, role, status').eq('id', employeeId).single()
  if (error || !employee) return { ok: false, error: 'Employee not found.' }
  const role = String(body.role ?? employee.role) as Role
  const status = String(body.status ?? employee.status)
  const name = String(body.name ?? employee.name).trim()
  const email = emailOf(body.email ?? employee.email)
  if (!name || !email || !employeeRoles.includes(role) || !statuses.includes(status)) {
    return { ok: false, error: 'Invalid employee update.' }
  }
  if (!canManage(caller.role, employee.role) || !canManage(caller.role, role)) {
    return { ok: false, error: 'You cannot edit that account or assign that role.' }
  }

  const { data: mapped, error: mappedError } = await admin
    .from('app_users')
    .select('auth_user_id, email')
    .eq('employee_id', employeeId)
    .maybeSingle()
  if (mappedError) return { ok: false, error: 'Authorization mapping lookup failed.' }

  if (mapped && email !== mapped.email) {
    const { error: authError } = await admin.auth.admin.updateUserById(mapped.auth_user_id, { email, email_confirm: true })
    if (authError) return { ok: false, error: 'Auth email could not be updated.' }
  }
  if (!mapped && email !== emailOf(employee.email)) {
    const { error: vaultEmailError } = await admin.from('legacy_auth_credentials')
      .update({ normalized_email: email }).eq('normalized_email', emailOf(employee.email))
    if (vaultEmailError) return { ok: false, error: 'Legacy identity email could not be updated.' }
  }
  const { error: employeeUpdateError } = await admin
    .from('employees').update({ name, email, role, status }).eq('id', employeeId)
  if (employeeUpdateError) {
    if (mapped && email !== mapped.email) {
      await admin.auth.admin.updateUserById(mapped.auth_user_id, { email: mapped.email, email_confirm: true })
    }
    if (!mapped && email !== emailOf(employee.email)) {
      await admin.from('legacy_auth_credentials')
        .update({ normalized_email: emailOf(employee.email) }).eq('normalized_email', email)
    }
    return { ok: false, error: 'Employee record could not be updated.' }
  }

  if (mapped) {
    const { error: mappingUpdateError } = await admin.from('app_users').update({
      email, display_name: name, role, status,
    }).eq('auth_user_id', mapped.auth_user_id)
    if (mappingUpdateError) {
      await admin.from('employees').update({
        name: employee.name, email: employee.email, role: employee.role, status: employee.status,
      }).eq('id', employeeId)
      if (email !== mapped.email) {
        await admin.auth.admin.updateUserById(mapped.auth_user_id, { email: mapped.email, email_confirm: true })
      }
      return { ok: false, error: 'Authorization mapping could not be updated.' }
    }
  }
  return { ok: true }
}

async function targetByEmail(admin: any, email: string) {
  const { data: mapped } = await admin
    .from('app_users')
    .select('auth_user_id, employee_id, email, display_name, role, status')
    .eq('email', email)
    .maybeSingle()
  if (mapped) return { profile: mapped as Profile, employee: null }

  const { data: owner } = await admin.from('shop_config').select('owner_email').eq('id', 1).single()
  if (emailOf(owner?.owner_email) === email) {
    return {
      profile: null,
      employee: { id: null, name: 'Admin', email, role: 'Business Owner', status: 'Active' },
    }
  }
  const { data: employee } = await admin
    .from('employees').select('id, name, email, role, status').ilike('email', email).maybeSingle()
  return { profile: null, employee }
}

async function resetPassword(admin: any, caller: Profile, body: any) {
  const email = emailOf(body.email)
  const password = String(body.newPassword ?? '')
  if (!email || !goodPassword(password)) return { ok: false, error: 'A valid target and password are required.' }
  const target = await targetByEmail(admin, email)
  const targetRole = (target.profile?.role ?? target.employee?.role) as Role | undefined
  if (!targetRole) return { ok: false, error: 'Target account was not found.' }
  const allowed = canManage(caller.role, targetRole) || (caller.role === 'Orbito Support' && targetRole === 'Business Owner')
  if (!allowed) return { ok: false, error: 'You cannot reset that account.' }

  if (target.profile) {
    const { error } = await admin.auth.admin.updateUserById(target.profile.auth_user_id, { password })
    if (error) return { ok: false, error: 'Password could not be reset.' }
    await admin.from('legacy_auth_credentials').delete().eq('normalized_email', email)
    return { ok: true }
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (createError || !created.user) return { ok: false, error: 'Auth identity could not be created.' }
  const employeeId = target.employee.id ?? null
  const profile = {
    auth_user_id: created.user.id,
    employee_id: employeeId,
    email,
    display_name: target.employee.name,
    role: targetRole,
    status: target.employee.status,
  }
  const { error: mapError } = await admin.from('app_users').insert(profile)
  if (mapError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return { ok: false, error: 'Authorization mapping could not be created.' }
  }
  const { error: consumeError } = await admin.from('legacy_auth_credentials').delete().eq('normalized_email', email)
  if (consumeError) return { ok: false, error: 'Legacy credential cleanup is pending; retry through support.' }
  return { ok: true }
}

async function updateOwner(admin: any, caller: Profile, body: any) {
  if (caller.role !== 'Business Owner' && caller.role !== 'Orbito Support') {
    return { ok: false, error: 'Owner settings are not permitted.' }
  }
  const email = emailOf(body.email)
  if (!email) return { ok: false, error: 'A valid owner email is required.' }
  const { data: owner } = await admin.from('app_users').select('*').eq('role', 'Business Owner').maybeSingle()
  if (!owner) return { ok: false, error: 'Owner must complete Auth migration before changing email.' }
  const oldEmail = owner.email
  const { error: authError } = await admin.auth.admin.updateUserById(owner.auth_user_id, { email, email_confirm: true })
  if (authError) return { ok: false, error: 'Owner Auth email could not be updated.' }
  const { error: mapError } = await admin.from('app_users').update({ email }).eq('auth_user_id', owner.auth_user_id)
  if (mapError) {
    await admin.auth.admin.updateUserById(owner.auth_user_id, { email: oldEmail, email_confirm: true })
    return { ok: false, error: 'Owner mapping could not be updated.' }
  }
  const { error: configError } = await admin.from('shop_config').update({ owner_email: email }).eq('id', 1)
  if (configError) {
    await admin.from('app_users').update({ email: oldEmail }).eq('auth_user_id', owner.auth_user_id)
    await admin.auth.admin.updateUserById(owner.auth_user_id, { email: oldEmail, email_confirm: true })
    return { ok: false, error: 'Owner configuration could not be updated.' }
  }
  return { ok: true }
}

async function updateConfig(admin: any, caller: Profile, body: any) {
  if (caller.role !== 'Business Owner' && caller.role !== 'Orbito Support') {
    return { ok: false, error: 'Settings changes are not permitted.' }
  }
  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body.updates ?? {})) {
    if (configKeys.has(key)) updates[key] = value
  }
  if (!Object.keys(updates).length) return { ok: false, error: 'No permitted settings were provided.' }
  const { error } = await admin.from('shop_config').update(updates).eq('id', 1)
  return error ? { ok: false, error: 'Settings could not be updated.' } : { ok: true }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405)
  try {
    const ctx = await context(req)
    if (!ctx) return json({ ok: false, error: 'Authentication or authorization failed.' }, 401)
    const body = await req.json().catch(() => ({}))
    let result
    switch (body.action) {
      case 'create-employee': result = await createEmployee(ctx.admin, ctx.caller, body); break
      case 'update-employee': result = await updateEmployee(ctx.admin, ctx.caller, body); break
      case 'reset-password': result = await resetPassword(ctx.admin, ctx.caller, body); break
      case 'reset-password-request': {
        result = await resetPassword(ctx.admin, ctx.caller, body)
        if (result.ok) {
          const { error } = await ctx.admin.from('password_reset_requests').update({
            status: 'Resolved', resolved_at: new Date().toISOString(), resolved_by: ctx.caller.display_name,
          }).eq('id', Number(body.requestId)).eq('status', 'Pending')
          if (error) result = { ok: false, error: 'Password changed, but reset request resolution needs support.' }
        }
        break
      }
      case 'update-owner': result = await updateOwner(ctx.admin, ctx.caller, body); break
      case 'update-config': result = await updateConfig(ctx.admin, ctx.caller, body); break
      case 'set-pin': {
        if (ctx.caller.role !== 'Business Owner' && ctx.caller.role !== 'Orbito Support') {
          result = { ok: false, error: 'PIN changes are not permitted.' }
        } else {
          const { error } = await ctx.admin.rpc('set_override_pin', { candidate_pin: String(body.pin ?? '') })
          result = error ? { ok: false, error: 'PIN could not be updated.' } : { ok: true }
        }
        break
      }
      default: result = { ok: false, error: 'Unsupported account action.' }
    }
    return json(result, result.ok ? 200 : 403)
  } catch (error) {
    console.error('Account administration failed.', error instanceof Error ? error.message : 'unknown error')
    return json({ ok: false, error: 'Account administration is unavailable.' }, 503)
  }
})
