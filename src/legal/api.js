import metadata from './metadata.json'

export function versionsMatch(status) {
  return status?.required_revision === metadata.requiredRevision
    && ['terms','privacy','dpa'].every(key => status[key + '_version'] === metadata.documents[key].version)
}
export async function readLegalStatus(client) {
  const {data,error} = await client.rpc('get_legal_status')
  if (error || !data) throw new Error('Legal acceptance status is unavailable. Please retry or contact support.')
  return data
}
export async function acceptLegalTerms(client, authorized) {
  if (authorized !== true) throw new Error('Confirm that you are authorized to accept for this business.')
  const {data,error} = await client.rpc('accept_legal_terms', {
    p_authorized:true, p_required_revision:metadata.requiredRevision,
    p_terms_version:metadata.documents.terms.version,
    p_privacy_version:metadata.documents.privacy.version,
    p_dpa_version:metadata.documents.dpa.version,
  })
  if (error || data?.published !== true || data?.accepted !== true || !versionsMatch(data)) {
    throw new Error('Acceptance could not be confirmed. Reload to check the current documents and retry.')
  }
  return data
}
