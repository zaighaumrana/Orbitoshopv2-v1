import metadata from './metadata.json'
import subprocessors from './subprocessors.json'

export const finalizingMessage = 'Legal documents are being finalized.'
const resolved = value => typeof value === 'string' && value.trim() !== '' && !/\{\{|\}\}|\[|\]/.test(value)

// An additional presentation safeguard, NOT authority to publish or accept.
export function legalConfigurationReady(config = metadata, providers = subprocessors) {
  return config.requiredCompanyFields.every(key => resolved(config.company[key]))
    && config.subprocessorScheduleReviewed === true && providers.length > 0
    && providers.every(provider => ['provider','purpose','location','reference','status'].every(key => resolved(provider[key])))
}

export function customerDocument(key, source, publication, config = metadata, providers = subprocessors) {
  if (!['terms','privacy','dpa'].includes(key)) return {text:source,finalized:true}
  const matches = publication?.required_revision === config.requiredRevision
    && ['terms','privacy','dpa'].every(doc => publication[doc + '_version'] === config.documents[doc].version)
  if (publication?.published !== true || !matches || !legalConfigurationReady(config,providers)) {
    return {text:'# ' + finalizingMessage,finalized:false}
  }
  const schedule = providers.map(p=>`- ${p.provider}: ${p.purpose}. Location: ${p.location}. ${p.status}. Reference: ${p.reference}`).join('\n')
  const text = source.replace(/\{\{([A-Z_]+)\}\}/g, (_,key) => {
    if (key === 'SUBPROCESSORS') return schedule
    if (config.optionalCompanyFields.includes(key) && !resolved(config.company[key])) return 'Not listed; contact the privacy team if applicable'
    return config.company[key] || '{{' + key + '}}'
  })
  // Unknown template tokens also fail closed instead of appearing contractual.
  if (/\{\{|\}\}/.test(text)) return {text:'# ' + finalizingMessage,finalized:false}
  return {text,finalized:true}
}

export async function readPublicPublication(url, key, fetcher = fetch) {
  try {
    const response = await fetcher(url + '/rest/v1/rpc/get_legal_publication', {
      method:'POST', headers:{apikey:key,'Content-Type':'application/json'},
      body:'{}', cache:'no-store', signal:AbortSignal.timeout(8000),
    })
    return response.ok ? await response.json() : null
  } catch { return null }
}
