# Phase 3 final consistency stabilization

Current status: Phase 3 and these follow-ups are completed and merged into the
integrated `development` baseline. Latest frontend is deployed through Cloudflare;
Phase 4 client live smoke passed, per project-owner confirmation. Dated fixture
results below remain historical evidence, not newly run live checks. See
[project status](PROJECT_STATUS.md). Next client task: final repo-wide
regression/cleanup. Separate Platform modernization remains future work.

## Final Workshop and intake patch — 2026-09-17

Two additional consistency fixes were implemented in this checkpoint and are now merged and deployed.

### Approved operational family scope

Root cause: Workshop grouped family identities and financials, but rendered only the parent's `components_noted`. The original status-filtered query could also omit children with a different lifecycle status.

Workshop now reads active parent tickets plus their child tickets through existing RLS-protected reads. A pure `repairFamilyWork` helper assembles each invoice once, preserving intentional repeated component names. Cards distinguish Original Repair / Additional Work and show component tags, Not Needed markers, related labour presence, and child work notes. No child data is copied into the parent. Cancelled/Declined child tickets are excluded from active scope.

Only persisted invoices contribute operational work. The existing `decide_additional_work` RPC creates a child only for Approved decisions. Its child's operational status starts as Pending: this must not be confused with a Pending customer proposal. Pending/Declined proposal details are never consumed as active work and history is untouched.

Technicians use the same already-authorized ticket reads for operational scope, without a financial-summary request or any new permission. Canonical financial totals remain unchanged for authorized roles. Read failures show a blocking error rather than silently claiming a complete work list.

### Custom component on original intake

Root cause: intake already supported the normal `{name, tag, customText, price}` draft model and tag picker, but offered only predefined-name buttons.

New Repair Ticket and its draft-edit view now include Custom component name / + Add next to the predefined buttons. Add trims and rejects blank names using the shared blocking dialog, then opens the existing tag picker. Enter uses the same action. Modal-type guards reject stale double-clicks on both entry and tag confirmation. Intentional repeated names remain allowed, matching Additional Work. Existing snapshot/edit, ticket serialization, Admin detail, Workshop, and print paths consume the same component objects. Component names are escaped as text in the affected display/print paths.

Schema check: `create_repair_ticket` in `20260904220000_phase3_atomic_repair_transactions.sql` validates the components array and stores it directly in `tickets.components_noted`; it does not require a catalog component ID. Approved additional work stores the same shape from proposal details. No schema migration, backend function, RLS, auth, ledger, payment, or Technician financial change was needed. No live DB writes were made.

Files in this follow-up:

- `src/features/repairs/family.js`
- `src/pos/workshop.js`
- `src/features/pos/repairs/render.js`
- `src/pos/pos.js`
- `src/html.js`
- `src/features/admin/repairs/render.js`
- `src/print/print.js`
- `tests/repair-work-scope.test.mjs`
- `tests/phase3-consistency.html`
- this document

Verification: 11/11 Node tests pass, covering approved child work exactly once, Pending/Declined proposal exclusion, cancelled-child exclusion, no-parent mutation, no-child behavior, intentional repeated names, custom-component draft editing, and previous regressions. The isolated browser fixture passes 21 checks including actual intake event handlers, blank-name dialog, trim/tag/double-click behavior, custom names in Admin and ticket print, child operational rendering for Technician, unchanged family financials, receipt archive, summary, decisions, and dialog/focus regressions. No browser errors/warnings were captured. Production build and whitespace checks pass (existing ineffective dynamic-import and LF/CRLF advisories only).

Final console recheck: no error-level entries, but one Cloudflare Turnstile warning (`300030`) was captured in the development browser session. The first fixture run had no warnings; the later session included a rebuild/reload. Its origin was not established, so this is not a blanket clean-console certification of live authentication.

Historical fixture limitations: browser RPCs were stubbed; these results do not independently prove a live saved-ticket transaction, live JWT/RLS retest, or physical print. Persistence support was checked against the existing SQL/client payload, not by creating a live test ticket. Existing API row limits still bound large queue reads. The original acceptance/merge hold is superseded by the current integrated deployment status above.

Original checkpoint date: 2026-09-16. This implementation is now committed, merged and deployed.

## Scope and safety

No database, migration, RLS, Auth, support-identity, or permission changes. No live database writes were performed for these checks. Payment allocation, advance handling, delivery gates, refund formulas, and inventory calculations are unchanged. Existing RPCs remain authoritative.

Technician boundary explicitly retained: Workshop does not request the family financial-summary RPC for Technicians. It displays “Financial summary unavailable for this role.” Operational status, existing component/work information, and Pending-only additional-work proposals remain available. Existing component details are not newly restricted or expanded.

## Root causes and changes

### 1. Receipt Archive local time

The archive preferred legacy `placed_at` (timestamp without timezone). Its offset-less UTC value was interpreted by JavaScript as local time, despite using locale formatting. Print uses the offset-aware creation timestamp. Date filters also compared UTC string prefixes rather than local calendar dates.

Added shared database timestamp parsing/local formatting: offset-less database date-times are interpreted as UTC, explicit offsets are preserved, and display/filter dates use the browser's local timezone. No fixed +5 arithmetic, timestamp rewriting, or changes to printed timestamps. Nearby repair rendering has no equivalent UTC-slice display path.

### 2. Workshop family totals

Cards previously read parent quote/paid/balance columns. Authorized roles now request `get_repair_family_summary` once per displayed root on load and display its effective obligation, net payments, and outstanding amount. No Workshop financial arithmetic is duplicated. The same source covers repairs without children. Failed summaries show an unavailable message rather than misleading parent-only amounts. Technician behavior is described above.

### 3. Important success feedback

Transactional handlers individually called success toasts. Added `showTransactionSuccess`, using the existing centered app dialog. It deduplicates active notices and defers a notice until an owning async confirmation closes; it never reruns the transaction.

Centered cases: repair payment recorded, paid delivery, Udhar delivery, Udhar settlement in POS/Admin, retail return/refund completion, repair adjustment, repair cancellation/refund, additional-work decision/proposal completion, and inventory stock adjustment.

Existing sale/new-repair receipt dialogs and approved-child printing remain the completion flow; no extra success dialog is stacked over those print flows. Lightweight configuration/catalog edits, operational status notices, account/profile feedback, and informational notices remain toasts. No native alert/confirm was introduced.

### 4. Shared additional-work decisions

Workshop/POS duplicated an older direct auto-approved child-invoice form. Admin had the customer-decision form. Extracted one shared renderer and submission helper, used by all three surfaces. It captures components, labour, work note, decision, contact method, and separate optional decision note. Fields survive component-picker rerenders.

Approved uses the existing proposal/decision RPC path and prints the returned child; Pending saves only a proposal; Declined records the decision without creating a child. Technicians are forced to Pending both in the form and submission helper. Removed UI calls to the old auto-approval path. Submission locks prevent concurrent duplicate requests; partial-failure retries reuse proposal and decision request IDs. Stored JSON details retain the work note and decision metadata without a schema change.

### 5. Itemized family summary/reprint

The summary previously printed invoice totals without their available component/labour details. It now prints each original/child invoice with available components, labour, note, canonical subtotal, and parent reference for children. Existing adjustments, payments, refunds, billed/net/outstanding, Udhar, status, and delivery timestamp sections remain. Missing details are not fabricated and line items are not used to recompute the ledger.

Receipt Archive repair rows now offer Print Summary targeting the family root; parent and child rows produce the same family summary. Normal Print remains invoice-specific. Retail rows have no repair-summary button. Admin summary printing fetches the requested family rather than potentially reusing an unrelated open modal summary.

## Exact files

- `src/datetime.js` — new shared timestamp helpers.
- `src/features/admin/checkout/receipts.js` — timestamp sorting/local-day filters.
- `src/features/admin/checkout/render.js` — local display and family-summary actions.
- `src/features/repairs/additional-work.js` — shared decision renderer/state/submission lock.
- `src/features/admin/repairs/render.js` — reexports the shared form.
- `src/features/repairs/api.js` — separate work/decision notes and retry request IDs.
- `src/pos/workshop.js` — role-gated canonical totals and shared additional work.
- `src/pos/pos.js` — shared additional work and transactional confirmations.
- `src/admin/admin.js` — shared additional work, confirmations, correct summary target.
- `src/features/admin/inventory/api.js` — stock-adjustment confirmation.
- `src/shared.js` — deduplicated transactional-success dialog helper.
- `src/print/print.js` — itemized canonical family summary.
- `tests/phase3-consistency.test.mjs` — timezone and archive regression tests.
- `tests/phase3-consistency.html` — isolated browser regression fixture.
- `docs/PHASE3_FINAL_CONSISTENCY_STABILIZATION.md` — this report.

## Verification

- `npm run build`: PASS (81 modules). Existing ineffective dynamic-import warning for `shared.js`; no build failure.
- `node --test tests/*.test.mjs`: PASS, 7/7 tests.
- `git diff --check`: PASS. Git emits local LF/CRLF conversion advisories only.
- Browser fixture: PASS, 15/15 checks using actual app modules with stubbed Supabase responses, not live JWT/DB tests.
- Browser console captured after fixture: zero warnings/errors.

Browser checks cover canonical 1300/300/1000 family totals, reload to 1300/1100/200, Technician no-summary-RPC and operational visibility, Workshop search focus, decision field preservation, Pending-only Technician form, Pending/Declined/Approved RPC behavior and concurrent submission suppression, forced Pending on Technician submission, partial-failure request-ID reuse, summary itemization, parent/child archive summary targets with independent print buttons and retail exclusion, dialog deduplication, and exactly-once confirmation execution.

Node regressions cover offset-less/offset-aware UTC equivalence, Asia/Karachi next-day 01:38 display, local-day receipt filtering, family search ordering, separate retail behavior, and existing amount/draft checks.

## Limitations / review recommendation

This batch is now integrated and deployed. The original isolated fixture did not retest live additional-work persistence, role-authenticated sessions, actual printer output/pagination, or navigation during real transactions; that evidence limitation remains distinct from the subsequently confirmed Phase 4 live smoke pass. The fixture blocks outbound fetch and uses disposable in-memory data; it is not shipped by the production entry point. Browser locale controls the displayed date/time convention. Legacy offset-less database timestamps are assumed UTC, matching the existing backend write convention.

No wider smoke testing or cleanup was performed in the original fixture batch.
Its former commit/merge hold is superseded by the integrated deployment status above.
