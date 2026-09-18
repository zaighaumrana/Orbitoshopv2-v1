// Shop RPC contract only. Platform authentication and transport stay server-side.
export function createPlatformBridge(client, storage = localStorage) {
  let resupplyFlight = null
  return {
    async readBilling() {
      const { data, error } = await client.rpc('get_platform_billing')
      if (error) throw error
      return data
    },
    requestResupply(actorId) {
      if (resupplyFlight) return resupplyFlight
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
      })().finally(() => { resupplyFlight = null })
      return resupplyFlight
    },
  }
}
