import { sb, establishLoginSession, _clearSession } from './shared.js'

export function takeSupportHandoff(location,history) {
 const values=new URLSearchParams(location.hash.slice(1))
 if(!values.has('support'))return null
 const token=values.get('support') || ''
 // Clear synchronously before any configuration/auth/network work. Never store it.
 history.replaceState(null,'',location.pathname+location.search)
 return values.getAll('support').length===1 && /^[a-f0-9]{64}$/.test(token)?token:''
}

export async function startSupportHandoff(token,onSuccess) {
 const app=document.getElementById('app')
 app.textContent='Starting secure support session…'
 try {
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid support link.')
  const {data,error}=await sb.functions.invoke('login',{body:{mode:'support-handoff',token}})
  if(error || data?.ok!==true || data.profile?.role!=='Orbito Support')throw new Error('Support authorization expired, was already used, or could not be verified.')
  const established=await establishLoginSession(data)
  if(!established.ok || established.session?.employee?.role!=='Orbito Support')throw new Error('Support profile could not be verified.')
  await onSuccess(established.session)
 } catch {
  await _clearSession()
  app.textContent='Secure support session could not be started. Return to Platform and select Open Shop as Support for a new link.'
 }
}
