import { checkRuntime } from '../_shared/runtime-preflight.ts'
// Called only after the bridge's opaque call credential has been authenticated.
export async function onboardingOperation(admin: any, body: any) {
  const rpc = async (action: string, payload: any = {}) => {
    const { data, error } = await admin.rpc('bridge_onboarding', { p_action: action, p_payload: payload })
    if (error) throw new Error('Shop identity, readiness or operation conflict. Retry the same request; reconcile an existing Shop instead of resetting it.')
    return data
  }
  if (['config-read','config-write'].includes(body.operation)) return rpc(body.operation, body)
  if (['status','preflight'].includes(body.operation)) return checkRuntime(admin,await rpc('status'))
  if (body.operation === 'bootstrap') return checkRuntime(admin,await rpc('reserve',body.payload))
  if (body.operation !== 'invite-owner') throw new Error('Unsupported bridge operation')
  const payload = body.payload
  let redirect: URL
  try {
    redirect = new URL(payload.shop_url)
    if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.search || redirect.hash) throw new Error()
    redirect = new URL('/invite/accept', redirect)
  } catch { throw new Error('Configure a valid HTTPS Shop URL and allow /invite/accept in Shop Auth redirect URLs.') }
  const claim = await rpc('claim', payload)
  if (claim.already_provisioned) return checkRuntime(admin,claim)
  try {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(payload.owner_email, {
      redirectTo: redirect.href,
      data: { owner_name: payload.owner_name, orbito_bootstrap_request: claim.request_id },
    })
    if (error || !data?.user) {
      // SDK fetch failures may be returned, rather than thrown. A network/5xx
      // result cannot prove Auth did not commit; preserve the recovery lease.
      if (!error || error.status < 400 || error.status >= 500 || !Number.isFinite(error.status)
        || error.name === 'AuthRetryableFetchError') throw new Error('Unknown Auth outcome')
      await rpc('failed', { lease_id: claim.lease_id })
      return { ...await checkRuntime(admin,await rpc('status')), invitation: 'failed' }
    }
    return { ...await checkRuntime(admin,await rpc('finish', { auth_user_id: data.user.id })), invitation: 'sent' }
  } catch (error) {
    // Unknown Auth outcomes retain the short lease. Retry recovers the committed
    // invitation by reserved email + request correlation without sending twice.
    return { ...await checkRuntime(admin,await rpc('status')), invitation: 'pending' }
  }
}
