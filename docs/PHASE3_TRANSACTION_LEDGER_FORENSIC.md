# Phase 3 Transaction Ledger Forensic Record

Date started: 2026-09-04

Supabase DEV project: `kxmovywgshyltwusghhj`

Branch: `phase3-transaction-ledger`

Starting HEAD: `972005ddf1d1f4b212c9735630b4971e727926`

Merge status: not merged into `development`

This record intentionally contains no customer names, phone numbers, device
identifiers, passwords, PINs, hashes, service keys, access tokens, refresh
tokens, or authorization headers.

## Phase 3A decision: GO after authorized DEV cleanup

Phase 3A initially stopped on ambiguous live money history. The user confirmed
that the flagged records were disposable DEV data and explicitly authorized
their deletion while preserving configuration, catalog, Inventory, identity and
audit data.

Initial blocking evidence:

- Sales IDs 1, 3, 5 and 6 are positive-value Cash sales with
  `cash_tendered = 0`. The legacy checkout did not require cash tender to cover
  the invoice, so the database cannot prove how much money was received.
- Returns IDs 1 and 2 recorded refund amounts but the legacy `returns` table has
  no refund-method column. The method shown on the printed slip existed only in
  browser state and was not persisted.

Resolution:

- a dependency preflight verified exactly four target sales and two target
  returns, with no Udhar or ticket links and no unexpected return dependency
- returns 1 and 2 were deleted first, then sales 1, 3, 5 and 6 were deleted in
  one guarded database transaction
- guarded row-count checks required exactly two return deletions and four sale
  deletions or the transaction would abort
- post-cleanup verification found zero remaining target rows and zero blocking
  financial anomalies

Decision: GO for staged Phase 3 implementation. The deletion is a direct DEV
data cleanup and is not represented as a reusable migration. It is recoverable
only from a Supabase backup or point-in-time recovery if available.

The following non-blocking historical gaps are also preserved rather than
guessed:

- all 11 remaining legacy sale-line snapshots across four non-empty sales omit Inventory
  identity, so historical stock movements cannot be reconstructed reliably
- both return records also omit Inventory identity and restock disposition
- Ready tickets 9 and 17 have `collected_at` populated by the legacy payment
  completion code; because Ready explicitly does not mean Delivered, those
  timestamps cannot be treated as physical handoff evidence
- one zero-value sale and eight zero-value tickets exist; no obligation or
  payment will be invented for them

## 1. Authoritative business rules

- A repair ticket is the work order and immutable original repair invoice.
- Later positive repair work is an approved child invoice. A declined proposal
  remains history but creates no invoice.
- Advances and later collections are ordinary immutable payments, allocated
  once and oldest obligation first within one repair family.
- Payments are money received; invoice value is not payment value.
- Refunds are immutable money-out events and do not rewrite payments.
- Post-invoice reductions are immutable negative adjustments.
- Udhar is a PIN-authorized permission to carry ordinary outstanding balance,
  not a second balance ledger.
- Ready means work complete. Delivered is a separate physical handoff allowed
  only when paid or when the remaining balance has approved Udhar.
- Quick Items never affect stock. Tracked Inventory must move atomically with
  sales, restocks and eligible returns.
- Cash tender and change are recorded separately from the payment amount.
- No payment may span unrelated repair families.

## 2. Repository, build and Supabase preflight

Git baseline:

- `development` was clean and exactly equal to `origin/development`
- Phase 2 merge commit: `972005ddf1d1f4b212c9735630b4971e727926`
- Phase 2 completion tag: `phase2-auth-rls-complete-2026-09-04`
- `git pull --ff-only origin development`: already up to date
- Phase 3 branch created from that commit: `phase3-transaction-ledger`

Build baseline:

- `npm ci`: passed; 25 packages audited, 0 vulnerabilities
- `npm run build`: passed with Vite 8.2.2
- existing warning: `src/shared.js` is both statically and dynamically imported,
  so the dynamic import does not create a separate chunk

Supabase baseline:

- linked DEV project: `kxmovywgshyltwusghhj`
- local and remote migration history: equal through `20260904001510`
- linked `db push --dry-run`: `Remote database is up to date.`
- Phase 3 migrations applied: none
- 20 public tables; all 20 have RLS enabled
- anonymous public-table privileges: 0
- public views: 0
- live public policies: 34, matching the post-cutover migration definitions
- Phase 2 helper routines: 13 across `public` and `app_private`

The Phase 2 forensic document says 35 expected policies. The executable
migrations and live database both contain 34 post-cutover policies, so this is
a documentation count discrepancy, not remote migration drift.

## 3. Current financial architecture

| Area | Current authority and write path | Forensic result |
|---|---|---|
| Retail checkout | Browser inserts `sales`, then separately inserts `udhar`; `items_sold` JSON is the only line structure | non-atomic and non-idempotent |
| Retail payment | `sales.payment_method`, tender/change fields, plus duplicated Udhar totals/history | invoice value and received money are conflated |
| Repair creation | Browser inserts `tickets` with quote, advance, paid, balance and payment-history fields together | work order, invoice and payment are conflated |
| Repair payment | Browser loops parent then children and updates each ticket separately | partial writes possible; excess input is silently discarded |
| Sub-invoice | Browser inserts a child ticket and copies remaining parent advance as `advance_credit` | one payment can be represented more than once |
| Returns | Browser inserts one `returns` header containing whole selected line JSON | no quantity ledger, refund ledger, method persistence or stock effect |
| Inventory | Admin directly inserts/updates/deletes current `inventory.qty` | no movement history or transactional link to sale/return |
| Udhar | Browser directly inserts/updates a second totals/payment-history model | duplicates invoice and payment truth |
| Reporting | Dashboard, shift and reports sum `sales.total_bill` by invoice payment label | invoiced value is presented as collected revenue |
| Delivery | Workshop/Admin directly update ticket status | no dedicated paid/Udhar handoff transaction |

Current live financial schema:

- `sales`: invoice header plus `items_sold`, discounts, tax, total, payment label,
  employee snapshot, tender and change
- `tickets`: work-order fields plus parent reference, quote/final fields,
  advance, amount paid, balance, payment history, status and timestamps
- `udhar`: sale reference plus duplicated total/paid/balance/history/status
- `returns`: sale reference plus returned-items JSON and refund amount
- `inventory`: current quantity, sell/cost prices and reorder quantity
- `quick_items`: non-stock names and price variants
- `repair_components`: descriptive repair component catalog
- `shop_config`: feature, numbering and security-safe configuration fields
- `app_users` and `step_up_authorizations`: frozen Phase 2 identity/step-up model

No canonical Phase 3 ledger tables or financial transaction RPCs currently
exist.

## 4. Reverified defects

All supplied findings P3-F01 through P3-F28 were rechecked against current
code. They remain present:

- sale then Udhar writes are separate; Inventory identity is removed from the
  persisted JSON and stock is not decremented
- cash underpayment is displayed but not rejected by checkout
- returns are whole-line-only records with no accounting reversal, stock
  movement, partial quantity control, durable method, or idempotency
- repair money exists only in mutable ticket fields; creation/payment/family
  allocation are browser-driven and non-atomic
- sub-invoices reuse parent advance through synthetic `advance_credit`
- repair overpayment is discarded; payment completion sets Ready and
  `collected_at`
- physical delivery is an unrestricted status update rather than a transaction
- repair collections do not enter the retail/reporting payment path
- sales totals are reported as revenue and grouped by invoice payment label
- Udhar duplicates totals, balances and payment history
- no immutable adjustment, cancellation/refund, or customer-decision model
- child search does not reliably render the complete family
- original ticket printing omits a prominent remaining-at-creation amount and
  there is no final repair-family summary
- Workshop invokes `initPOS()` directly while the route remains `/workshop`
- repair components remain descriptive charges and Quick Items remain
  intentionally non-stock, as required

## 5. Live DEV data and consistency diagnostics

Exact row counts:

| Record | Count |
|---|---:|
| sales | 5 |
| tickets | 19 |
| root tickets | 19 |
| child/sub-invoices | 0 |
| Udhar | 1 |
| returns | 0 |
| inventory | 2 |
| Quick Items | 4 |
| repair components | 7 |

Consistency checks that returned zero anomalies:

- duplicate sale/ticket/cross-domain invoice numbers
- duplicate ticket numbers
- missing/self parents or repair-family depth greater than one
- negative sale, ticket, balance or Inventory values
- ticket paid amount above effective total
- ticket total minus paid versus balance mismatch
- ticket payment-history sum versus amount-paid mismatch
- parent/child advance reuse in current data
- Udhar sale without a matching row or Udhar row without a sale
- Udhar total/paid/balance mismatch, overpayment or history mismatch
- returns referencing missing sales
- cumulative return fingerprint quantity above the source sold quantity
- cumulative recorded return amount above source sale total
- plaintext employee, Owner-password or override-PIN regression

Other measured evidence:

- 11 tickets have a non-zero obligation
- 7 tickets contain 8 reconciling legacy payment-history events
- Udhar row 1 maps to sale 7 and reconciles: total 2,500; paid 1,500;
  outstanding 1,000; status Partial
- 3 positive Cash sales have tender greater than or equal to invoice total
- 3 positive Cash sales have valid tender/change evidence
- 0 positive Cash sales lack tender evidence after authorized cleanup
- 1 sale has zero value
- 8 tickets have zero value
- 0 legacy return rows remain after authorized cleanup
- 2 Ready tickets carry the legacy auto-set `collected_at` timestamp
- no ticket uses `actual_quote` or `final_price_override`
- Inventory and repair modules are enabled; the client is not suspended

## 6. Deterministic and non-deterministic backfill boundary

Completed deterministic backfill:

- normalized all 11 current sale JSON lines into `sale_lines` snapshots while
  leaving unknown `inventory_id` and cost snapshots null
- created 12 immutable payment events: 3 reconciled retail Cash payments, 1
  Udhar payment and 8 repair payment-history events
- created one equal allocation for every payment; payment and allocation totals
  both reconcile to 36,449 with zero unbalanced payments
- reconstructed one active legacy credit approval for the outstanding 1,000
  Udhar amount without inventing an actor or step-up authorization
- established two Inventory opening-balance movements totaling quantity 50,
  exactly matching current Inventory quantity

Backfill that must not be guessed:

- historical Inventory identity, cost, movements or restock disposition
- physical delivery from tickets 9 and 17's auto-populated `collected_at`
- any commercial amount for zero-value legacy records

## 7. Target model and applied schema

Phase 3B applied the additive target foundation:

- `sale_lines`: immutable retail line snapshots with explicit item kind and
  optional Inventory/Quick Item identity
- `payments`: immutable money-in events with request id, tender and change
- `payment_allocations`: immutable allocation to one sale or one ticket in one
  repair family
- `refunds`: immutable money-out events with method and reason
- `invoice_adjustments`: immutable signed obligation reductions/corrections
- `credit_approvals`: Udhar authorization, not a second balance ledger
- `additional_work_proposals`: durable Pending/Approved/Declined customer
  decisions linked to an approved child invoice when applicable
- `return_lines`: partial quantity, refund value and restock decision
- `inventory_movements`: immutable sale/restock/return/manual quantity audit

Legacy headers and JSON snapshots will remain for compatibility. New ledger
records become canonical only after a staged, tested cutover.

Applied migration:

| Migration | Purpose | DEV status |
|---|---|---|
| `20260904200000_phase3_ledger_foundation.sql` | Nine canonical ledger/audit tables, constraints, indexed foreign keys, RLS and read-only role policies | applied |
| `20260904203000_phase3_deterministic_backfill.sql` | Guarded normalization of deterministic legacy sale lines, payments, allocations, Udhar approval and Inventory opening balances | applied |
| `20260904210000_phase3_atomic_retail_checkout.sql` | Idempotent retail-sale RPC, canonical lines/tenders/allocations/Udhar and atomic Inventory decrement | applied |
| `20260904220000_phase3_atomic_repair_transactions.sql` | Idempotent original repair creation/advance and parent-first repair-family payment allocation | applied |
| `20260904230000_phase3_additional_work_and_adjustments.sql` | Durable additional-work decisions/child invoices, immutable PIN-authorized adjustments and closure of direct ticket INSERT | applied |
| `20260905000000_phase3_repair_cancellation_and_delivery.sql` | PIN-authorized cancellation/refund, explicit paid-or-Udhar delivery and protected ticket financial fields | applied |
| `20260905010000_phase3_retail_returns_and_inventory_adjustments.sql` | Partial retail returns, actual-refund calculation, optional restock and audited Inventory create/adjust RPCs | applied |
| `20260905011000_phase3_return_line_invariant.sql` | Deferred invariant preventing an empty return header from committing | applied |
| `20260905020000_phase3_unified_udhar_and_reporting.sql` | Unified retail/repair Udhar settlement and canonical dashboard/report/shift read models | applied |
| `20260905030000_phase3_repair_family_summary.sql` | Authorized canonical repair-family read model for UI and final printing | applied |

Post-apply verification:

- 9 of 9 Phase 3 tables exist and have RLS enabled
- 9 read policies exist; no mutation policies exist
- anonymous privileges: 0
- authenticated mutation privileges: 0
- authenticated SELECT grants: 9, constrained by role policies
- foundation rows in every new table were initially 0
- deterministic backfill produced 11 sale lines, 12 payments, 12 allocations,
  1 active credit approval and 2 Inventory opening movements
- payment and allocation totals both equal 36,449; Inventory opening quantity
  equals current quantity 50
- no refund, return-line, invoice-adjustment or additional-work history was
  invented
- local/remote migration ledger matches through `20260905030000`

## 8. Planned transaction and idempotency boundaries

The authenticated, suspension-aware and role-checked `create_retail_sale` RPC
now owns retail checkout. It validates current catalog price, discounts, stock,
cash/change and optional split tenders; derives the remaining balance; requires
purpose-specific Udhar authorization; and commits the sale header, immutable
lines, payments, allocations, credit approval, compatibility Udhar row and
Inventory movement together. Its caller supplies `crypto.randomUUID()` and a
retry returns the original committed receipt.

`create_repair_ticket` now commits the locked original repair invoice and every
initial tender/allocation together. The full quote becomes the obligation
immediately; an unpaid balance at intake needs no Udhar approval while the shop
still holds the device. `record_repair_payment` accepts one root family,
validates tender/change and current outstanding, then allocates parent-first and
oldest-child-first. It updates only derived compatibility paid/balance/history
fields and never changes operational status or `collected_at`.

`cancel_repair` now owns repair cancellation and optional refund. It requires
the exact `repair-refund` step-up purpose, preserves all invoice/payment rows,
adds the immutable negative cancellation adjustment needed to reconcile the
retained amount, records an immutable refund when money leaves the shop, and
marks the repair family Cancelled. `deliver_repair` is the only path to
Delivered: the root must be Ready and either fully paid or covered by a fresh
Udhar authorization. It records the authenticated handoff actor and timestamp.

Later PostgreSQL transaction RPCs will own retail return and Inventory
adjust/restock.

Phase 3F now provides pending proposal, Approved/Declined decision and direct
approved-work RPCs. An Approved decision creates a distinct child invoice in
the same transaction with zero paid/advance state; Declined preserves evidence
without a charge. The PIN-protected adjustment RPC records only immutable
negative adjustments and rejects any reduction that would create unexplained
customer credit.

No direct browser mutation of ledger tables will be granted. Platform BILL
logging will remain semantically unchanged and occur only after a successful
client transaction.

## 9. Current and planned RLS model

Phase 3D removed direct authenticated `sales` and `udhar` INSERT
privileges/policies after cutting retail creation to the RPC. Phase 3F removed
direct ticket INSERT. Phase 3G added a ticket guard that rejects direct changes
to invoice/payment compatibility fields, immutable identity fields,
cancellation/delivery evidence, and transitions to or from Delivered or
Cancelled. Normal Workshop transitions such as Pending to Ready remain covered
by the existing authenticated role policy. Remaining Udhar-settlement, return
and Inventory-admin mutation paths stay staged for their dedicated cutovers.

Every Phase 3 table will enable RLS, deny anonymous access, permit only required
authenticated reads, and deny direct browser INSERT/UPDATE/DELETE. Secure RPCs
will validate `auth.uid()`, Active `app_users`, suspension, canonical role,
feature entitlement and exact step-up purpose. Phase 2 Auth architecture remains
frozen.

## 10. Frontend, printing and reporting cutover plan

Phase 3D changed retail checkout to call `create_retail_sale`; it no longer
inserts `sales` and then `udhar` in separate browser requests. Cart lines retain
their Inventory or Quick Item identity, and a failed request retains its UUID so
a retry is idempotent. Successful checkout clears the UUID. Existing one-method
UX remains unchanged; the RPC already accepts optional split tenders.

Phase 3E changed new-ticket placement and repair collection to the atomic repair
RPCs. Request UUIDs are attached to cart actions and retained until the action
succeeds. Existing simple intake and collect-payment screens remain in place.

The existing sub-invoice UI now writes a durable In-person Approved proposal
through the atomic additional-work RPC. Pending/Declined decision controls and
the adjustment form remain scheduled for the Phase 3J UI pass.

Planned UX keeps the existing short workflows while moving writes to atomic
RPCs. It adds optional split tender, explicit Udhar authorization, partial
returns/restock choice, additional-work decision, immutable adjustments,
cancellation/refund preview, and dedicated delivery.

Printing will distinguish original invoice total, paid at creation and remaining
at creation; child invoices will show their parent reference; a final family
summary will reconcile children, adjustments, payments, refunds, balance, Udhar
and delivery.

Reporting will separately calculate invoiced value, payments collected,
refunds, net payments, outstanding receivables, Udhar outstanding and Inventory
gross profit only where a reliable cost snapshot exists.

## 11. Phase 3A tests and advisor baseline

Passed:

- clean synchronized Git baseline and Phase 2 tag
- locked dependency install and production build
- local/remote migration parity and linked dry-run
- deployed schema/RLS/function/policy inventory
- all count-only relationship, balance, history, return and credential checks
  listed above

Phase 3D rollback-only database/RPC matrix passed:

- exact Cash and Cash-with-change
- split Cash + Raast + Udhar (4,000 + 3,000 + 3,000), including 1,000 change
- partial Cash + valid Udhar approval
- duplicate request id returned one sale only
- tracked Inventory decremented once with one movement
- Quick Item created no Inventory movement
- line/payment/allocation counts and amounts reconciled
- underpayment without Udhar, Udhar without step-up, discount without step-up,
  insufficient stock, Technician checkout, direct sale INSERT and direct
  payment INSERT were denied
- all probes were rolled back; retained test sales: 0, canonical backfill counts
  remain 12 payments, 12 allocations and 2 opening movements

Phase 3E rollback-only database/RPC matrix passed:

- repair with no advance and repair with a 3,000 advance
- original 10,000 quote remained the obligation; paid/balance became
  3,000/7,000 at creation and 5,000/5,000 after a later payment
- advance appeared once in `payments` and once in allocations
- duplicate create and duplicate payment each retained one event
- Cash 2,000 tendered as 2,500 recorded 500 change
- a 6,000 family payment allocated 5,000 to the parent then 1,000 to its child
- payment left `Pending` unchanged and did not populate `collected_at`
- advance greater than invoice, non-Cash overpay, short Cash tender and
  Technician payment were denied
- all fixtures were rolled back; retained test tickets/payments: 0

Phase 3F rollback-only database/RPC matrix passed:

- Technician-created Pending proposal retained a durable record
- Approved by Phone and WhatsApp each created one distinct child invoice
- Declined created no child invoice and retained the decision note/method
- original advance was not reused: two children had paid total 0 and no new
  payment rows
- duplicate proposal, decision and adjustment requests remained singletons
- original 8,000 invoice stayed unchanged; a 500 goodwill reduction was an
  immutable `-500` adjustment and derived family balance reconciled
- Technician approval/adjustment, adjustment without PIN, adjustment requiring
  refund reconciliation and direct ticket INSERT were denied
- all fixtures rolled back; retained tickets/proposals/adjustments: 0

Phase 3G rollback-only database/RPC matrix passed:

- full Cash refund, partial Raast refund and zero-refund cancellation each
  reconciled to zero outstanding without rewriting the original invoice or
  payment
- refund method/reason, cancellation actor/time and immutable negative
  cancellation adjustments were persisted as applicable
- duplicate cancellation and delivery request IDs returned idempotent replays
  without duplicate refund, adjustment or credit records
- Pending delivery and Ready-with-balance delivery without Udhar were denied
- Ready and fully paid delivery recorded Delivered, `delivered_at`, the acting
  Auth user and the compatibility `collected_at`
- payment alone left Ready unchanged; explicit delivery then succeeded
- Ready with a valid Udhar step-up delivered with one active credit approval;
  a later payment reduced outstanding from 100 to 60 without reversing
  Delivered, and Cash 50 against payment 40 retained change 10
- missing reason, missing/wrong-purpose step-up, Technician cancellation,
  Technician delivery, direct Delivered transition and direct financial-field
  update were denied
- Technician Pending-to-Ready remained allowed as an operational Workshop
  transition
- all probes rolled back: zero `P3G` test tickets, zero refunds and zero
  adjustments remain; canonical live counts remain 12 payments, 12 allocations,
  2 Inventory opening movements and 1 legacy credit approval

The deployed `verify-pin` Edge Function is version 2 with JWT verification
enabled and accepts the new exact `repair-refund` purpose.

Phase 3H rollback-only database/RPC matrix passed:

- a tax-inclusive fully paid Quick Item return reduced the full 110 obligation,
  refunded 110 Cash and created no stock movement
- an Inventory quantity-5 line returned 2 with restock and then 1 without
  restock; the first added exactly 2 sellable units and one movement, while the
  second changed no stock
- the return context reported sold 5, already returned 3 and remaining 2; an
  attempted quantity 3 was denied
- replaying the first partial-return request created no duplicate header,
  refund, line or stock movement
- a damaged/non-sellable Inventory return refunded correctly without changing
  stock
- for a 1,000 sale with only 200 paid, returning value 500 produced no refund
  and reduced Udhar from 800 to 300
- for a 1,000 sale with 800 paid, returning value 500 refunded exactly 300 by
  the persisted Raast method and settled the credit compatibility state
- Inventory item creation with quantity 4 created one opening movement;
  restock +3 and manual correction -2 reconciled to quantity 5
- duplicate stock adjustment was idempotent and a correction that would create
  negative stock was denied
- missing/wrong/expired return step-up, Technician return/lookup/stock change,
  direct return INSERT and direct Inventory quantity UPDATE were denied
- a SQL NULL line-array probe was rejected by the deferred return-line
  invariant with no header retained
- every probe rolled back: zero `P3H` sales/Inventory rows, zero returns,
  return lines or refunds remain; live counts remain 12 payments and 2 opening
  Inventory movements

The POS return flow now shows every canonical sale line with sold, previously
returned and remaining quantity, asks the restock question only for tracked
Inventory, previews the commercial reduction and actual refund, and retains
the familiar PIN/print workflow. Admin Inventory separates catalog editing from
audited Restock/Manual Correction operations; non-zero creation quantity is an
opening movement.

Phase 3I rollback-only database/RPC matrix passed:

- `get_financial_report` separated retail and repair invoice value from actual
  payment events, refunds, net payments, receivables and approved Udhar
- the required 10,000 repair plus 3,000 advance example reported 10,000
  invoiced, 3,000 collected and a derived 7,000 outstanding balance
- after a 7,000 Raast payment was dated to the following test day, that day
  reported 0 invoiced and 7,000 collected
- retail invoice value and partial payment were reported separately; retail
  and repair Udhar were both derived from active approvals plus canonical
  outstanding balances
- payment-method totals came only from `payments`; a test refund appeared as
  money-out and reduced net payments
- reliable tracked-Inventory cost snapshots produced the expected gross margin
  while Quick Items and repair work were not presented as total business profit
- `settle_udhar` accepted one approved retail or repair family, wrote an
  ordinary payment, used parent-first repair allocation, synchronized only the
  legacy compatibility cache and settled the approval at zero balance
- duplicate retail and repair settlement request IDs retained one payment each
- anonymous RPC use, Technician financial access, Cashier global reporting,
  Cashier direct ledger/Udhar writes, no-PIN, wrong-purpose, expired-PIN and
  suspended normal-user probes were denied; Manager and Orbito Support reads
  remained correct, including Support access during suspension
- all fixtures rolled back; live counts remain 5 sales, 19 tickets, 12
  payments, 1 credit approval, 0 refunds, 0 returns and 0 step-up grants

The Admin dashboard now labels invoiced value and collected money separately.
Reports show the intended financial concepts and derive payment-method
breakdown from payment rows. POS shift printing uses the signed-in actor's
actual payment and refund events, so repair advances/top-ups are included and
refunds reduce net money movement. The familiar Udhar list now combines retail
and repair accounts without exposing allocations or ledger identifiers.

Phase 3J completed the remaining UI and printing cutover:

- `get_repair_family_summary` resolves either a parent or child reference to
  the complete family and returns original/child invoices, durable decisions,
  adjustments, payments, refunds, Udhar and exact totals
- REP-08 rollback fixtures reconciled gross billed 6,500, adjustment -500,
  effective obligation 6,000, payments 5,000, refund 200, net payments 4,800
  and outstanding 1,200; opening the child returned the same parent family
- the original repair slip now states Original Invoice Total, Paid at Creation
  and Remaining at Creation; the final summary prints every invoice,
  adjustment, dated payment/method, refund, balance, Udhar and delivery state
- Admin can record additional work as Pending, Approved or Declined, and can
  later approve/decline a pending Technician proposal with method and note
- downward adjustment and cancellation use their existing exact-purpose PIN
  RPCs; cancellation previews customer refund, retained amount and final
  obligation before confirmation
- optional retail Split Payment accepts Cash plus one digital method plus
  optional PIN-approved Udhar without exposing allocations
- Workshop POS and collection handoff now route through `navigate('/pos')`;
  direct `initPOS` calls with a stale `/workshop` URL are removed
- Technician financial-summary access remained denied while Manager access
  passed; all database fixtures rolled back
- production build passed after the cutover

Automated Windows browser control could not initialize because its local
runtime assets path was unavailable on two attempts. The real-browser Phase 3
smoke remains an explicit Phase 3K/manual release-gate item and is not recorded
as passed.

Not yet run: the final Phase 3K full real-browser and authorization regression.

Security advisor baseline has no critical Phase 3 finding. Existing Phase 2
notices remain: deliberately closed RLS/no-policy service tables, deliberately
callable reviewed `SECURITY DEFINER` configuration/sequence functions, and
leaked-password protection unavailable below Supabase Pro.

The performance advisor initially reported 11 existing unindexed foreign keys.
Phase 3E added the repair-family parent index and Phase 3H added both return
header indexes. The current remaining notices are seven unrelated baseline
foreign keys across attendance, leave, salary, sales and support audit data.

The Phase 3B through Phase 3I advisor reruns reported no unexpected security
finding and no missing-index finding for a new Phase 3 foreign key. The Phase
3 transaction RPC notices are intentional and protected by their
internal Auth/role/suspension/step-up checks. Fresh actor indexes report unused
until application traffic exercises them.

## 12. Rollback and deployment boundary

Phase 3A changed no schema, RPC, policy, Edge Function or application source.
It did delete the six explicitly authorized DEV-only rows described above. That
cleanup has no migration rollback and is recoverable only from an available
Supabase backup/PITR source.

Phase 3B was additive, Phase 3C populated canonical ledger history, Phase 3D
made the new retail writer canonical, Phase 3E cut original repair creation and
collection to transactional RPCs, Phase 3F closed direct ticket INSERT, and
Phase 3G made cancellation/refund and physical delivery dedicated guarded
transactions. Phase 3H removed direct return and Inventory creation paths,
protected current quantity, and made partial return/refund/restock plus manual
stock changes atomic and auditable. Phase 3I removed direct authenticated
legacy Udhar updates and cut settlement, dashboards, reports and shift totals
to canonical RPCs/read models.
Dropping the nine tables is now forbidden.
Any rollback must switch readers/writers while
retaining the backfilled financial and Inventory-opening records; it must not
touch any legacy table or Phase 2 helper.

After the ambiguity decision, deployment remains staged: ledger foundation,
deterministic backfill, atomic retail, atomic repair, additional work,
adjustments/cancellation/delivery, returns/Inventory, unified reads/reporting,
UI/printing, then the full financial and Phase 2 regression gate. Each database
stage requires dry-run, DEV-only apply, verification, advisors and documentation.

## 13. Residual risks and merge recommendation

- Historical Inventory movements/restock cannot be reconstructed.
- Two legacy Ready timestamps are not physical-delivery evidence.
- The complete real-browser regression remains for Phase 3K/manual validation;
  the automated Windows browser-control runtime could not initialize.
- Existing `SECURITY DEFINER`, leaked-password-plan and unindexed-FK notices
  remain documented Phase 2/baseline risks.

Recommendation: GO with the staged Phase 3 implementation. Preserve the
documented legacy Inventory/delivery exceptions, do not invent historical
values, and do not merge `phase3-transaction-ledger` into `development` without
explicit approval.
