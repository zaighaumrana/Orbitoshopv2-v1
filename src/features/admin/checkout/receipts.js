import { databaseDate, localDateKey } from '../../../datetime.js'

function dateValue(value) {
  const time = databaseDate(value).getTime()
  return Number.isFinite(time) ? time : 0
}

/** Build one archive model from retail sales plus persisted repair invoices. */
export function buildReceiptRecords(sales = [], tickets = []) {
  const ticketsById = new Map(tickets.map(ticket => [String(ticket.id), ticket]))
  const repairInvoices = new Set(tickets.map(ticket => ticket.invoice_number).filter(Boolean))
  const repairTicketIds = new Set(tickets.map(ticket => String(ticket.id)))

  const retailRecords = sales
    .filter(sale => !repairInvoices.has(sale.invoice_number) && !repairTicketIds.has(String(sale.ticket_id || '')))
    .map(sale => ({
      key: `sale:${sale.id}`,
      kind: 'sale',
      type: sale.ticket_id ? 'repair' : 'retail',
      label: sale.ticket_id ? 'Repair' : 'Retail',
      id: sale.id,
      invoiceNumber: sale.invoice_number || `INV-${sale.id}`,
      ticketNumber: '',
      parentInvoiceNumber: '',
      customerName: sale.customer_name || 'Walk-in',
      paymentMethod: sale.payment_method || '—',
      employeeName: sale.employee_name || '',
      total: Number(sale.total_bill || 0),
      createdAt: sale.created_at,
      raw: sale,
    }))

  const repairRecords = tickets
    .filter(ticket => ticket.invoice_number)
    .map(ticket => {
      const parent = ticket.parent_ticket_id
        ? ticketsById.get(String(ticket.parent_ticket_id))
        : null
      return {
        key: `ticket:${ticket.id}`,
        kind: 'ticket',
        type: 'repair',
        label: ticket.parent_ticket_id ? 'Repair · Child' : 'Repair',
        id: ticket.id,
        rootTicketId: ticket.parent_ticket_id || ticket.id,
        invoiceNumber: ticket.invoice_number,
        ticketNumber: ticket.ticket_number || '',
        parentInvoiceNumber: parent?.invoice_number || '',
        parentTicketNumber: parent?.ticket_number || '',
        customerName: ticket.customer_name || 'Walk-in',
        customerPhone: ticket.customer_phone || '',
        device: `${ticket.device_brand || ''} ${ticket.device_model || ''}`.trim(),
        paymentMethod: ticket.advance_method || (Number(ticket.amount_paid || 0) > 0 ? 'Recorded payment' : 'Unpaid'),
        employeeName: ticket.created_by || '',
        total: Number(ticket.final_total || ticket.estimated_quote || 0),
        createdAt: ticket.placed_at || ticket.created_at,
        raw: ticket,
        parent,
      }
    })

  return [...retailRecords, ...repairRecords]
    .sort((left, right) => dateValue(right.createdAt) - dateValue(left.createdAt))
}

function matchesReceiptSearch(record, search) {
  return [
    record.invoiceNumber,
    record.ticketNumber,
    record.parentInvoiceNumber,
    record.parentTicketNumber,
    record.customerName,
    record.customerPhone,
    record.device,
    record.paymentMethod,
    record.employeeName,
    record.label,
  ].filter(Boolean).join(' ').toLowerCase().includes(search)
}

function compareRepairFamilyMembers(left, right) {
  const leftIsParent = String(left.id) === String(left.rootTicketId)
  const rightIsParent = String(right.id) === String(right.rootTicketId)
  if (leftIsParent !== rightIsParent) return leftIsParent ? -1 : 1

  const dateDifference = dateValue(left.createdAt) - dateValue(right.createdAt)
  if (dateDifference) return dateDifference

  const invoiceDifference = String(left.invoiceNumber || '').localeCompare(
    String(right.invoiceNumber || ''),
    undefined,
    { numeric:true, sensitivity:'base' },
  )
  if (invoiceDifference) return invoiceDifference
  return String(left.id).localeCompare(String(right.id), undefined, { numeric:true })
}

export function filterReceiptRecords(records = [], adminState = {}) {
  const search = String(adminState.receiptSearch || '').trim().toLowerCase()
  const dateFrom = adminState.receiptDateFrom || ''
  const dateTo = adminState.receiptDateTo || ''
  const type = adminState.receiptType || 'all'

  const typeScopedRecords = records.filter(record => type === 'all' || record.type === type)
  const scopedRecords = typeScopedRecords.filter(record => {
    const recordDate = localDateKey(record.createdAt)
    return (!dateFrom || recordDate >= dateFrom)
      && (!dateTo || recordDate <= dateTo)
  })

  if (!search) return scopedRecords

  const exactRepairInvoiceMatches = typeScopedRecords.filter(record => (
    record.kind === 'ticket'
    && String(record.invoiceNumber || '').trim().toLowerCase() === search
  ))

  if (!exactRepairInvoiceMatches.length) {
    return scopedRecords.filter(record => matchesReceiptSearch(record, search))
  }

  // The date range gates the searched invoice; once eligible, keep its complete
  // family together even when parent and child invoices were created on different days.
  const directRepairInvoiceMatches = exactRepairInvoiceMatches.filter(record => {
    const recordDate = localDateKey(record.createdAt)
    return (!dateFrom || recordDate >= dateFrom) && (!dateTo || recordDate <= dateTo)
  })
  if (!directRepairInvoiceMatches.length) return []

  const result = []
  const includedKeys = new Set()
  directRepairInvoiceMatches.forEach(match => {
    const familyId = String(match.rootTicketId)
    const family = typeScopedRecords
      .filter(record => record.kind === 'ticket' && String(record.rootTicketId) === familyId)
      .sort(compareRepairFamilyMembers)

    ;[match, ...family].forEach(record => {
      if (includedKeys.has(record.key)) return
      includedKeys.add(record.key)
      result.push(record)
    })
  })
  return result
}
