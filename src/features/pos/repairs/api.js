/* ═══════════════════════════════════════════════════════════════════
   features/pos/repairs/api.js
   POS-exclusive repairs operations -- verified by actual caller (only
   pos.js), not assumed by domain name. generateTicketNumber() moved
   here too since its only real caller is insertNewTicketFromCart()
   below; the genuinely shared repairs operations (getSubInvoices,
   createSubInvoice, markComponentNotNeeded, used by pos.js, admin.js,
   AND workshop.js) stay at features/repairs/api.js.
═══════════════════════════════════════════════════════════════════ */
import { sb, logBillEvent } from '../../../shared.js'
import { dlog } from '../../../debuglog.js'
import { calcDraftTotal, calcDraftPaid } from './state.js'

/**
 * Inserts a brand-new ticket from a cart line's draft data. Pure data
 * operation -- returns {ok, data, error}; caller (pos.js's placeOrder())
 * handles cart cleanup, state.modal, and render().
 */
export async function insertNewTicketFromCart(ticketItem) {
  dlog('pos.repairs.insertNewTicketFromCart', `ENTRY customerName=${ticketItem.customerName}`)
  const draft = ticketItem.draftData
  const total = calcDraftTotal(draft)
  const paid  = calcDraftPaid(draft)

  if (paid > total) return { ok: false, error: 'Initial payment cannot exceed the repair invoice.' }
  const tenders = draft.payments.map(p => ({
    amount: Number(p.amount),
    method: p.method,
    ...(p.method === 'Cash' ? { cashTendered:Number(p.amount) } : {}),
  }))
  const { data: result, error } = await sb.rpc('create_repair_ticket', {
    p_request_id: ticketItem.requestId,
    p_ticket: {
      customerName: ticketItem.customerName,
      customerPhone: ticketItem.customerPhone,
      deviceBrand: ticketItem.deviceBrand,
      deviceModel: ticketItem.deviceModel,
      imei: ticketItem.imei,
      components: draft.components,
      labourCost: Number(draft.labour || 0),
      quotedAmount: total,
      technicianNote: ticketItem.technicianNote || '',
    },
    p_tenders: tenders,
  })

  if (error) { dlog('pos.repairs.insertNewTicketFromCart', `FAILED: ${error.message}`); return { ok: false, error: error.message } }
  await logBillEvent()
  dlog('pos.repairs.insertNewTicketFromCart', `SUCCEEDED ticket_number=${result.ticket.ticket_number} id=${result.ticket.id} replay=${result.idempotentReplay}`)
  return { ok: true, data: result.ticket, financial: result }
}

/**
 * Applies a top-up payment to an existing ticket, parent-first then
 * oldest-to-newest across any sub-invoices, so the original balance is
 * always cleared before sub-invoice balances. Pure data operation --
 * returns {ok, error}; caller handles cart cleanup, load(), and the
 * confirmation alert.
 */
export async function collectTicketPayment(ticket, payAmount, payMethod, requestId) {
  dlog('pos.repairs.collectTicketPayment', `ENTRY ticketId=${ticket.id} amount=${payAmount}`)
  const { data, error } = await sb.rpc('record_repair_payment', {
    p_request_id: requestId,
    p_root_ticket_id: ticket.id,
    p_tenders: [{
      amount: Number(payAmount),
      method: payMethod,
      ...(payMethod === 'Cash' ? { cashTendered:Number(payAmount) } : {}),
    }],
  })
  if (error) { dlog('pos.repairs.collectTicketPayment', `FAILED: ${error.message}`); return { ok: false, error: error.message } }
  await logBillEvent()
  dlog('pos.repairs.collectTicketPayment', `SUCCEEDED replay=${data.idempotentReplay}`)
  return { ok: true, data }
}
