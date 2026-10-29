/* Pure repair-family lookup helpers. Search is evaluated against every
 * parent and child identifier before a family is included in a result set. */
// Cache the relation model only while array members and parent identities match.
// Search/status/financial values are still read from current row objects.
const familyModels=new WeakMap();

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
  const previous=familyModels.get(tickets);
  if(previous&&previous.rows.length===tickets.length&&tickets.every((row,i)=>previous.rows[i][0]===row&&previous.rows[i][1]===row.id&&previous.rows[i][2]===row.parent_ticket_id))return previous.model;
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

  const model=[...families.values()].filter(family => !family.root.parent_ticket_id)
  familyModels.set(tickets,{rows:tickets.map(row=>[row,row.id,row.parent_ticket_id]),model})
  return model
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
  const matchedMembers = family.matchedMembers || []
  const rootMatched = matchedMembers.some(ticket => String(ticket.id) === String(family.root?.id))
  if (rootMatched) return null
  return matchedMembers.find(ticket => ticket.parent_ticket_id) || null
}

/** Operational scope comes from persisted invoices, never proposal details.
 * An approved child starts in operational status Pending; that is not a
 * pending customer decision. Deduplicate invoices, not intentionally repeated
 * component names within or across invoices. */
export function repairFamilyWork(family) {
  const seen = new Set()
  return [family.root, ...family.members].filter(ticket => {
    if (!ticket || seen.has(String(ticket.id))) return false
    seen.add(String(ticket.id))
    return !['Cancelled', 'Declined'].includes(ticket.status)
  }).map(ticket => ({
    ticketId: ticket.id,
    additional: !!ticket.parent_ticket_id,
    invoice: ticket.invoice_number || ticket.ticket_number,
    components: ticket.components_noted || [],
    hasLabour: Number(ticket.labour_cost || 0) > 0,
    note: ticket.technician_note || '',
  }))
}
