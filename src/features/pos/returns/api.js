import { sb } from '../../../shared.js'

const pendingReturnRequests = new Map()

export async function getRetailReturnContext(saleId) {
  const { data, error } = await sb.rpc('get_retail_return_context', {
    p_sale_id: Number(saleId),
  })
  return error ? { ok:false, error:error.message } : { ok:true, data }
}

export async function createRetailReturn(saleId, lines, refundMethod, reason) {
  const key = String(saleId)
  const requestId = pendingReturnRequests.get(key) || crypto.randomUUID()
  pendingReturnRequests.set(key, requestId)
  const { data, error } = await sb.rpc('create_retail_return', {
    p_request_id: requestId,
    p_sale_id: Number(saleId),
    p_lines: lines,
    p_refund_method: refundMethod || '',
    p_reason: reason,
  })
  if (error) return { ok:false, error:error.message }
  pendingReturnRequests.delete(key)
  return { ok:true, data }
}
