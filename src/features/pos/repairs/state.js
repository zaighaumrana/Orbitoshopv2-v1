/* ═══════════════════════════════════════════════════════════════════
   features/pos/repairs/state.js
   The in-progress "new repair ticket" draft (components, payments,
   labour, price override) -- POS-exclusive, verified by actual caller
   (only pos.js touches any of this).

   Why this moved out of state.modal._draft: state.modal is shared UI
   state ("which modal is currently open") used by every view. Nesting
   repairs-specific data inside it meant a draft only survived as long
   as that exact modal object did -- a genuine instance of the "shared
   mutable state" problem this whole architecture refactor exists to
   get away from. The draft is now independent of whichever modal
   happens to be open, which is also why the comp-tag-picker round-trip
   in pos.js no longer needs to carry `_draft` along inside the modal
   object it switches to.

   Ownership: this belongs to Repairs, not to POS. Only pos.js uses it
   today (Admin's own ticket-creation flow was removed earlier; Workshop
   doesn't create new tickets) -- but per the ownership rule, if
   Workshop or Admin ever need to build a repair ticket draft too, this
   is already the one place that logic lives.
═══════════════════════════════════════════════════════════════════ */

let draft = null

/** Returns the current draft, lazily creating an empty one if none
 *  exists yet. Never returns null/undefined -- callers can rely on
 *  getDraft().components etc. always being safe to read. */
export function getDraft() {
  if (!draft) {
    draft = {
      components: [],   // [{name, tag, customText, price}]
      payments:   [],   // [{amount, method}]
      labour:     0,
      overridePrice: null,
    }
  }
  return draft
}

/** Explicitly clears the draft. Call this when starting a genuinely
 *  NEW repair ticket (not when merely switching modals mid-flow, e.g.
 *  the comp-tag-picker round-trip -- that should keep using the same
 *  draft via getDraft(), not reset it). */
export function resetDraft() {
  draft = null
}

export function calcDraftTotal(draft) {
  if (draft.overridePrice !== null && draft.overridePrice !== '') {
    return Number(draft.overridePrice) || 0
  }
  const partsTotal = draft.components.reduce((s,c) => s + Number(c.price||0), 0)
  return partsTotal + Number(draft.labour||0)
}

export function calcDraftPaid(draft) {
  return draft.payments.reduce((s,p) => s + Number(p.amount||0), 0)
}
