/* ═══════════════════════════════════════════════════════════════════
   features/pos/repairs/api.js
   POS-exclusive repairs operations -- verified by actual caller (only
   pos.js), not assumed by domain name. generateTicketNumber() moved
   here too since its only real caller is insertNewTicketFromCart()
   below; the genuinely shared repairs operations (getSubInvoices,
   createSubInvoice, markComponentNotNeeded, used by pos.js, admin.js,
   AND workshop.js) stay at features/repairs/api.js.
═══════════════════════════════════════════════════════════════════ */
import { sb, CFG, _datePart, generateInvoiceNumber, logBillEvent } from '../../../shared.js'
import { dlog } from '../../../debuglog.js'
import { calcDraftTotal, calcDraftPaid } from './state.js'
import { combinedBalance } from './render.js'

/** Separate sequence, purely for the technician-facing ticket reference —
 *  does not represent money and is never shown as the primary number. */
export async function generateTicketNumber() {
  const { data: seq, error } = await sb.rpc('next_ticket_seq')
  if (error) { dlog('pos.repairs.generateTicketNumber', `RPC FAILED, falling back to Date.now(): ${error.message}`); console.warn('next_ticket_seq failed, falling back:', error.message) }
  const n = error ? Date.now() % 10000 : seq
  const result = `${CFG.ticket_prefix||'TK'}${_datePart()}${String(n).padStart(4,'0')}`
  dlog('pos.repairs.generateTicketNumber', `-> ${result}`)
  return result
}

/**
 * Inserts a brand-new ticket from a cart line's draft data. Pure data
 * operation -- returns {ok, data, error}; caller (pos.js's placeOrder())
 * handles cart cleanup, state.modal, and render().
 */
export async function insertNewTicketFromCart(ticketItem, employeeName) {
  dlog('pos.repairs.insertNewTicketFromCart', `ENTRY customerName=${ticketItem.customerName}`)
  const draft = ticketItem.draftData
  const total = calcDraftTotal(draft)
  const paid  = calcDraftPaid(draft)

  const ticketNumber  = await generateTicketNumber()
  const invoiceNumber = await generateInvoiceNumber()
  const { data, error } = await sb.from('tickets').insert({
    ticket_number:     ticketNumber,
    invoice_number:    invoiceNumber,
    customer_name:      ticketItem.customerName,
    customer_phone:     ticketItem.customerPhone,
    device_brand:       ticketItem.deviceBrand,
    device_model:       ticketItem.deviceModel,
    imei:                ticketItem.imei,
    components_noted:   draft.components,
    labour_cost:         Number(draft.labour||0),
    estimated_quote:     total,
    final_total:         total,
    amount_paid:         paid,
    balance_due:         Math.max(0, total - paid),
    payment_history:     draft.payments,
    advance_payment:     paid,
    advance_method:      [...new Set(draft.payments.map(p=>p.method))].join(' + '),
    status:              'Pending',
    technician_note:     ticketItem.technicianNote || '',
    created_by:          employeeName || 'Counter',
    is_locked:           true,
    placed_at:           new Date().toISOString(),
  }).select().single()

  if (error) { dlog('pos.repairs.insertNewTicketFromCart', `FAILED: ${error.message}`); return { ok: false, error: error.message } }
  await logBillEvent()
  dlog('pos.repairs.insertNewTicketFromCart', `SUCCEEDED ticket_number=${data.ticket_number} id=${data.id}`)
  return { ok: true, data }
}

/**
 * Applies a top-up payment to an existing ticket, parent-first then
 * oldest-to-newest across any sub-invoices, so the original balance is
 * always cleared before sub-invoice balances. Pure data operation --
 * returns {ok, error}; caller handles cart cleanup, load(), and the
 * confirmation alert.
 */
export async function collectTicketPayment(ticket, payAmount, payMethod) {
  dlog('pos.repairs.collectTicketPayment', `ENTRY ticketId=${ticket.id} amount=${payAmount}`)
  const { subs } = combinedBalance(ticket)
  const orderedTickets = [ticket, ...subs.sort((a,b) => new Date(a.created_at) - new Date(b.created_at))]

  let remaining = payAmount
  for (const t of orderedTickets) {
    const tTotal   = Number(t.final_total || t.estimated_quote || 0)
    const tBalance = Math.max(0, tTotal - Number(t.amount_paid||0))
    if (tBalance <= 0 || remaining <= 0) continue

    const applied = Math.min(remaining, tBalance)
    remaining -= applied

    const history = [...(t.payment_history||[]), { amount: applied, method: payMethod, date: new Date().toISOString() }]
    const newPaid = Number(t.amount_paid||0) + applied
    const newBalance = Math.max(0, tTotal - newPaid)

    const { error } = await sb.from('tickets').update({
      amount_paid: newPaid,
      balance_due: newBalance,
      payment_history: history,
      status: newBalance <= 0 ? 'Ready' : t.status,
      collected_at: newBalance <= 0 ? new Date().toISOString() : null,
    }).eq('id', t.id)

    if (error) { dlog('pos.repairs.collectTicketPayment', `FAILED on ticket ${t.id}: ${error.message}`); return { ok: false, error: error.message } }
  }
  await logBillEvent()
  dlog('pos.repairs.collectTicketPayment', 'SUCCEEDED')
  return { ok: true }
}
