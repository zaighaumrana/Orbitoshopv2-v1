export async function exchangeSupportHandoff(admin: any,token: string) {
 if(typeof token!=='string' || !/^[a-f0-9]{64}$/.test(token))return null
 const endpoint=Deno.env.get('PLATFORM_BRIDGE_ENDPOINT') || '',secret=Deno.env.get('PLATFORM_BRIDGE_SOURCE_SECRET') || ''
 const platform=/^https:\/\/([a-z]{20})\.supabase\.co\/functions\/v1\/platform-bridge$/.exec(endpoint)?.[1]
 const project=/^https:\/\/([a-z]{20})\.supabase\.co$/.exec(Deno.env.get('SUPABASE_URL') || '')?.[1]
 if(!platform || !project || platform===project || secret.length<32 || /\s/.test(secret))return null
 const config=await admin.from('shop_config').select('platform_client_id,onboarding_version').eq('id',1).single()
 const pairing=await admin.rpc('bridge_onboarding',{p_action:'status',p_payload:{}})
 const client=config.data?.platform_client_id,binding=pairing.data?.client_binding,source=pairing.data?.source_id
 if(config.error || pairing.error || config.data?.onboarding_version!==2 || !Number.isSafeInteger(client) || client<1 || typeof binding!=='string' || !source)return null
 try {
  const response=await fetch(`https://${platform}.supabase.co/functions/v1/platform-support`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({action:'exchange',token,client_id:client,project_ref:project,client_binding:binding,source_id:source})})
  if(!response.ok){await response.body?.cancel();return null}
  const result=await response.json()
  if(result?.ok!==true || result.contract!=='orbito-support-handoff-v1' || result.client_id!==client || result.project_ref!==project || result.client_binding!==binding || result.source_id!==source
   || typeof result.platform_user_id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.platform_user_id) || typeof result.platform_email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.platform_email))return null
  return {userId:result.platform_user_id,email:result.platform_email.trim().toLowerCase()}
 } catch {return null}
}
