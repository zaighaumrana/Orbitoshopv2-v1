import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'

const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PLATFORM_SUPABASE_URL = Deno.env.get('PLATFORM_SUPABASE_URL') ?? ''
const PLATFORM_SUPABASE_ANON = Deno.env.get('PLATFORM_SUPABASE_ANON') ?? ''
const PLATFORM_AUTH_EMAIL = normalizeEmail(Deno.env.get('PLATFORM_AUTH_EMAIL') ?? '')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type AppProfile = {
  auth_user_id: string
  employee_id: number | null
  email: string
  display_name: string
  role: 'Business Owner' | 'Manager' | 'Cashier' | 'Technician' | 'Orbito Support'
  status: 'Active' | 'Inactive'
}

type LegacyIdentity = {
  normalized_email: string
  identity_type: 'owner' | 'employee'
  employee_id: number | null
  display_name: string
  app_role: AppProfile['role']
  app_status: AppProfile['status']
}

function normalizeEmail(value: string) {
  return value.toLowerCase().trim()
}

function clientSupportEmail() {
  let projectRef = ''
  try {
    projectRef = new URL(SUPABASE_URL).hostname.split('.')[0] ?? ''
  } catch {
    throw new Error('Client Supabase project identity is invalid.')
  }
  projectRef = projectRef.toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!projectRef) throw new Error('Client Supabase project identity is unavailable.')
  return `orbitosupport+${projectRef}@support.orbito.internal`
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function publicProfile(profile: AppProfile) {
  return {
    authUserId: profile.auth_user_id,
    employeeId: profile.employee_id,
    email: profile.email,
    displayName: profile.display_name,
    role: profile.role,
    status: profile.status,
  }
}

function loginResponse(profile: AppProfile, session: { access_token: string; refresh_token: string; expires_at?: number }) {
  return {
    ok: true,
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    },
    profile: publicProfile(profile),
    isAdmin: ['Business Owner', 'Orbito Support'].includes(profile.role),
    isSupportAdmin: profile.role === 'Orbito Support',
    employee: {
      id: profile.employee_id ?? undefined,
      name: profile.display_name,
      role: profile.role,
      email: profile.email,
    },
  }
}

async function verifyTurnstile(token: string, remoteIp: string | null) {
  if (!token || !TURNSTILE_SECRET) return false
  const form = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token })
  if (remoteIp) form.set('remoteip', remoteIp)

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const outcome = await response.json().catch(() => ({ success: false }))
    return outcome.success === true
  } catch (error) {
    console.error('Turnstile verification request failed.', error instanceof Error ? error.message : 'unknown error')
    return false
  }
}

function clients() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !SUPABASE_ANON) {
    throw new Error('Client Supabase authentication environment is incomplete.')
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  return {
    admin: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, options),
    auth: createClient(SUPABASE_URL, SUPABASE_ANON, options),
  }
}

async function shopIsSuspended(admin: ReturnType<typeof createClient>) {
  const { data, error } = await admin.from('shop_config').select('suspended').eq('id', 1).single()
  if (error || !data) throw new Error('Shop access state is unavailable.')
  return data.suspended === true
}

async function findAppProfile(admin: ReturnType<typeof createClient>, email: string): Promise<AppProfile | null> {
  const { data, error } = await admin
    .from('app_users')
    .select('auth_user_id, employee_id, email, display_name, role, status')
    .eq('email', email)
    .maybeSingle()
  if (error) throw new Error('Application identity lookup failed.')
  return data as AppProfile | null
}

async function findSupportProfile(admin: ReturnType<typeof createClient>): Promise<AppProfile | null> {
  const { data, error } = await admin
    .from('app_users')
    .select('auth_user_id, employee_id, email, display_name, role, status')
    .eq('role', 'Orbito Support')
    .maybeSingle()
  if (error) throw new Error('Support identity lookup failed.')
  return data as AppProfile | null
}

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error('Authentication identity lookup failed.')
    const match = data.users.find((user) => normalizeEmail(user.email ?? '') === email)
    if (match) return match
    if (data.users.length < 1000) return null
  }
  throw new Error('Authentication identity lookup exceeded its safe page limit.')
}

async function signInMappedUser(
  admin: ReturnType<typeof createClient>,
  auth: ReturnType<typeof createClient>,
  profile: AppProfile,
  password: string,
) {
  if (profile.status !== 'Active') return { ok: false, error: 'Incorrect email or password.' }
  if (profile.role !== 'Orbito Support' && await shopIsSuspended(admin)) {
    return { ok: false, error: 'This shop account is suspended. Contact your service provider.' }
  }
  const { data, error } = await auth.auth.signInWithPassword({ email: profile.email, password })
  if (error || !data.session || !data.user || data.user.id !== profile.auth_user_id) {
    return { ok: false, error: 'Incorrect email or password.' }
  }
  await admin.from('legacy_auth_credentials').delete().eq('normalized_email', profile.email)
  return loginResponse(profile, data.session)
}

async function verifyLegacyIdentity(
  admin: ReturnType<typeof createClient>,
  email: string,
  password: string,
): Promise<LegacyIdentity | null> {
  const { data: vault, error: vaultError } = await admin
    .from('legacy_auth_credentials')
    .select('normalized_email')
    .eq('normalized_email', email)
    .maybeSingle()
  if (vaultError) throw new Error('Legacy authentication vault lookup failed.')

  if (vault) {
    const { data, error } = await admin.rpc('verify_legacy_credential', {
      candidate_email: email,
      candidate_password: password,
    })
    if (error) throw new Error('Legacy credential verification failed.')
    return (data?.[0] as LegacyIdentity | undefined) ?? null
  }

  // Transitional compatibility only; the vault migration removes this path's data source.
  const { data: config, error: configError } = await admin
    .from('shop_config')
    .select('owner_email, owner_password')
    .eq('id', 1)
    .single()
  if (configError) throw new Error('Owner identity lookup failed.')
  if (normalizeEmail(config.owner_email ?? '') === email && config.owner_password === password) {
    return {
      normalized_email: email,
      identity_type: 'owner',
      employee_id: null,
      display_name: 'Admin',
      app_role: 'Business Owner',
      app_status: 'Active',
    }
  }

  const { data: employee, error: employeeError } = await admin
    .from('employees')
    .select('id, name, role, status, email, password')
    .ilike('email', email)
    .maybeSingle()
  if (employeeError) throw new Error('Employee identity lookup failed.')
  if (!employee || employee.password !== password || employee.status !== 'Active') return null
  if (!['Manager', 'Cashier', 'Technician'].includes(employee.role)) return null
  return {
    normalized_email: email,
    identity_type: 'employee',
    employee_id: employee.id,
    display_name: employee.name,
    app_role: employee.role,
    app_status: employee.status,
  } as LegacyIdentity
}

async function migrateLegacyLogin(
  admin: ReturnType<typeof createClient>,
  auth: ReturnType<typeof createClient>,
  identity: LegacyIdentity,
  password: string,
) {
  if (identity.app_status !== 'Active') return { ok: false, error: 'Incorrect email or password.' }
  if (await shopIsSuspended(admin)) {
    return { ok: false, error: 'This shop account is suspended. Contact your service provider.' }
  }
  if (await findAuthUserByEmail(admin, identity.normalized_email)) {
    return { ok: false, error: 'This account needs administrator recovery before it can sign in.' }
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: identity.normalized_email,
    password,
    email_confirm: true,
  })
  if (createError || !created.user) return { ok: false, error: 'Account migration could not be completed.' }

  const profile: AppProfile = {
    auth_user_id: created.user.id,
    employee_id: identity.employee_id,
    email: identity.normalized_email,
    display_name: identity.display_name,
    role: identity.app_role,
    status: identity.app_status,
  }
  const { error: mappingError } = await admin.from('app_users').insert(profile)
  if (mappingError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return { ok: false, error: 'Account migration could not be completed.' }
  }

  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
    email: identity.normalized_email,
    password,
  })
  if (signInError || !signedIn.session || !signedIn.user || signedIn.user.id !== created.user.id) {
    await admin.from('app_users').delete().eq('auth_user_id', created.user.id)
    await admin.auth.admin.deleteUser(created.user.id)
    return { ok: false, error: 'Account migration could not be completed.' }
  }

  const { error: consumeError } = await admin
    .from('legacy_auth_credentials')
    .delete()
    .eq('normalized_email', identity.normalized_email)
  if (consumeError) console.error('Legacy credential cleanup is pending for a mapped account.')
  return loginResponse(profile, signedIn.session)
}

async function verifyPlatformSupport(email: string, password: string) {
  if (!PLATFORM_SUPABASE_URL || !PLATFORM_SUPABASE_ANON || !PLATFORM_AUTH_EMAIL) {
    return { ok: false, error: 'Support access is not configured for this client.' }
  }
  if (email !== PLATFORM_AUTH_EMAIL) return { ok: false, error: 'Incorrect support credentials.' }

  try {
    const response = await fetch(
      `${PLATFORM_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: PLATFORM_SUPABASE_ANON },
        body: JSON.stringify({ email, password }),
      },
    )
    const result = await response.json().catch(() => ({}))
    const authenticatedEmail = normalizeEmail(result?.user?.email ?? '')
    if (!response.ok || !result?.user?.id || authenticatedEmail !== PLATFORM_AUTH_EMAIL) {
      return { ok: false, error: 'Incorrect support credentials.' }
    }
    return { ok: true, userId: String(result.user.id), email: authenticatedEmail }
  } catch (error) {
    console.error('Platform authentication request failed.', error instanceof Error ? error.message : 'unknown error')
    return { ok: false, error: 'Support authentication service is unavailable.' }
  }
}

async function bootstrapSupportSession(
  admin: ReturnType<typeof createClient>,
  auth: ReturnType<typeof createClient>,
  platformUserId: string,
  platformEmail: string,
  userAgent: string | null,
) {
  const supportEmail = clientSupportEmail()
  let profile = await findSupportProfile(admin)
  let newlyCreatedUserId: string | null = null

  if (profile && normalizeEmail(profile.email) !== supportEmail) {
    return { ok: false, error: 'Client support identity requires administrator recovery.' }
  }

  if (!profile) {
    const emailProfile = await findAppProfile(admin, supportEmail)
    if (emailProfile) {
      return { ok: false, error: 'Client support identity conflicts with an application account.' }
    }

    let authUser = await findAuthUserByEmail(admin, supportEmail)
    if (!authUser) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: supportEmail,
        email_confirm: true,
        app_metadata: { app_identity: 'orbito_client_support' },
      })
      if (createError || !created.user) return { ok: false, error: 'Support session could not be created.' }
      newlyCreatedUserId = created.user.id
      authUser = created.user
    }

    profile = {
      auth_user_id: authUser.id,
      employee_id: null,
      email: supportEmail,
      display_name: 'Orbito Support',
      role: 'Orbito Support',
      status: 'Active',
    }
    const { error: mappingError } = await admin.from('app_users').insert(profile)
    if (mappingError) {
      if (newlyCreatedUserId) await admin.auth.admin.deleteUser(newlyCreatedUserId)
      return { ok: false, error: 'Support session could not be created.' }
    }
  } else {
    const authUser = await findAuthUserByEmail(admin, supportEmail)
    if (!authUser || authUser.id !== profile.auth_user_id || profile.employee_id !== null) {
      return { ok: false, error: 'Client support identity requires administrator recovery.' }
    }
  }

  if (profile.status !== 'Active') return { ok: false, error: 'Support access is inactive.' }
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: supportEmail,
  })
  const tokenHash = linkData?.properties?.hashed_token
  if (linkError || !tokenHash) {
    if (newlyCreatedUserId) {
      await admin.from('app_users').delete().eq('auth_user_id', newlyCreatedUserId)
      await admin.auth.admin.deleteUser(newlyCreatedUserId)
    }
    return { ok: false, error: 'Support session could not be created.' }
  }

  const { data: verified, error: verifyError } = await auth.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
  if (verifyError || !verified.session || !verified.user || verified.user.id !== profile.auth_user_id) {
    if (newlyCreatedUserId) {
      await admin.from('app_users').delete().eq('auth_user_id', newlyCreatedUserId)
      await admin.auth.admin.deleteUser(newlyCreatedUserId)
    }
    return { ok: false, error: 'Support session could not be created.' }
  }

  const { error: auditError } = await admin.from('support_access_log').insert({
    platform_user_id: platformUserId,
    platform_email: platformEmail,
    client_auth_user_id: profile.auth_user_id,
    event: 'support_login',
    user_agent: userAgent,
  })
  if (auditError) return { ok: false, error: 'Support access audit is unavailable. Access denied.' }
  return loginResponse(profile, verified.session)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405)

  let body: { email?: string; password?: string; turnstileToken?: string; mode?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400)
  }

  const email = normalizeEmail(body.email ?? '')
  const password = body.password ?? ''
  const mode = body.mode === 'support' ? 'support' : 'shop'
  if (!email || !password) return json({ ok: false, error: 'Email and password are required.' }, 400)

  const remoteIp = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')
  if (!await verifyTurnstile(body.turnstileToken ?? '', remoteIp)) {
    return json({ ok: false, error: 'Verification failed. Please try again.' }, 403)
  }

  try {
    const { admin, auth } = clients()
    if (mode === 'support') {
      const support = await verifyPlatformSupport(email, password)
      if (!support.ok || !support.userId || !support.email) return json(support, 401)
      const result = await bootstrapSupportSession(
        admin, auth, support.userId, support.email, req.headers.get('user-agent'),
      )
      return json(result, result.ok ? 200 : 401)
    }

    const mapped = await findAppProfile(admin, email)
    if (mapped) {
      const result = await signInMappedUser(admin, auth, mapped, password)
      return json(result, result.ok ? 200 : 401)
    }
    const legacy = await verifyLegacyIdentity(admin, email, password)
    if (!legacy) return json({ ok: false, error: 'Incorrect email or password.' }, 401)
    const result = await migrateLegacyLogin(admin, auth, legacy, password)
    return json(result, result.ok ? 200 : 401)
  } catch (error) {
    console.error('Login gateway failed.', error instanceof Error ? error.message : 'unknown error')
    return json({ ok: false, error: 'Authentication service is unavailable.' }, 503)
  }
})
