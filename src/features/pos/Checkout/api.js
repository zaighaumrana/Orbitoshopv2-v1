/* ═══════════════════════════════════════════════════════════════════
   features/pos/checkout/api.js
   All Supabase-facing operations for retail sale checkout --
   POS-exclusive, verified by actual caller (only pos.js calls either
   of these).

   Both functions are pure data operations -- DB write in, {ok, ...}
   out. No render() calls, no state.modal mutation. That's a deliberate
   change from how these lived in pos.js (settleUdhar used to call
   render() and set state.modal itself); the caller now handles UI
   updates, matching the pattern already established in
   features/repairs/api.js (createTicket/updateTicket etc.).

   Parameterized rather than reading posState directly: posState.cart
   is POS-view orchestration state, not owned by Checkout -- it also
   holds repair-ticket lines (see placeOrder() in pos.js), so neither
   feature can claim exclusive ownership of it. pos.js passes in
   whatever this layer needs.
═══════════════════════════════════════════════════════════════════ */
import { sb, CFG, generateInvoiceNumber, logBillEvent } from '../../../shared.js'
import { dlog } from '../../../debuglog.js'

/**
 * Applies a payment against an existing udhar (credit) record.
 * Caller passes the full record (already loaded via state.data.udhar),
 * not just an id -- same pattern as createSubInvoice(parentTicket, ...)
 * in features/repairs/api.js.
 */
export async function settleUdhar(record, amount, method) {
  dlog('checkout.settleUdhar', `ENTRY udharId=${record?.id} amount=${amount} method=${method}`)
  if (!record) return { ok: false, error: 'Udhar record not found.' }

  const history = record.payment_history || []
  history.push({ date: new Date().toISOString().slice(0,10), paid: amount, method })
  const newPaid    = Number(record.amount_paid) + Number(amount)
  const newBalance = Math.max(0, Number(record.total_amount) - newPaid)

  const { error } = await sb.from('udhar').update({
    amount_paid: newPaid, balance_due: newBalance, payment_history: history,
    status: newBalance <= 0 ? 'Settled' : 'Partial',
    settled_at: newBalance <= 0 ? new Date().toISOString() : null,
  }).eq('id', record.id)

  if (error) { dlog('checkout.settleUdhar', `FAILED: ${error.message}`); return { ok: false, error: error.message } }
  dlog('checkout.settleUdhar', 'SUCCEEDED')
  return { ok: true }
}

/**
 * Records a retail sale (and its udhar record, if paid on credit).
 * Takes everything it needs as parameters -- cart contents and the
 * checkout-flow fields (payment method, cash tendered, udhar info) --
 * rather than reading posState directly.
 */
export async function finalizeCheckout({
  cart, checkoutPayment, cashTendered, udharName, udharPhone, udharPaidNow,
  employeeId, employeeName,
}) {
  dlog('checkout.finalizeCheckout', `ENTRY items=${cart.length} payment=${checkoutPayment}`)
  const isUdhar  = checkoutPayment === 'Udhar (Credit)'
  const subtotal = cart.reduce((s,i) => s + i.soldPrice * i.qty, 0)
  const discount = cart.reduce((s,i) => s + (i.originalPrice - i.soldPrice) * i.qty, 0)
  const tax      = subtotal * (Number(CFG.tax_rate||0) / 100)
  const total    = subtotal + tax

  const invoiceNumber = await generateInvoiceNumber()

  const { data: saleData, error: saleErr } = await sb.from('sales').insert({
    ticket_id:      null,
    invoice_number: invoiceNumber,
    customer_name:  udharName || '',
    items_sold:     cart.map(i => ({ name:i.name, variant_name:i.variantName||'', qty:i.qty, original_price:i.originalPrice, sold_price:i.soldPrice, discount:i.discount, reason:i.reason||'' })),
    discount,
    tax,
    total_bill:     Math.max(0, total),
    payment_method: isUdhar ? 'Udhar' : checkoutPayment,
    employee_id:    employeeId || null,
    employee_name:  employeeName || '',
    cash_tendered:  checkoutPayment === 'Cash' ? (cashTendered||0) : 0,
    change_given:   checkoutPayment === 'Cash' ? Math.max(0, (cashTendered||0) - Math.max(0,total)) : 0,
  }).select().single()

  if (saleErr) { dlog('checkout.finalizeCheckout', `SALE INSERT FAILED: ${saleErr.message}`); return { ok: false, error: saleErr.message } }

  if (isUdhar) {
    const paidNow = Math.min(Number(udharPaidNow||0), Math.max(0,total))
    const balance = Math.max(0, total - paidNow)
    const { error: udharErr } = await sb.from('udhar').insert({
      sale_id: saleData.id, customer_name: udharName, customer_phone: udharPhone,
      total_amount: Math.max(0,total), amount_paid: paidNow, balance_due: balance,
      payment_history: paidNow > 0 ? [{ amount:paidNow, method:'Cash', date:new Date().toISOString(), note:'Paid at time of sale' }] : [],
      status: balance <= 0 ? 'Settled' : 'Outstanding',
    })
    if (udharErr) { dlog('checkout.finalizeCheckout', `UDHAR INSERT FAILED: ${udharErr.message}`); return { ok: false, error: udharErr.message } }
  }

  const sale = {
    receiptNo: saleData.invoice_number, date: saleData.created_at,
    cashier: employeeName || 'Counter', customer: udharName || 'Walk-in',
    items: cart.map(i => ({...i})), tax, discount,
    total: Math.max(0,total), payment: isUdhar ? 'Udhar' : checkoutPayment,
    cashTendered: checkoutPayment === 'Cash' ? (cashTendered||0) : 0,
    changeGiven:  checkoutPayment === 'Cash' ? Math.max(0, (cashTendered||0) - Math.max(0,total)) : 0,
  }

  await logBillEvent()
  dlog('checkout.finalizeCheckout', `SUCCEEDED receiptNo=${sale.receiptNo}`)
  return { ok: true, sale }
}
