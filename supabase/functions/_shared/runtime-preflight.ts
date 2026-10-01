export const RUNTIME_CONTRACT = 'orbito-onboarding-runtime-v1'
export const REQUIRED_FUNCTIONS = ['login','account-admin','verify-pin','password-reset-request','public-track']

export async function runtimeProbe(req: Request, name: string, required: string[]) {
  if (!req.headers.has('x-orbito-preflight')) return null
  const supplied = req.headers.get('x-orbito-preflight') || ''
  const expected = Deno.env.get('PLATFORM_BRIDGE_CALL_SECRET') || ''
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))
  const [a,b] = await Promise.all([digest(supplied),digest(expected)])
  if (req.method !== 'POST' || !expected || !supplied || a.reduce((n,v,i)=>n|(v^b[i]),0)) return Response.json({error:'Not authorized'},{status:401})
  return Response.json({contract:RUNTIME_CONTRACT,function:name,configured:required.every(k=>Boolean(Deno.env.get(k)?.trim()))},
    {headers:{'Cache-Control':'no-store'}})
}

export async function checkRuntime(admin: any, status: any) {
  let data: any, error: any
  try { ({data,error} = await admin.rpc('bridge_runtime_preflight')) } catch { error = true }
  const checks = {...data?.checks}
  if (error) checks.migrations = false
  // Exercise PostgREST under the actual Edge service client, not just a definer.
  try {
    const read = await admin.from('shop_config').select('id').eq('id',1).single()
    checks.database_reachable = !read.error && read.data?.id === 1
  } catch { checks.database_reachable = false }
  const url = Deno.env.get('SUPABASE_URL') || ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const call = Deno.env.get('PLATFORM_BRIDGE_CALL_SECRET') || ''
  const source = Deno.env.get('PLATFORM_BRIDGE_SOURCE_SECRET') || ''
  const endpoint = Deno.env.get('PLATFORM_BRIDGE_ENDPOINT') || ''
  let validEndpoint = false
  try { const target = new URL(endpoint);validEndpoint = target.protocol==='https:' && !target.username && !target.password && !target.search && !target.hash && target.pathname==='/functions/v1/platform-bridge' && target.origin!==url } catch {}
  checks.bridge_configuration = Boolean(call && source && call!==source && validEndpoint)
  const functions = await Promise.all(REQUIRED_FUNCTIONS.map(async name => {
    try {
      const response = await fetch(`${url}/functions/v1/${name}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
        headers:{Authorization:`Bearer ${anon}`,apikey:anon,'x-orbito-preflight':call,'Content-Type':'application/json'},body:'{}'})
      if (!response.ok) { await response.body?.cancel();return [name,false,false] }
      const result = await response.json()
      const deployed = result?.contract===RUNTIME_CONTRACT && result.function===name
      return [name,deployed,deployed && result.configured===true]
    } catch { return [name,false,false] }
  }))
  checks.edge_functions = functions.every(([,deployed])=>deployed===true)
  checks.runtime_configuration = functions.every(([, ,configured])=>configured===true)
  let authAvailable = false
  try {
    const auth = await admin.auth.admin.listUsers({page:1,perPage:1})
    authAvailable = !auth.error && Array.isArray(auth.data?.users)
  } catch { /* No Auth bodies or identities leave the preflight. */ }
  checks.authentication = authAvailable && functions.find(([name])=>name==='login')?.[2]===true && checks.database_privileges===true && checks.rpc_privileges===true
  const keys = ['migrations','database_privileges','rpc_privileges','sequence_privileges','private_config','storage',
    'owner_reservation','bridge_mode','config_projection','database_reachable','bridge_configuration','edge_functions','runtime_configuration','authentication']
  const safeChecks = Object.fromEntries(keys.map(k=>[k,checks[k]===true]))
  const ownerAccount = ['missing','unconfirmed','ready','active','conflict'].includes(data?.owner_account) ? data.owner_account : 'missing'
  return {...status,contract:RUNTIME_CONTRACT,checks:safeChecks,owner_account:ownerAccount,
    infrastructure:keys.every(k=>safeChecks[k]) && ownerAccount!=='conflict' ? 'ready':'pending'}
}
