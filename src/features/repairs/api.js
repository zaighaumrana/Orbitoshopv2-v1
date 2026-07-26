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
import { sb, generateInvoiceNumber } from '../../shared.js'
import { dlog, dstack } from '../../debuglog.js'

export async function createTicket(payload, employeeName, ticketNumber) {
  dstack('repairs.createTicket', `ENTRY customerName=${payload.customerName} employeeName=${employeeName} -- NOTE: this function currently has no known callers in the app, so if this fires, the stack trace above is the answer`)
  const invoiceNo = await generateInvoiceNumber()
  const { data, error } = await sb.from('tickets').insert({
    ticket_number:    ticketNumber,
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
