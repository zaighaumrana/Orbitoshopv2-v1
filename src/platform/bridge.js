// Shop RPC contract only. Platform authentication and transport stay server-side.
export function createPlatformBridge(client, storage = localStorage) {
  let resupplyFlight = null
  let resupplyActor = null
  return {
    async readBilling(actorId) {
      const { data, error } = await client.rpc('get_platform_billing')
      if (error) throw error
      // A successful authenticated Shop read can acknowledge a response lost
      // after commit. Clear only that actor's exact observed request identity.
      if(actorId){
        const key=`orbito-resupply-request:${actorId}`,pending=storage.getItem(key)
        if(pending&&data?.paper_requests?.some(r=>r.request_id===pending))storage.removeItem(key)
      }
      return data
    },
    requestResupply(actorId) {
      if (resupplyFlight) return actorId===resupplyActor?resupplyFlight:Promise.reject(new Error('A previous session request is still finishing. Refresh status before retrying.'))
      resupplyActor = actorId
      resupplyFlight = (async () => {
        if (!actorId) throw new Error('Please sign in again.')
        const key = `orbito-resupply-request:${actorId}`
        // Persist BEFORE sending: a timeout/reload retries the same identity.
        let requestId = storage.getItem(key)
        if (!requestId) {
          requestId = crypto.randomUUID()
          storage.setItem(key, requestId)
        }
        const { data, error } = await client.rpc('request_paper_resupply', { p_request_id: requestId })
        if (error) throw error
        if (!data?.accepted) throw new Error('The request was not accepted. Please retry.')
        storage.removeItem(key)
        return data
      })().finally(() => { resupplyFlight = null; resupplyActor = null })
      return resupplyFlight
    },
  }
}
