# Repair draft editing and numeric-input stabilization

Date: 2026-09-14. Scope: the two additional online-smoke findings only.
No schema/migration, financial-ledger semantics, commit, merge, or wider smoke-test changes.

## Root causes and implementation

The cart supported repair removal but had no edit action or draft rehydration path.
Creation also used a shallow draft copy, which was not sufficient for cancel-safe
editing of nested component/payment entries. Modify Ticket now opens an isolated
working copy of an unplaced new repair. Save replaces the existing cart entry,
retaining its product and request identities. Cancel leaves the saved cart copy
untouched. Finalized repairs do not gain this editing path.

Form values are captured before component/payment/quote-mode rerenders. Reopened
text fields are HTML-escaped so quotes and angle brackets survive the round trip.
The existing order API remains unchanged. A pending-order guard rejects repeated
Place Order clicks and prevents cart actions during that pending request.

Numeric controls previously relied on inconsistent native browser behavior, while
customer phone was unrestricted text. The shared validator installs once and
handles keyboard, beforeinput, paste, actual input and composition completion.
It uses existing number-input min/step settings; it does not round money or
change database precision. Invalid monetary pastes are rejected in full rather
than silently turning malformed text into a different amount. Digit-string
pastes retain their digits. One non-interactive note appears next to each affected
input, expires after 1.3 seconds, and resets its timer on repeated attempts.
It neither rerenders the app nor changes focus or existing aria-invalid state.
Generic validation attributes are excluded from focus-restoration selectors.

## Field classification

| Class | Fields | Treatment |
| --- | --- | --- |
| A: numeric | Quantity/count, return quantity, payroll year, inventory quantities/minimums/deltas | Existing numeric inputs covered; existing integer/decimal and sign constraints retained. |
| B: digit strings | Repair customer phone and POS Udhar customer phone (including shared tel helper) | Digits only, kept as strings; leading zeros retained. No plus sign, separators, length normalization or country-code conversion. |
| C: alphanumeric | Combined IMEI / Serial, SKU, invoice/ticket searches and prefixes, customer/device/name/note/email/password fields | Not converted to numeric. Combined IMEI / Serial explicitly allows letters and numbers because it also stores general serials. Shop contact free text remains unchanged. Existing PIN validation remains separate. |
| D: monetary | Component/issue prices, labour, quote override, advances, payment/top-up, POS cash and split payments, settlement, additional work, adjustments/refunds, catalog prices/costs, tax and employee rates | All existing native number inputs use shared feedback without changing their min/step/precision rules. |

Raw digit-only phone behavior is the requested convention for this batch, not a
new international telephone formatter. Existing stored records are not rewritten.

## Verification

### Browser: actual POS handlers with isolated API responses

No live database writes were made. The temporary POS fixture stubbed all network
requests and the order response; this proves frontend behavior and request shape,
not live database persistence.

- PASS: create draft, add to cart, Modify Ticket visible next to Remove.
- PASS: reopen restores identity fields, alphanumeric serial, component price,
  labour and the existing advance.
- PASS: change customer and component price, cancel, reopen: original values retained.
- PASS: edit customer/device/component/labour, save: exactly one updated cart row.
- PASS: double-click Place Order: one create_repair_ticket request, one tender,
  edited values in the receipt preview, cart emptied after the stubbed success.
- Captured payload: quote 160.75, component 120.50, labour 40.25, one Cash tender
  of 30, phone `03001234567`, serial `SN-A012`, edited customer and device.
- PASS: no console errors during this isolated workflow.

### Numeric DOM checks

13 checks passed in `tests/numeric-validation.html`: rejected keyboard letters;
single nearby note and retained focus; repeated-attempt timer reset/no stacking;
expiry; mixed-paste interception; preserved leading zeros/sanitized paste;
actual-input sanitization; composition-completion sanitization; rejected invalid
monetary paste without changing amount; allowed decimals; rejected exponent text
with feedback; unrestricted alphanumeric serial; final note cleanup.
No console errors. Mobile coverage uses DOM input/composition events, not a
physical mobile device. The shared mechanism covers additional-work/cash controls
by their existing input types; those individual live screens were not all replayed.

### Automated and build

- PASS: `node --test tests/repair-draft-numeric.test.mjs` (3 tests).
- PASS: `npm run build` (78 modules).
- PASS: `git diff --check`.
- Existing non-blocking build warning: shared.js is both statically and dynamically imported.
- Temporary public POS fixture removed; numeric harness moved under tests and
  excluded from the production build.

## Files changed for this batch

- src/numeric-input.js
- src/shared.js
- src/style.css
- src/features/pos/repairs/state.js
- src/features/pos/repairs/render.js
- src/pos/pos.js
- tests/repair-draft-numeric.test.mjs
- tests/numeric-validation.html
- docs/REPAIR_DRAFT_NUMERIC_STABILIZATION.md

The pre-existing receipts.js change belongs to the earlier receipt-family task
and was preserved, not modified by this batch.

## Readiness and remaining limits

Ready for code review and commit of this scoped batch; no commit or merge performed.
Live database persistence, physical mobile-keyboard testing, and the broader
online-smoke sequence remain separate verification work. No claim of a full
live regression pass is made here.
