/* Pure repair-family lookup helpers. Search is evaluated against every
 * parent and child identifier before a family is included in a result set. */

function searchableTicketText(ticket) {
  return [
    ticket.customer_name,
    ticket.customer_phone,
    ticket.device_brand,
    ticket.device_model,
    ticket.imei,
    ticket.ticket_number,
    ticket.invoice_number,
    ticket.status,
  ].filter(Boolean).join(' ').toLowerCase()
}

export function groupRepairFamilies(tickets = []) {
  const byId = new Map(tickets.map(ticket => [String(ticket.id), ticket]))
  const families = new Map()

  tickets.forEach(ticket => {
    const rootId = String(ticket.parent_ticket_id || ticket.id)
    if (!families.has(rootId)) {
      families.set(rootId, {
        root: byId.get(rootId) || ticket,
        members: [],
      })
    }
    families.get(rootId).members.push(ticket)
  })

  return [...families.values()].filter(family => !family.root.parent_ticket_id)
}

export function findRepairFamilies(tickets = [], query = '') {
  const search = String(query || '').trim().toLowerCase()
  return groupRepairFamilies(tickets).map(family => {
    const matchedMembers = search
      ? family.members.filter(ticket => searchableTicketText(ticket).includes(search))
      : []
    return { ...family, matchedMembers }
  }).filter(family => !search || family.matchedMembers.length > 0)
}

export function matchedRepairChild(family) {
  return family.matchedMembers?.find(ticket => ticket.parent_ticket_id) || null
}
