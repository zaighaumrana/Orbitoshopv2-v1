// STAGE 1 PREVIEW — browser-local stand-in for the server-side shift ledger.
// Stage 3 adds the database table and functions; Stage 4 switches the callers
// of this file over to them. Nothing in here reaches the backend.
const KEY = 'retrasell-shift-preview-v1'
const TOLERANCE = 0.005

const round = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const uid = () => globalThis.crypto?.randomUUID?.() || `shift-${Date.now()}-${Math.random().toString(16).slice(2)}`

function load() {
  try {
    const data = JSON.parse(globalThis.localStorage?.getItem(KEY) || 'null')
    if (data && Array.isArray(data.shifts)) return data
  } catch { /* fall through to an empty store */ }
  return { shifts: [] }
}
function save(data) {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(data)) } catch { /* storage unavailable */ }
}

/** Cash that should be in the register: opening cash + cash received − cash paid back on returns.
 *  Online channels and unpaid credit are deliberately excluded. */
export function expectedCash(summary) {
  return round(summary.openingCash + summary.cash.total - summary.returns.cash)
}

/** Placeholder figures with the same shape the server summary will return in Stage 3. */
export function sampleSummary(openingCash = 0) {
  const cash = { sales: 11500, repair: 2800, udharAtCreation: 1500, udharRepaid: 1200 }
  cash.total = cash.sales + cash.repair + cash.udharAtCreation + cash.udharRepaid
  const channels = [
    { method: 'Raast', amount: 4000 },
    { method: 'JazzCash', amount: 2500 },
    { method: 'EasyPaisa', amount: 1000 },
    { method: 'Bank Transfer', amount: 0 },
  ]
  const summary = {
    openingCash: round(openingCash),
    invoiced: { retail: 14200, repair: 9800, total: 24000 },
    cash,
    online: { channels, total: channels.reduce((sum, c) => sum + c.amount, 0) },
    udhar: { given: 6000, paidAtCreationCash: 1500, paidAtCreationOnline: 0, repaidCash: 1200, repaidOnline: 0 },
    returns: { count: 2, total: 1200, cash: 800, online: 400 },
    tickets: { created: 5, handedBack: 3, openNow: 7 },
    itemsSold: 18,
    discounts: 350,
  }
  summary.expectedCash = expectedCash(summary)
  return summary
}

export function getOpenShift(operatorId) {
  return load().shifts.find(s => s.operatorId === operatorId && !s.endedAt) || null
}

export function startShift({ operatorId, operatorName, role, openingCash = 0 }) {
  const data = load()
  const existing = data.shifts.find(s => s.operatorId === operatorId && !s.endedAt)
  if (existing) return existing
  const shift = {
    id: uid(), operatorId, operatorName, role,
    startedAt: new Date().toISOString(), openingCash: round(openingCash),
    endedAt: null, closeReason: null,
  }
  data.shifts.push(shift)
  save(data)
  return shift
}

export function previewSummary(shift) {
  return sampleSummary(shift.openingCash)
}

export function closeShift(id, { countedCash = null, note = '', approvedBy = null, closeReason = 'operator' } = {}) {
  const data = load()
  const shift = data.shifts.find(s => s.id === id && !s.endedAt)
  if (!shift) return null
  const summary = sampleSummary(shift.openingCash)
  const counted = countedCash == null ? null : round(countedCash)
  Object.assign(shift, {
    endedAt: new Date().toISOString(), closeReason,
    countedCash: counted,
    difference: counted == null ? null : round(counted - summary.expectedCash),
    note, approvedBy, summary,
  })
  save(data)
  return shift
}

export function forceCloseShift(id) {
  return closeShift(id, { countedCash: null, closeReason: 'manager_forced', note: 'Closed by management without a cash count.' })
}

export function listShifts() {
  return load().shifts.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

/** Clearly labelled examples so the Admin page can be judged before any real shift exists. */
export function listSamples(now = Date.now()) {
  const hours = h => new Date(now - h * 3600e3).toISOString()
  const make = (id, operatorId, operatorName, role, startH, endH, opening, counted, extra = {}) => {
    const summary = sampleSummary(opening)
    return {
      id, operatorId, operatorName, role, sample: true,
      startedAt: hours(startH), endedAt: hours(endH), openingCash: opening, closeReason: 'operator',
      countedCash: counted, difference: round(counted - summary.expectedCash), note: '', approvedBy: null,
      summary, ...extra,
    }
  }
  const e = sampleSummary(2000).expectedCash
  return [
    make('sample-owner-1', 'sample-owner', 'Sample Owner', 'Business Owner', 33, 24, 2000, e),
    make('sample-cashier-1', 'sample-cashier', 'Sample Cashier', 'Cashier', 31, 23, 2000, e - 300,
      { note: 'Cash handed back to a customer without a return entry.', approvedBy: 'override PIN' }),
    make('sample-cashier-2', 'sample-cashier', 'Sample Cashier', 'Cashier', 57, 48, 1500, sampleSummary(1500).expectedCash),
  ]
}

export function getShift(id) {
  return load().shifts.find(s => s.id === id) || listSamples().find(s => s.id === id) || null
}

export const SHIFT_TOLERANCE = TOLERANCE
