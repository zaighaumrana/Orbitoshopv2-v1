/* ═══════════════════════════════════════════════════════════════════
   features/repairs/api.js
   The genuinely shared slice of Repairs' Supabase operations --
   verified by actual caller, not assumed by domain name. Every
   function here is called from pos.js, admin.js, AND workshop.js.

   POS-exclusive repairs logic (insertNewTicketFromCart,
   collectTicketPayment, generateTicketNumber, and the render/state
   layers) lives in features/pos/repairs/ instead -- see that folder
   for the reasoning. createTicket()/updateTicket() have zero current
   callers anywhere (dead code, same as when this was first flagged in
   shared.js) -- kept here as the generic ticket-ops home; createTicket
   takes ticketNumber as a parameter now rather than generating one
   itself, since that logic lives in the POS-only folder and a shared
   file importing from a view-owned one would invert the intended
   dependency direction.
═══════════════════════════════════════════════════════════════════ */
import { sb } from '../../shared.js'
import { dlog, dstack } from '../../debuglog.js'

const pendingAdditionalWorkRequests = new Map()
const pendingDeliveryRequests = new Map()

export async function createTicket(payload, employeeName, ticketNumber) {
  dstack('repairs.createTicket', `ENTRY customerName=${payload.customerName} employeeName=${employeeName} -- NOTE: this function currently has no known callers in the app, so if this fires, the stack trace above is the answer`)
  const advance = Number(payload.advance || 0)
  const method = payload.advanceMethod || 'Cash'
  const { data: result, error } = await sb.rpc('create_repair_ticket', {
    p_request_id: crypto.randomUUID(),
    p_ticket: {
      customerName: payload.customerName || '',
      customerPhone: payload.customerPhone || '',
      deviceBrand: payload.deviceBrand || '',
      deviceModel: payload.deviceModel || '',
      imei: payload.imei || '',
      components: payload.components || [],
      labourCost: Number(payload.labourCost || 0),
      quotedAmount: Number(payload.estimatedQuote || 0),
      technicianNote: payload.technicianNote || '',
    },
    p_tenders: advance > 0 ? [{
      amount: advance, method,
      ...(method === 'Cash' ? { cashTendered:advance } : {}),
    }] : [],
  })
  if (error) { dlog('repairs.createTicket', `FAILED: ${error.message}`); return { ok: false, error: error.message } }
  dlog('repairs.createTicket', `SUCCEEDED ticket_number=${result.ticket.ticket_number}`)
  return { ok: true, data: result.ticket }
}

export async function updateTicket(id, updates) {
  dlog('repairs.updateTicket', `ENTRY id=${id} keys=${Object.keys(updates).join(',')}`)
  const mapped = {}
  if (updates.components     !== undefined) mapped.components_noted = updates.components
  if (updates.status         !== undefined) mapped.status           = updates.status
  if (updates.declineReason  !== undefined) mapped.decline_reason   = updates.declineReason
  if (updates.technicianNote !== undefined) mapped.technician_note  = updates.technicianNote
  if (updates.settledAt      !== undefined) mapped.settled_at       = updates.settledAt
  if (updates.update_note    !== undefined) mapped.update_note      = updates.update_note
  if (updates.actual_quote   !== undefined) mapped.actual_quote     = updates.actual_quote
  if (updates.labour_cost    !== undefined) mapped.labour_cost      = updates.labour_cost
  const { error } = await sb.from('tickets').update(mapped).eq('id', id)
  if (error) { dlog('repairs.updateTicket', `FAILED: ${error.message}`); return { ok: false, error: error.message } }
  dlog('repairs.updateTicket', 'SUCCEEDED')
  return { ok: true }
}

/** All sub-invoices that already exist under a parent ticket, oldest first.
 *  Called by pos.js, admin.js, AND workshop.js -- genuinely shared. */
export async function getSubInvoices(parentId) {
  const { data, error } = await sb.from('tickets')
    .select('*').eq('parent_ticket_id', parentId).order('created_at', { ascending: true })
  if (error) { console.warn('getSubInvoices failed:', error.message); return [] }
  return data || []
}

/**
 * Creates a sub-invoice under a locked parent ticket. Never touches the
 * parent's own components/labour/quote. Automatically credits whatever is
 * left of the parent's advance payment (after accounting for any earlier
 * sub-invoices that already drew on it) against this new sub's total.
 * Called by pos.js, admin.js, AND workshop.js -- genuinely shared.
 */
export async function createSubInvoice(parentTicket, components, labourCost, note, employeeName) {
  const componentsTotal = (components||[]).reduce((s,c) => s + Number(c.price||0), 0)
  const total = componentsTotal + Number(labourCost||0)
  const key = JSON.stringify([parentTicket.id, components || [], Number(labourCost || 0), note || ''])
  const requestId = pendingAdditionalWorkRequests.get(key) || crypto.randomUUID()
  pendingAdditionalWorkRequests.set(key, requestId)
  const description = (components || []).map(c => c.name).filter(Boolean).join(', ') || note || 'Additional work'
  const { data: result, error } = await sb.rpc('approve_additional_work', {
    p_request_id: requestId,
    p_root_ticket_id: parentTicket.id,
    p_description: description,
    p_details: { components:components || [], labourCost:Number(labourCost || 0), note:note || '' },
    p_quoted_amount: total,
    p_decision_method: 'In person',
    p_decision_note: note || '',
  })
  if (error) return { ok: false, error: error.message }
  pendingAdditionalWorkRequests.delete(key)
  return { ok: true, data:result.ticket, creditApplied:0, proposal:result.proposal }
}

export async function deliverRepair(rootTicketId, allowUdhar = false) {
  const key = String(rootTicketId)
  const requestId = pendingDeliveryRequests.get(key) || crypto.randomUUID()
  pendingDeliveryRequests.set(key, requestId)
  const { data, error } = await sb.rpc('deliver_repair', {
    p_request_id: requestId,
    p_root_ticket_id: rootTicketId,
    p_allow_udhar: allowUdhar,
  })
  if (error) return { ok:false, error:error.message }
  pendingDeliveryRequests.delete(key)
  return { ok:true, data }
}

/**
 * The ONE allowed mutation to a locked ticket's original components — marks
 * one component as not needed (e.g. turned out to just need cleaning).
 * Never deletes it; the parent keeps showing the full original list with
 * the reason attached. Caller is responsible for PIN-gating this first.
 * Called by pos.js, admin.js, AND workshop.js -- genuinely shared.
 */
export async function markComponentNotNeeded(ticketId, componentsNoted, index, reason, employeeName) {
  const updated = [...componentsNoted]
  if (!updated[index]) return { ok: false, error: 'Component not found.' }
  updated[index] = { ...updated[index], removed: true, removedReason: reason||'', removedBy: employeeName||'' }
  const { error } = await sb.from('tickets').update({ components_noted: updated }).eq('id', ticketId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
