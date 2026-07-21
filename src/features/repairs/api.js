/* ═══════════════════════════════════════════════════════════════════
   features/repairs/api.js
   All Supabase-facing operations for repair tickets. Moved out of
   shared.js during the Repairs extraction (see architecture refactor).

   Ownership test applied: "if deleting the Repairs feature would also
   delete this function, it belongs here." generateInvoiceNumber() and
   matchesInvoiceSearch() stayed in shared.js instead, because Checkout
   needs them too — see shared.js's own comment on generateInvoiceNumber.
═══════════════════════════════════════════════════════════════════ */
import { sb, CFG, _datePart, generateInvoiceNumber } from '../../shared.js'
import { dlog, dstack } from '../../debuglog.js'

/** Separate sequence, purely for the technician-facing ticket reference —
 *  does not represent money and is never shown as the primary number. */
export async function generateTicketNumber() {
  const { data: seq, error } = await sb.rpc('next_ticket_seq')
  if (error) { dlog('repairs.generateTicketNumber', `RPC FAILED, falling back to Date.now(): ${error.message}`); console.warn('next_ticket_seq failed, falling back:', error.message) }
  const n = error ? Date.now() % 10000 : seq
  const result = `${CFG.ticket_prefix||'TK'}${_datePart()}${String(n).padStart(4,'0')}`
  dlog('repairs.generateTicketNumber', `-> ${result}`)
  return result
}

export async function createTicket(payload, employeeName) {
  dstack('repairs.createTicket', `ENTRY customerName=${payload.customerName} employeeName=${employeeName} -- NOTE: this function currently has no known callers in the app, so if this fires, the stack trace above is the answer`)
  const ticketNo  = await generateTicketNumber()
  const invoiceNo = await generateInvoiceNumber()
  const { data, error } = await sb.from('tickets').insert({
    ticket_number:    ticketNo,
    invoice_number:   invoiceNo,
    customer_name:    payload.customerName   || '',
    customer_phone:   payload.customerPhone  || '',
    device_brand:     payload.deviceBrand    || '',
    device_model:     payload.deviceModel    || '',
    imei:             payload.imei           || '',
    components_noted: payload.components     || [],
    estimated_quote:  Number(payload.estimatedQuote || 0),
    advance_payment:  Number(payload.advance        || 0),
    advance_method:   payload.advanceMethod  || '',
    status:           'Pending',
    technician_note:  payload.technicianNote || '',
    created_by:       employeeName           || 'Counter',
    is_locked:        true,
  }).select().single()
  if (error) { dlog('repairs.createTicket', `FAILED: ${error.message}`); return { ok: false, error: error.message } }
  dlog('repairs.createTicket', `SUCCEEDED ticket_number=${data.ticket_number}`)
  return { ok: true, data }
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

/** All sub-invoices that already exist under a parent ticket, oldest first. */
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
 */
export async function createSubInvoice(parentTicket, components, labourCost, note, employeeName) {
  const existingSubs = await getSubInvoices(parentTicket.id)
  const suffix = String.fromCharCode(65 + existingSubs.length) // A, B, C, ...

  const componentsTotal = (components||[]).reduce((s,c) => s + Number(c.price||0), 0)
  const total = componentsTotal + Number(labourCost||0)

  const alreadyCredited = existingSubs.reduce((sum, s) =>
    sum + (s.payment_history||[])
      .filter(p => p.type === 'advance_credit')
      .reduce((a,p) => a + Number(p.amount||0), 0)
  , 0)
  const remainingAdvance = Math.max(0, Number(parentTicket.advance_payment||0) - alreadyCredited)
  const creditApplied    = Math.min(remainingAdvance, total)
  const balanceDue       = Math.max(0, total - creditApplied)

  const paymentHistory = creditApplied > 0
    ? [{ type:'advance_credit', amount:creditApplied, date:new Date().toISOString(), note:'Credited from original advance payment' }]
    : []

  const { data, error } = await sb.from('tickets').insert({
    parent_ticket_id:  parentTicket.id,
    invoice_number:    `${parentTicket.invoice_number}-${suffix}`,
    ticket_number:      `${parentTicket.ticket_number}-${suffix}`,
    customer_name:      parentTicket.customer_name,
    customer_phone:     parentTicket.customer_phone,
    device_brand:       parentTicket.device_brand,
    device_model:       parentTicket.device_model,
    imei:               parentTicket.imei,
    components_noted:   components || [],
    labour_cost:        Number(labourCost||0),
    estimated_quote:    total,
    final_total:        total,
    amount_paid:        creditApplied,
    balance_due:        balanceDue,
    payment_history:    paymentHistory,
    technician_note:    note || '',
    status:              'Pending',
    is_locked:           true,
    created_by:          employeeName || 'Technician',
  }).select().single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, data, creditApplied }
}

/**
 * The ONE allowed mutation to a locked ticket's original components — marks
 * one component as not needed (e.g. turned out to just need cleaning).
 * Never deletes it; the parent keeps showing the full original list with
 * the reason attached. Caller is responsible for PIN-gating this first.
 */
export async function markComponentNotNeeded(ticketId, componentsNoted, index, reason, employeeName) {
  const updated = [...componentsNoted]
  if (!updated[index]) return { ok: false, error: 'Component not found.' }
  updated[index] = { ...updated[index], removed: true, removedReason: reason||'', removedBy: employeeName||'' }
  const { error } = await sb.from('tickets').update({ components_noted: updated }).eq('id', ticketId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
