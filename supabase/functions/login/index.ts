// supabase/functions/login/index.ts
//
// Canonical Orbitoshopv2 login boundary.
//
// Modes:
//   shop    -> shop owner / employee
//   support -> Orbito platform super admin
//
// BOTH paths require Cloudflare Turnstile.
//
// IMPORTANT:
// Platform authentication tokens are never returned to the client browser.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'


/* =========================================================
   Environment
   ========================================================= */

const TURNSTILE_SECRET =
  Deno.env.get('TURNSTILE_SECRET') ?? ''

const SUPABASE_URL =
  Deno.env.get('SUPABASE_URL') ?? ''

const SUPABASE_SERVICE_ROLE =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''


/* Orbito platform */

const PLATFORM_SUPABASE_URL =
  Deno.env.get('PLATFORM_SUPABASE_URL') ?? ''

const PLATFORM_SUPABASE_ANON =
  Deno.env.get('PLATFORM_SUPABASE_ANON') ?? ''

const PLATFORM_AUTH_EMAIL =
  (Deno.env.get('PLATFORM_AUTH_EMAIL') ?? '')
    .toLowerCase()
    .trim()


/* =========================================================
   HTTP helpers
   ========================================================= */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':
    'POST, OPTIONS',
}


function json(
  body: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
    },
  )
}


/* =========================================================
   Turnstile
   ========================================================= */

async function verifyTurnstile(
  token: string,
  remoteIp: string | null,
): Promise<boolean> {

  if (!token || !TURNSTILE_SECRET) {
    return false
  }

  const form = new URLSearchParams()

  form.set(
    'secret',
    TURNSTILE_SECRET,
  )

  form.set(
    'response',
    token,
  )

  if (remoteIp) {
    form.set(
      'remoteip',
      remoteIp,
    )
  }

  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },

        body: form,
      },
    )

    const outcome =
      await response
        .json()
        .catch(() => ({
          success: false,
        }))

    return outcome.success === true

  } catch (error) {

    console.error(
      'Turnstile verification error:',
      error,
    )

    return false
  }
}


/* =========================================================
   Normal shop authentication

   NOTE:
   This preserves the EXISTING password mechanism temporarily.

   The next stabilization phase migrates shop accounts away
   from plaintext passwords and anon-key authorization.
   ========================================================= */

async function verifyShopCredentials(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
  password: string,
) {

  const normalizedEmail =
    email
      .toLowerCase()
      .trim()


  /* ---------------------------------------------------------
     Shop owner
     --------------------------------------------------------- */

  const {
    data: config,
    error: configError,
  } =
    await supabaseAdmin
      .from('shop_config')
      .select(
        'owner_email, owner_password',
      )
      .eq(
        'id',
        1,
      )
      .single()


  if (
    !configError &&
    config?.owner_email &&
    normalizedEmail ===
      String(config.owner_email)
        .toLowerCase()
        .trim() &&
    password === config.owner_password
  ) {

    return {
      ok: true,

      isAdmin: true,

      isSupportAdmin: false,

      employee: {
        name: 'Admin',
        role: 'Business Owner',
        email: normalizedEmail,
      },
    }
  }


  /* ---------------------------------------------------------
     Employee
     --------------------------------------------------------- */

  const {
    data: employee,
    error,
  } =
    await supabaseAdmin
      .from('employees')
      .select(
        'id, name, role, status, email',
      )
      .eq(
        'email',
        normalizedEmail,
      )
      .eq(
        'password',
        password,
      )
      .eq(
        'status',
        'Active',
      )
      .single()


  if (
    error ||
    !employee
  ) {

    return {
      ok: false,
      error:
        'Incorrect email or password.',
    }
  }


  return {
    ok: true,

    isAdmin: false,

    isSupportAdmin: false,

    employee: {
      id: employee.id,
      name: employee.name,
      role: employee.role,
      email: employee.email,
    },
  }
}


/* =========================================================
   Orbito support authentication
   ========================================================= */

async function verifySupportAdmin(
  email: string,
  password: string,
) {

  if (
    !PLATFORM_SUPABASE_URL ||
    !PLATFORM_SUPABASE_ANON ||
    !PLATFORM_AUTH_EMAIL
  ) {

    console.error(
      'Orbito support authentication environment is incomplete.',
    )

    return {
      ok: false,
      error:
        'Support access is not configured for this client.',
    }
  }


  const normalizedEmail =
    email
      .toLowerCase()
      .trim()


  /*
   * Only the configured Orbito master-admin account
   * may use this support route.
   *
   * Keep the response generic so the browser cannot use
   * this endpoint to discover the authorized email.
   */

  if (
    normalizedEmail !==
    PLATFORM_AUTH_EMAIL
  ) {

    return {
      ok: false,
      error:
        'Incorrect support credentials.',
    }
  }


  const authUrl =
    `${PLATFORM_SUPABASE_URL.replace(/\/$/, '')}` +
    '/auth/v1/token?grant_type=password'


  let response: Response

  try {

    response =
      await fetch(
        authUrl,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            'apikey':
              PLATFORM_SUPABASE_ANON,
          },

          body:
            JSON.stringify({
              email:
                normalizedEmail,

              password,
            }),
        },
      )

  } catch (error) {

    console.error(
      'Platform authentication request failed:',
      error,
    )

    return {
      ok: false,
      error:
        'Support authentication service is unavailable.',
    }
  }


  const result =
    await response
      .json()
      .catch(() => ({}))


  if (
    !response.ok ||
    !result?.user?.id ||
    !result?.user?.email
  ) {

    return {
      ok: false,
      error:
        'Incorrect support credentials.',
    }
  }


  const authenticatedEmail =
    String(result.user.email)
      .toLowerCase()
      .trim()


  /*
   * Verify AGAIN using the identity returned by
   * Supabase Auth.
   */

  if (
    authenticatedEmail !==
    PLATFORM_AUTH_EMAIL
  ) {

    return {
      ok: false,
      error:
        'This platform account is not authorized for support access.',
    }
  }


  return {
    ok: true,

    userId:
      String(result.user.id),

    email:
      authenticatedEmail,
  }
}


/* =========================================================
   Request handler
   ========================================================= */

Deno.serve(
  async (
    req: Request,
  ) => {

    if (
      req.method === 'OPTIONS'
    ) {

      return new Response(
        null,
        {
          headers:
            CORS_HEADERS,
        },
      )
    }


    if (
      req.method !== 'POST'
    ) {

      return json(
        {
          ok: false,
          error:
            'Method not allowed.',
        },
        405,
      )
    }


    let body: {
      email?: string
      password?: string
      turnstileToken?: string
      mode?: string
    }


    try {

      body =
        await req.json()

    } catch {

      return json(
        {
          ok: false,
          error:
            'Invalid request body.',
        },
        400,
      )
    }


    const email =
      body.email?.trim()

    const password =
      body.password

    const mode =
      body.mode === 'support'
        ? 'support'
        : 'shop'


    if (
      !email ||
      !password
    ) {

      return json(
        {
          ok: false,
          error:
            'Email and password are required.',
        },
        400,
      )
    }


    /* -------------------------------------------------------
       Turnstile is mandatory for BOTH login modes
       ------------------------------------------------------- */

    const remoteIp =
      req.headers.get(
        'cf-connecting-ip',
      ) ||
      req.headers.get(
        'x-forwarded-for',
      )


    const turnstileOk =
      await verifyTurnstile(
        body.turnstileToken ?? '',
        remoteIp,
      )


    if (
      !turnstileOk
    ) {

      return json(
        {
          ok: false,
          error:
            'Verification failed. Please try again.',
        },
        403,
      )
    }


    const supabaseAdmin =
      createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      )


    /* =======================================================
       ORBITO SUPPORT MODE
       ======================================================= */

    if (
      mode === 'support'
    ) {

      const support =
        await verifySupportAdmin(
          email,
          password,
        )


      if (
        !support.ok ||
        !support.userId ||
        !support.email
      ) {

        return json(
          support,
          401,
        )
      }


      /*
       * Support access must be auditable.
       *
       * Fail closed if the audit record cannot be created.
       */

      const {
        error: auditError,
      } =
        await supabaseAdmin
          .from(
            'support_access_log',
          )
          .insert({
            platform_user_id:
              support.userId,

            platform_email:
              support.email,

            event:
              'support_login',

            user_agent:
              req.headers.get(
                'user-agent',
              ) || null,
          })


      if (
        auditError
      ) {

        console.error(
          'Support access audit failed:',
          auditError.message,
        )

        return json(
          {
            ok: false,
            error:
              'Support access audit is unavailable. Access denied.',
          },
          503,
        )
      }


      return json({
        ok: true,

        isAdmin: true,

        isSupportAdmin: true,

        employee: {
          name:
            'Orbito Support',

          role:
            'Business Owner',

          email:
            support.email,
        },
      })
    }


    /* =======================================================
       NORMAL SHOP MODE
       ======================================================= */

    const result =
      await verifyShopCredentials(
        supabaseAdmin,
        email,
        password,
      )


    if (
      !result.ok
    ) {

      return json(
        result,
        401,
      )
    }


    return json(
      result,
      200,
    )
  },
)