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
import { sb, CFG, logBillEvent } from '../../../shared.js'
import { dlog } from '../../../debuglog.js'

/**
 * Records a retail sale (and its udhar record, if paid on credit).
 * Takes everything it needs as parameters -- cart contents and the
 * checkout-flow fields (payment method, cash tendered, udhar info) --
 * rather than reading posState directly.
 */
export async function finalizeCheckout({
  cart, checkoutPayment, cashTendered, udharName, udharPhone, udharPaidNow,
  employeeName, requestId,
}) {
  dlog('checkout.finalizeCheckout', `ENTRY items=${cart.length} payment=${checkoutPayment}`)
  const isUdhar  = checkoutPayment === 'Udhar (Credit)'
  const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100
  const subtotal = roundMoney(cart.reduce((s,i) => s + i.soldPrice * i.qty, 0))
  const discount = roundMoney(cart.reduce((s,i) => s + (i.originalPrice - i.soldPrice) * i.qty, 0))
  const tax      = roundMoney(subtotal * (Number(CFG.tax_rate||0) / 100))
  const total    = roundMoney(subtotal + tax)
  const paidNow = isUdhar ? Math.min(roundMoney(udharPaidNow || 0), total) : total

  if (checkoutPayment === 'Cash' && Number(cashTendered || 0) < total) {
    return { ok: false, error: 'Cash received is less than the sale total. Use Udhar for an unpaid balance.' }
  }

  const tenders = isUdhar
    ? (paidNow > 0 ? [{ method:'Cash', amount:paidNow, cashTendered:paidNow }] : [])
    : [{
        method: checkoutPayment,
        amount: total,
        ...(checkoutPayment === 'Cash' ? { cashTendered:roundMoney(cashTendered || 0) } : {}),
      }]

  const lines = cart.map(i => ({
    itemKind: i.isInventory ? 'inventory' : i.isQuick ? 'quick' : 'other',
    inventoryId: i.isInventory ? i.inventoryId : undefined,
    quickItemId: i.isQuick ? i.quickItemId : undefined,
    name: i.name,
    variantName: i.variantName || '',
    quantity: i.qty,
    originalPrice: roundMoney(i.originalPrice),
    unitPrice: roundMoney(i.soldPrice),
    discountReason: i.reason || '',
  }))

  const { data: saleData, error: saleErr } = await sb.rpc('create_retail_sale', {
    p_request_id: requestId,
    p_lines: lines,
    p_tenders: tenders,
    p_allow_credit: isUdhar,
    p_customer_name: udharName || '',
    p_customer_phone: udharPhone || '',
  })

  if (saleErr) {
    dlog('checkout.finalizeCheckout', `ATOMIC CHECKOUT FAILED: ${saleErr.message}`)
    return { ok: false, error: saleErr.message }
  }

  const sale = {
    receiptNo: saleData.invoiceNumber, date: saleData.createdAt,
    cashier: saleData.employeeName || employeeName || 'Counter', customer: udharName || 'Walk-in',
    items: cart.map(i => ({...i})), tax, discount,
    total: Math.max(0,total), payment: isUdhar ? 'Udhar' : checkoutPayment,
    cashTendered: saleData.cashTendered || 0,
    changeGiven:  saleData.changeGiven || 0,
  }

  await logBillEvent()
  dlog('checkout.finalizeCheckout', `SUCCEEDED receiptNo=${sale.receiptNo} replay=${saleData.idempotentReplay}`)
  return { ok: true, sale }
}
