# Phase 3 Transaction Ledger Forensic Record

Date started: 2026-09-04

Supabase DEV project: `kxmovywgshyltwusghhj`

Branch: `phase3-transaction-ledger`

Starting HEAD: `972005ddf1d1f4b212c9735630b4971e727926`

Merge status: not merged into `development`

This record intentionally contains no customer names, phone numbers, device
identifiers, passwords, PINs, hashes, service keys, access tokens, refresh
tokens, or authorization headers.

## Phase 3A decision: STOP

Phase 3A found ambiguous live money history. Under the Phase 3 stop rules, no
schema, data, RPC, RLS, or application implementation may begin until the
ambiguities below are resolved without guessing.

Blocking evidence:

- Sales IDs 1, 3, 5 and 6 are positive-value Cash sales with
  `cash_tendered = 0`. The legacy checkout did not require cash tender to cover
  the invoice, so the database cannot prove how much money was received.
- Returns IDs 1 and 2 record refund amounts but the legacy `returns` table has
  no refund-method column. The method shown on the printed slip existed only in
  browser state and was not persisted.

Required business evidence before backfill:

1. Confirm the actual collected amount for sales IDs 1, 3, 5 and 6 from an
   external receipt/cash record, or explicitly classify each record as
   legacy-unreconciled and exclude it from historical payment totals.
2. Confirm whether refunds for returns IDs 1 and 2 were actually paid and, if
   so, their payment methods, or explicitly approve a visible
   `Legacy Unknown` method classification.

The following non-blocking historical gaps are also preserved rather than
guessed:

- all 18 legacy sale-line snapshots across eight non-empty sales omit Inventory
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
| sales | 9 |
| tickets | 19 |
| root tickets | 19 |
| child/sub-invoices | 0 |
| Udhar | 1 |
| returns | 2 |
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
- 4 positive Cash sales have zero tender evidence and are blocking
- 1 sale has zero value
- 8 tickets have zero value
- 3 legacy return-line entries match source sale-line fingerprints and do not
  exceed their source quantities
- 2 Ready tickets carry the legacy auto-set `collected_at` timestamp
- no ticket uses `actual_quote` or `final_price_override`
- Inventory and repair modules are enabled; the client is not suspended

## 6. Deterministic and non-deterministic backfill boundary

Deterministic candidates after the STOP condition is resolved:

- create repair obligations from the immutable legacy ticket quote/final total
  for the 11 non-zero tickets
- create 8 repair payment events from the 7 reconciling payment histories
- create retail payments for the 3 Cash sales with valid tender/change evidence
- reconstruct sale 7's payment and credit state from its matching, internally
  consistent Udhar row
- normalize all current sale JSON lines into `sale_lines` snapshots while
  leaving unknown `inventory_id` and cost snapshots null
- preserve the two return quantities/amounts where their source line
  fingerprints match, subject to resolving refund occurrence/method

Backfill that must not be guessed:

- collected amounts for sales 1, 3, 5 and 6
- refund occurrence/method for returns 1 and 2
- historical Inventory identity, cost, movements or restock disposition
- physical delivery from tickets 9 and 17's auto-populated `collected_at`
- any commercial amount for zero-value legacy records

## 7. Planned target model

No schema has been created. The additive target remains:

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

## 8. Planned transaction and idempotency boundaries

Authenticated, suspension-aware, role-checked PostgreSQL transaction RPCs will
own retail checkout, repair creation, repair payment, additional-work decision,
repair adjustment, cancellation/refund, delivery, retail return and Inventory
adjust/restock. Every critical request will use a unique `request_id` and return
the existing committed result on retry.

No direct browser mutation of ledger tables will be granted. Platform BILL
logging will remain semantically unchanged and occur only after a successful
client transaction.

## 9. Current and planned RLS model

Current Phase 2 policies allow role-appropriate reads but still permit direct
browser insert/update on legacy financial headers. In particular, all staff can
update ticket rows, while direct sale/Udhar/return writes are guarded only by
role and purpose-specific step-up checks.

Every Phase 3 table will enable RLS, deny anonymous access, permit only required
authenticated reads, and deny direct browser INSERT/UPDATE/DELETE. Secure RPCs
will validate `auth.uid()`, Active `app_users`, suspension, canonical role,
feature entitlement and exact step-up purpose. Phase 2 Auth architecture remains
frozen.

## 10. Frontend, printing and reporting cutover plan

No frontend change has been made in Phase 3A.

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

Stopped/not run:

- all Phase 3 schema/RPC/financial/security/browser tests; no implementation
  exists and the live-data STOP condition forbids proceeding

Security advisor baseline has no critical Phase 3 finding. Existing Phase 2
notices remain: deliberately closed RLS/no-policy service tables, deliberately
callable reviewed `SECURITY DEFINER` configuration/sequence functions, and
leaked-password protection unavailable below Supabase Pro.

Performance advisor baseline reports 11 existing unindexed foreign keys,
including `returns.original_sale_id`, `sales.employee_id`, `sales.ticket_id`,
`tickets.parent_ticket_id` and `udhar.sale_id`. New Phase 3 foreign keys will be
indexed; unrelated old indexes remain separately scoped unless needed by the
new transaction queries.

## 12. Rollback and deployment boundary

There is currently nothing to roll back: Phase 3A changed no schema, data, RPC,
policy, Edge Function or application source.

After the ambiguity decision, deployment remains staged: ledger foundation,
deterministic backfill, atomic retail, atomic repair, additional work,
adjustments/cancellation/delivery, returns/Inventory, unified reads/reporting,
UI/printing, then the full financial and Phase 2 regression gate. Each database
stage requires dry-run, DEV-only apply, verification, advisors and documentation.

## 13. Residual risks and merge recommendation

- Historical cash collection cannot currently be proved for four sale IDs.
- Two historical refunds lack durable occurrence/method evidence.
- Historical Inventory movements/restock cannot be reconstructed.
- Two legacy Ready timestamps are not physical-delivery evidence.
- Legacy direct financial mutation paths remain until a later staged cutover.
- Existing `SECURITY DEFINER`, leaked-password-plan and unindexed-FK notices
  remain documented Phase 2/baseline risks.

Recommendation: STOP. Do not create or apply Phase 3 migrations, do not mutate
live financial data, and do not begin the application cutover until the two
blocking money-history decisions at the top of this record are resolved. Do not
merge `phase3-transaction-ledger` into `development`.
