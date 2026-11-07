# Repair advance-payment prompt and component picker — current 5 November 2026

> Checkpoint — 5 November 2026: implemented on `development`. When this document was written (owner-supplied Git output), `development` matched `origin/development` at `d52d9dc` with a clean working tree. The owner reports that `npm run build` and `node --test tests/legal.test.mjs` pass and that the browser checklist covering this work passed (owner report; the environment used was not stated). This is a Shop front-end change only: no migration, database function or Platform change. Deployment and hosted acceptance are **not** established by this document.

## Purpose

Advance payments used to be typed into a "Payments received" section inside the repair ticket form. They are now asked for as a separate step after the operator continues to the cart, so the form stays focused on the customer, device, components and quote.

The same work fixed three defects in the custom-component picker that opens from the repair form:

1. The repair form disappeared while the picker was open. The modal state was swapped, so the form no longer existed in the DOM. The picker state now renders the repair form (rebuilt from the saved `_info`) underneath the picker.
2. The picker was narrow (`modal-xs`, 360px). It now uses `rs-comp-tag-picker`, 600px like the receipt-preview and variant dialogs, with a transparent backdrop so the screen is not dimmed twice.
3. Closing the picker destroyed the whole ticket. The shared `data-close` handler set `state.modal = null` for every modal except `qitem-pick`. `comp-tag-picker` (and the new `repair-advance`) now return to `{ type:'repair', _info, _editingCartProductId }`.

## Operator flow

The repair form button reads **Continue to Cart** for both new and modified tickets. Required-field checks (customer name, phone, device brand, device model) run first and are unchanged.

| Situation | Prompt | Result |
| --- | --- | --- |
| No advance recorded | **Advance Payment** — Quote Total and Balance Due, **Yes** / **No**, × | **No** sends the ticket to the cart at the full quote. |
| No advance recorded, **Yes** | Amount and payment method with live **Paid So Far** and **Remaining Balance** | Amount must be above 0 and not above the quote total. **Back** returns to Yes/No. **Add to Cart** creates the cart line. |
| Modify a ticket that already has an advance | **Replace Current Advance?** — Quote Total, Current Advance, Balance Due | **No, Keep It** creates the cart line unchanged. It is blocked with the standard "Payment Too High" message if the existing advance now exceeds the quote. |
| …**Yes, Replace It** | The current advance is shown at the top; the operator enters the new amount and method | **Replace Advance** opens the confirmation. |
| …confirmation | **Are You Sure?** — old advance, new advance, method, remaining balance, and a note that the payment is recorded when the order is placed | **Yes, Replace It** replaces the draft's advance with the single new payment. **Go Back** returns to the amount step. |

- The × on every prompt returns to the repair form with all fields and components intact. Outside clicks and Escape do nothing (`data-no-backdrop-close`, honoured by `ui-dialog.js`).
- Cancel and × on the repair form itself still close the ticket, as before.
- In the form's Balance panel an existing advance appears as `Advance (method) − amount` with a × (existing `data-draft-payment-remove` handler) above **Remaining Balance**. With no advance the panel shows Quote Total and a hint that the advance is asked for in the next step.

## Where the advance lives

The advance is `draft.payments`, an array of `{ amount, method }` in `src/features/pos/repairs/state.js`. `calcDraftPaid` sums it; the cart line price is `max(0, total − paid)` and the draft snapshot travels inside the cart line (`draftData`). **Nothing is written to the backend when a prompt is confirmed.** At Place Order, `insertNewTicketFromCart` (`src/features/pos/repairs/api.js`) sends the payments as `p_tenders` to the existing `create_repair_ticket` function. Removing the ticket from the cart before Place Order therefore records no payment.

## Implementation map

`src/pos/pos.js`

- Modal type `repair-advance` with `step` (`ask` | `amount` | `confirm`), `_info`, `_editingCartProductId`, `amount`, `method`. The form submit handler now validates and opens this modal instead of adding to the cart.
- `commitRepairToCart(data, editingProductId)` builds the cart line (same values as before), resets the draft, closes the modal and re-renders. It refuses with the standard blocking error if `paid > total`.
- `applyAdvanceAndCommit(modal)` replaces `draft.payments` with the single new payment and restores the previous payments if the commit fails.
- Click actions: `advance-no`, `advance-yes`, `advance-back`, `advance-continue`, `advance-confirm`. `data-close` on `comp-tag-picker` or `repair-advance` returns to the repair form.
- Live typing: the `input` listener stores `state.modal.amount` and `_refreshAdvancePrompt()` updates the Paid So Far / Remaining text and the over-limit notice without a re-render; the `change` listener stores the method; Enter in `#advance-amount` triggers `advance-continue`.
- `renderModal` renders `repairTicketFormHTML(...)` plus `compTagPickerHTML(...)` or `advancePromptHTML(...)` as stacked dialogs.

`src/features/pos/repairs/render.js` — Payments section removed, Balance panel reworked, button renamed, `advancePromptHTML()` added, picker class changed to `rs-comp-tag-picker`.

`src/shared.js` — `repair-advance` added to the repair-module modal list used by `modalEntitled`.

`src/style.css` — 50/50 finance row, divider, responsive stacking, picker and prompt sizing.

`public/brand/retrasell-shop.css` — dead `.rs-repair-payment-entry` and `.rs-repair-payments` selectors removed.

Removed: the `draft-add-payment` handler and the `#draft-pay-amount` / `#draft-pay-method` controls.

## Invariants

- Backend contract unchanged: the advance reaches the database only through the existing `create_repair_ticket` tenders at Place Order. Over-payment is blocked client-side (amount ≤ quote total) and still rejected by the backend.
- The payment object shape `{ amount, method }` is unchanged, so cart lines, receipts and sister-app consumers are unaffected.
- The repair form is re-rendered from the saved `_info` whenever the picker or prompt opens or closes. Typed values and the draft survive, but the form's scroll position resets to the top.

## Layout and styling

The finance row is two equal columns (Labour and quote | Balance) with a divider, stacking below 820px. The overrides live in `src/style.css` with extra selector depth because `public/brand/retrasell-shop.css` loads after it. The brand file's three-column base rule was intentionally left in place: layout rules belong in versioned app CSS, and a browser holding a cached older brand file simply ignores selectors that no longer match markup. The prompts use RetraSell tokens and existing `modal-actions`, `primary-button` and `secondary-button` styles.

## Validation

- Owner reports (environment not stated): build and `tests/legal.test.mjs` pass at `d52d9dc`; the browser checklist for the component picker, advance prompt (new, modify, replace, validation, mobile and dark mode), header, passwords, EMS and logout warning passed.
- Assistant review of a repository snapshot taken at `967a74c`: every changed file diffed against the specified edits; all changed JavaScript parses; lint found no undefined names; both stylesheets parse; the Node-only suite gave identical results before and after (the failures present in both are caused by missing development packages in the review sandbox). The later tidy-up commits (`19480fe` to `d52d9dc`: unused names and indentation) were confirmed only by the owner's Git status, leftover search, build and legal test.
- `tests/helpers/m3-owner-acceptance.mjs` was edited to seed the extra payment through draft state and to drop the DOM balance assertion. That script and the other edited browser scripts were **not executed**.

## Limits and deliberately unchanged

- Replacing an advance writes a single new payment. A legacy draft that holds several payments shows each one and replaces them as a group.
- No backend, migration, `p_tenders` contract or Platform change.
- Shift reporting is unrelated to this work and unchanged.
