# Orbitoshopv2 Client Database
# Living Schema & Forensic Audit

**Status:** Active stabilization document  
**Baseline captured:** 2026-09-02  
**Working branch:** `phase2-auth-rls` (not merged into `development`)
**Baseline schema:** `supabase/baseline/orbitoshopv2-client-schema-2026-09-02.sql`

---

## Purpose

This document preserves the database, security, financial, inventory and
execution-flow problems discovered during Orbitoshopv2 V1 forensic review.

It must be updated as each stabilization phase is completed.

The original baseline SQL is historical evidence and must never be edited
to represent later database changes.

All database changes after the baseline must be represented by migrations
under:

`supabase/migrations/`

At final release a fresh schema dump will be compared against the baseline,
migration history and application code.

---

# 1. Current baseline tables

The 2026-09-02 client development database contains:

- active_sessions
- attendance
- employees
- inventory
- leaves
- password_reset_requests
- quick_items
- repair_components
- returns
- salary_config
- salary_slips
- sales
- shop_config
- tickets
- udhar

Sequence/RPC helpers:

- next_invoice_seq()
- next_ticket_seq()

These sequence helpers are actively used and must not be treated as legacy.

---

# 2. Security findings

## CDB-001 â€” Browser session is not a database authorization boundary

The application uses the Supabase anon client for ordinary database access.

The login Edge Function verifies the user's credentials, but successful
login is subsequently represented by frontend/sessionStorage state.

The browser does not receive a Supabase Auth identity whose claims can be
trusted by PostgreSQL RLS.

Therefore:

- hidden buttons are not security
- frontend role checks are not security
- sessionStorage is not security
- client-side PIN prompts are not security

### Required fix

Create a real authenticated identity/server authorization boundary and
make PostgreSQL RLS enforce the same permissions as the application UI.

Status: RESOLVED IN PHASE 2. Supabase Auth sessions and the canonical
`app_users` role/status mapping now drive PostgreSQL authorization. Forged
legacy `retailos_session` state is ignored and removed.

---

## CDB-002 â€” Core RLS policies are effectively open

RLS exists on several tables, but policies use broad forms equivalent to:

`USING (true) WITH CHECK (true)`

Affected core tables include:

- employees
- inventory
- returns
- sales
- shop_config
- tickets
- udhar

password_reset_requests also exposes broad anonymous access.

active_sessions also exposes anonymous access.

### Risk

An attacker does not need to respect the role system presented by the UI.

### Required fix

Replace broad policies after the real authenticated identity model exists.

Do not tighten these policies before replacing the current anon-only
authorization mechanism because doing so would simply break the app.

Status: RESOLVED IN PHASE 2. Migration
`20260903181153_phase2_authenticated_rls.sql` removed the allow-all policies and
anonymous table grants and installed the tested authenticated role matrix.

---

## CDB-003 â€” Additional tables lack meaningful RLS protection

The baseline indicates insufficient protection around:

- attendance
- leaves
- quick_items
- repair_components
- salary_config
- salary_slips

These must be included in the authorization migration.

Status: RESOLVED IN PHASE 2. All 20 public tables now have RLS enabled, including
the six tables listed above, and no anonymous table privileges remain.

---

## CDB-004 â€” Plaintext credentials/PINs exist

Confirmed credential-related columns include:

employees:
- password
- pin_code

shop_config:
- owner_password
- override_pin

Current password-change/reset/login logic reads and writes plaintext values.

### Required fix

Migrate shop users to a proper password authority such as Supabase Auth
or equivalent server-side credential verification.

Privileged PINs must also be server-verified and hashed if retained.

Plaintext columns may only be dropped after every current login/reset/PIN
path has migrated successfully.

Status: RESOLVED IN PHASE 2. Supabase Auth is the canonical password authority,
the temporary legacy bridge uses service-only password hashes, the override PIN
is server-hashed, and unused employee PIN data was nulled. Validated constraints
now require `employees.password`, `shop_config.owner_password`, and
`shop_config.override_pin` to remain null.

---

# 3. Login findings

## CDB-005 â€” Local Turnstile mismatch

Original behavior:

Frontend on localhost:
- skipped Turnstile

Login Edge Function:
- always required Turnstile

Result:
- local login returned HTTP 403 even when localhost was allowed by Cloudflare

### Resolution

Turnstile is now intended to run through the same path on:

- localhost
- production
- Cloudflare Pages

The login button remains disabled until Turnstile succeeds.

Failed/expired verification requires a fresh token.

Status: FIXED DURING STABILIZATION PHASE 1.

---

## CDB-006 â€” Orbito support access

Requirement:

Orbito must be able to access a client installation for authorized support
without knowing or sharing the customer's owner password.

Architecture:

Client login page
-> Orbito Support
-> Turnstile
-> client login Edge Function
-> Orbito platform Supabase Auth
-> configured Orbito master-admin account
-> deterministic client-project Support Auth identity
-> magic-link token generation and verification
-> audited support session carrying both platform and client identity
-> client Admin UI

Platform Auth tokens are not returned to the client browser.

Successful logins are recorded in:

`support_access_log`

Important:

The platform credential and client-project Auth identity are deliberately
separate. A platform email may also belong to a shop Owner without collision;
the support identity never merges with or takes over the customer identity.

Status: FIXED IN PHASE 2. The real Owner and Support identities are separate,
the support row has canonical `Orbito Support` role and no employee link, and
the access log records the real platform identity plus client Auth user ID.

---

## CDB-007 â€” active_sessions may be legacy

The table exists but the current primary login flow does not establish its
authoritative session through this table.

Some account-management code may still reference it.

### Required action

Verify every reference before deleting.

Classification: PROBABLE LEGACY.

---

# 4. Retail checkout findings

## CDB-008 â€” Inventory is not decremented during retail checkout

Cart entries can retain an inventory identity, but persisted checkout does
not reliably decrement inventory.

### Required fix

Sale creation and inventory movement must occur in the same database
transaction.

Long-term target:

`inventory_movements`

rather than relying only on mutable inventory.qty.

Priority: CRITICAL.

---

## CDB-009 â€” Sale and Udhar creation are non-atomic

Current flow can:

1. create the sales row
2. attempt the Udhar row

If step 2 fails, the sale remains committed.

Retrying can duplicate financial records.

### Required fix

One PostgreSQL transaction/RPC must create the commercial transaction,
payment/credit state and inventory changes together.

Priority: CRITICAL.

---

## CDB-010 â€” Cash underpayment can be persisted as a completed sale

The interface may show that cash is short while allowing the sale to be
recorded as though the bill were paid.

### Required fix

Normal cash checkout requires:

cash_tendered >= amount_due

Any unpaid amount must explicitly enter the Udhar/credit path.

Priority: CRITICAL.

---

# 5. Returns findings

## CDB-011 â€” Returns do not fully reverse the original transaction

A returns row may be created without reliably:

- reversing/netting revenue
- restoring inventory
- adjusting the original commercial transaction
- adjusting related Udhar
- recording a proper refund/payment reversal

### Required fix

Return/refund must become an atomic accounting and inventory transaction.

Priority: HIGH.

---

# 6. Repair accounting findings

## CDB-012 â€” Repair money and retail money use different accounting worlds

Retail checkout writes to sales.

Repair work primarily stores money on tickets using fields such as:

- advance_payment
- amount_paid
- balance_due
- payment_history

Repair revenue therefore does not consistently enter the same revenue,
receipts and cash reporting system.

The schema already contains:

`sales.ticket_id`

but repair flows do not use it as a canonical commercial relationship.

### Impact

Repair money can disappear from:

- dashboard revenue
- reports
- shift/cash calculations
- receipt archive

Priority: CRITICAL.

---

## CDB-013 â€” Repair advance can be double-spent

Initial ticket creation reduces the parent ticket balance using the advance.

Later additional-work/sub-invoice logic can treat the original
advance_payment as though the credit is still available.

Example:

Original repair = Rs 100  
Advance = Rs 50  
Additional work = Rs 30

The same Rs 50 can effectively be used twice.

### Required fix

Create an immutable payment record.

Allocate that payment to charges.

An amount may never be allocated more than once.

Priority: CRITICAL.

---

## CDB-014 â€” Repair overpayment may silently disappear

Repair payment logic can consume only the outstanding balances while the
UI reports the whole entered amount as recorded.

### Required fix

Either:

- reject payment above amount due
- explicitly record customer credit
- explicitly record change/refund

Never silently discard money.

Priority: CRITICAL.

---

## CDB-015 â€” Repair payment allocation is non-atomic

Payments can update parent and child tickets sequentially.

Failure in the middle can leave a partially applied payment.

### Required fix

Payment creation + allocations + resulting balances must execute in one
PostgreSQL transaction.

Priority: CRITICAL.

---

## CDB-016 â€” Financial status incorrectly changes repair workflow status

Paying a balance to zero can set:

status = Ready

and may populate:

collected_at

Payment does not mean:

- repair work is complete
- technician marked device Ready
- customer collected device

### Required model

Repair status:
Pending
-> In Progress
-> Ready
-> Delivered

Financial status:
Unpaid
-> Partial
-> Paid

Delivery:
explicit handoff event

These concepts must remain independent.

Priority: CRITICAL.

---

## CDB-017 â€” Multiple competing repair totals exist

tickets contains overlapping monetary fields including:

- estimated_quote
- actual_quote
- final_price_override
- final_total
- amount_paid
- balance_due

Different paths can use different values.

### Required fix

Introduce one authoritative invoice/charge total.

Payment balance must derive from:

charges - allocated payments

Priority: HIGH.

---

## CDB-018 â€” Removed repair components can remain financially charged

A repair component may be represented as:

removed = true

inside JSON without a corresponding authoritative financial revision.

### Required fix

Define whether component removal is:

- an operational note
- invoice revision
- credit/reversal

Visible repair contents and collectible amount must never diverge.

Priority: HIGH.

---

# 7. Udhar findings

## CDB-019 â€” Udhar settlement can overpay

Payment input can be added to amount_paid while only balance_due is clamped.

This can produce:

amount_paid > total_amount

### Required fix

Reject excess payment unless explicitly representing change/customer credit.

Priority: HIGH.

---

## CDB-020 â€” partial_udhar_allowed appears incomplete/dead

shop_config contains:

partial_udhar_allowed

but forensic tracing found that it is not consistently enforced in the
actual checkout path.

### Required action

Either implement it as an authoritative business rule or remove it after
verification.

Classification: VERIFY.

---

# 8. Routing finding

## CDB-021 â€” Workshop -> POS can render POS under /workshop

Some navigation directly invokes POS initialization rather than using the
router.

Handlers can check window.location.pathname and therefore refuse to work
even though the POS interface is visible.

### Required fix

Cross-module navigation must use the router:

navigate('/pos')

Priority: HIGH / LOW-RISK FIX.

---

# 9. SaaS billing findings

## CDB-022 â€” Client rates are hardcoded

Current client code contains fixed billing-rate constants while Orbito
platform billing can expose configurable rates.

This can cause the client to log an event at a stale rate even after the
platform rate changes.

### Required fix

Define one authoritative rate-distribution mechanism.

Immutable usage events must contain their effective rate/version at the
time of creation.

Status: DEFER until client transaction model is stable.

---

## CDB-023 â€” Repair flow may emit duplicate BILL events

A BILL usage event can occur at repair creation and again during payment
collection.

If SaaS pricing is intended to mean "per bill generated", collecting
payment must not create another billable event.

### Required fix

Define the billable-event contract and make usage-event creation
idempotent.

Status: DEFER until repair transaction semantics are stabilized.

---

# 10. Legacy candidates

These are candidates only.

Nothing in this section should be dropped until code references and live
data are verified.

employees:
- pin_code

shop_config:
- strict_login_mode
- platform_client_id
- platform_url
- platform_anon
- billing_model
- per_receipt_rate
- per_ticket_rate
- per_item_rate
- workshop_enabled may overlap newer module flags

sales:
- discount_reason

tickets:
- parts_used
- final_price_override

table:
- active_sessions

Candidate does NOT mean safe to delete.

---

# 11. Target financial model

The stabilized system should separate four concepts.

## Ticket

Operational repair workflow.

## Invoice / Sale / Charge

What the customer owes.

## Payment

Money actually received/refunded.

## Payment Allocation

How a payment is assigned to invoices/charges.

## Inventory Movement

Stock changes caused by sales, repairs, returns or manual adjustments.

Target relationship:

Ticket
-> Invoice / Charge
-> Payment Allocation <- Payment
-> Inventory Movement

Balances become derived financial values rather than independent numbers
mutated in multiple places.

---

# 12. Stabilization order

Phase 1
Login / Turnstile / Orbito support entry

Phase 2
Real shop authentication + RLS + plaintext credential migration

Phase 3
Canonical payment ledger and repair advance/top-up accounting

Phase 4
Atomic retail sale + Udhar + inventory execution

Phase 5
Separate repair workflow state from financial state

Phase 6
Payment bounds and overpayment handling

Phase 7
Returns + inventory reversal

Phase 8
Workshop -> POS routing

Phase 9
Revenue/report reconciliation

Phase 10
Structured diagnostics/tracing

Phase 11
Legacy cleanup and final schema audit

---

# 13. Migration register

## 20260903020000_support_access_log.sql

Adds:

`public.support_access_log`

Purpose:

Audits successful Orbito platform support access.

Characteristics:

- service-role written
- no anon access
- no authenticated-browser access
- additive migration
- does not change customer financial records

---

## Phase 2 migration set

- `20260903165753_phase2_auth_foundation.sql`: canonical `app_users`, private
  role helpers, credential/security stores, step-up authorizations and safe
  configuration RPCs.
- `20260903170222_phase2_auth_bridge_helpers.sql`: server-only verification for
  the one-time legacy hash bridge.
- `20260903171448_phase2_security_helpers.sql`: server-only PIN hash helpers.
- `20260903175518_phase2_legacy_credential_vault.sql`: hashes legacy reusable
  credentials and clears plaintext locations.
- `20260903180703_phase2_neutralize_unused_employee_pin.sql`: removes confirmed
  unused legacy employee PIN data.
- `20260903181153_phase2_authenticated_rls.sql`: replaces broad grants and
  policies with the canonical authenticated role matrix.
- `20260904001510_phase2_reseal_legacy_plaintext_credentials.sql`: re-clears a
  detected pre-cutover plaintext regression and adds validated null constraints.

All seven migrations are applied to the linked DEV project. Local and remote
history match and the final linked dry-run reports the remote database up to
date.

---

# 14. Final release audit

Before releasing the first client:

Create a fresh schema-only dump.

Compare:

2026-09-02 baseline
vs
all migrations
vs
fresh live development schema

Verify:

- every DB change exists as a migration
- no dashboard-only mystery schema changes exist
- every table has intentional RLS/grants
- no plaintext reusable credentials remain browser-readable
- retail money reconciles
- repair money reconciles
- Udhar reconciles
- refunds reconcile
- inventory movements reconcile
- support access is audited
- production build passes
- core route smoke tests pass

Only then create the client V1 release branch/tag.

---

# Update Log

## 2026-09-03

Created the living forensic document.

Recorded the 2026-09-02 schema baseline findings.

Fixed the localhost/production Turnstile mismatch.

Started controlled Orbito platform support authentication.

Added the first post-baseline migration:
20260903020000_support_access_log.sql
- Fixed the localhost/production Turnstile mismatch.
- Added controlled Orbito platform support authentication.
- Added server-written support access auditing.
- Fixed duplicate route resolution after login.
- Added Turnstile widget cleanup during successful authentication.

### Phase 2 authentication/RLS stabilization

Phase 2 work is tracked in `docs/PHASE2_AUTH_RLS_FORENSIC.md`.

The DEV database now has the additive canonical `app_users` identity layer,
server-only hash vault, server-only shop security, short-lived step-up records,
safe configuration RPCs, and the Auth/administration/PIN/reset/public-tracking
Edge Functions. Legacy passwords and PIN data were hashed and their old
plaintext locations were nulled.

## 2026-09-04

Completed the Phase 2 DEV cutover after the real Business Owner, existing
Cashier, and separated Orbito Support login/refresh/logout gate passed cleanly.

- Applied the full authenticated RLS/grant migration to all public tables.
- Passed the anonymous, role-read, role-mutation, PIN-purpose/expiry, public
  tracking and client-suspension matrices.
- Verified the dedicated support `app_users` identity and matching audited access
  row without changing the shop Owner identity.
- Caught one legacy employee plaintext-password regression in a post-matrix
  count-only check, never selected its value, cleared it, and added validated
  database constraints that forbid future plaintext password/override-PIN data.
- Preserved the remaining service-only hash-vault row for first-login migration.
- Re-ran security/performance advisors, production build, migration parity and
  linked dry-run checks.
- Created disposable Manager and Technician accounts through the deployed
  `account-admin` flow and passed live Supabase JWT login/refresh/logout, route,
  Edge Function and direct RLS enforcement tests for both roles.
- Confirmed Manager employee administration is limited to Cashier/Technician;
  Manager/Owner creation, promotion and credential resets are denied. Manager
  Settings access is denied by the intended matrix.
- Confirmed Technician access is limited to Workshop, own employee data and the
  intended ticket read/update capabilities; Admin, Employees, POS/inventory,
  salary data, ticket creation and role escalation are denied.
- Deactivated all disposable employees through the supported lifecycle and
  verified zero active test employees, zero orphan Auth/app/employee links, and
  zero remaining test attendance/ticket fixtures. Nine fully linked inactive
  identity chains remain because the supported lifecycle has no deletion path.
- Attempted to enable Supabase leaked-password protection through the Management
  API. Supabase rejected it because the project is below Pro; the setting was
  re-read as disabled. This production risk is explicitly accepted pending a
  plan upgrade.
- Final production build passed. Local and remote migrations match through
  `20260904001510`; the final linked dry-run reports the remote database is up
  to date.
- Phase 2 is merge-ready subject to the documented plan-level leaked-password
  risk and later-phase financial/workflow gaps. No merge was performed.
- Kept `phase2-auth-rls` unmerged into `development`.

See `docs/PHASE2_AUTH_RLS_FORENSIC.md` for the complete evidence, residual gaps,
and merge recommendation.

### Phase 3A transaction-ledger preflight

Started Phase 3 on `phase3-transaction-ledger` from the clean, merged and tagged
Phase 2 baseline at `972005ddf1d1f4b212c9735630b4971e727926`.

- `npm ci` and the production build passed; the existing mixed static/dynamic
  `src/shared.js` import warning remains.
- Local and remote migrations match through `20260904001510`; the linked
  dry-run reports the remote database is up to date.
- Initial read-only live diagnostics found 9 sales, 19 root tickets, 1 Udhar record, 2
  returns, 2 Inventory items, 4 Quick Items and 7 repair components.
- Identifiers, parentage, ticket/Udhar arithmetic, payment-history sums, return
  quantities and plaintext-credential invariants otherwise reconcile.
- Initial Phase 3A STOP: positive Cash sales 1, 3, 5 and 6 had no tender evidence, so
  actual received amounts cannot be backfilled without external evidence or an
  explicit legacy-unreconciled classification.
- Initial Phase 3A STOP: returns 1 and 2 contained refund amounts but no durable refund
  occurrence/method evidence.
- All legacy sale/return line JSON lacks Inventory identity; historical stock
  movements and restock decisions will not be guessed.
- Ready tickets 9 and 17 have legacy payment-triggered `collected_at` values;
  these are not accepted as physical-delivery evidence.
- Before resolving the STOP, no Phase 3 schema, data, RPC, policy, Edge Function
  or application mutation was made.

The user subsequently confirmed the six blocking rows were disposable DEV data
and authorized removal. A guarded transaction deleted returns 1 and 2 followed
by sales 1, 3, 5 and 6 after verifying no Udhar, ticket or unexpected return
dependencies. Post-cleanup counts are 5 sales and 0 returns. All blocking
financial checks now return zero, so Phase 3A is GO. Configuration, catalog,
Inventory, Auth/app identities, employees and audit records were preserved.

See `docs/PHASE3_TRANSACTION_LEDGER_FORENSIC.md` for the full preflight,
backfill boundary, target model and required decision before implementation.

### Phase 3B ledger foundation

Applied `20260904200000_phase3_ledger_foundation.sql` to DEV.

- Added `sale_lines`, `payments`, `payment_allocations`, `refunds`,
  `invoice_adjustments`, `credit_approvals`, `additional_work_proposals`,
  `return_lines`, and `inventory_movements`.
- Added exact-money, identity-shape, positive-quantity, decision-state and
  commercial-family constraints.
- Indexed all new foreign-key and primary query paths.
- Enabled RLS on all nine tables.
- Granted authenticated SELECT only where required and added role-specific read
  policies; anonymous access and direct authenticated mutation privileges are
  zero.
- Verified all nine tables were empty immediately after the foundation apply.
- Security advisors found no new Phase 3 issue. Performance advisors found no
  missing new FK index; unused-index notices are expected before ledger traffic.
- Phase 2 Auth, support, step-up and suspension helpers were not changed.

### Phase 3C deterministic backfill

Applied `20260904203000_phase3_deterministic_backfill.sql` to DEV after guarded
precondition checks.

- Normalized 11 legacy sale JSON lines into immutable `sale_lines` snapshots;
  unknown historical Inventory identity and cost remain null.
- Created 12 payment events and 12 allocations. Both totals reconcile to
  36,449, with zero unbalanced payment records.
- Reconstructed one active legacy credit approval for the remaining 1,000
  Udhar balance without inventing an approver or step-up event.
- Created two Inventory opening-balance movements totaling quantity 50, equal
  to the current Inventory quantity.
- Created no refund, return-line, invoice-adjustment or additional-work history
  because the retained DEV records provide no deterministic evidence for it.
- Advisor verification found no new Phase 3 security warning and no missing
  foreign-key index on the new schema.
- The migration is additive historical normalization only; no frontend writer
  has been cut over yet and Phase 2 Auth/RLS remains unchanged.

### Phase 3D atomic retail checkout

Applied `20260904210000_phase3_atomic_retail_checkout.sql` to DEV.

- Added nullable unique `sales.request_id` for retry-safe legacy-header linkage,
  plus unique non-null sale invoice and Udhar-per-sale indexes.
- Added the authenticated `create_retail_sale` transaction RPC. It validates the
  active canonical role, suspension, current Quick Item/Inventory price, stock,
  discounts, tender/change and purpose-specific Udhar authorization.
- A successful call atomically writes `sales`, `sale_lines`, `payments`,
  `payment_allocations`, optional `credit_approvals`/compatibility `udhar`, and
  tracked `inventory_movements` plus current quantity.
- Removed authenticated direct `sales` INSERT and `udhar` INSERT privileges and
  policies. Ledger mutation remains RPC-only.
- Updated POS checkout to preserve Quick Item/Inventory identity and reuse its
  request UUID after an uncertain retry.
- Rollback-only RPC tests passed exact Cash, change, split tender with Udhar,
  duplicate retry, Inventory decrement, Quick Item non-stock behavior, and all
  relevant denial/rollback cases. No test sale was retained.
- Advisor review found only the intentionally callable authenticated transaction
  RPC plus documented baseline notices; no new missing-FK-index finding.

### Phase 3E atomic repair transactions

Applied `20260904220000_phase3_atomic_repair_transactions.sql` to DEV.

- Added unique non-null `tickets.request_id` and `tickets.invoice_number`
  indexes plus the previously missing repair-family parent index.
- Added `create_repair_ticket`, which atomically assigns the ticket/invoice
  numbers, locks the original invoice, and records initial payment/allocation.
- Added `record_repair_payment`, which locks one root family, validates its
  current obligation and allocates each tender parent-first/oldest-first.
- Compatibility `amount_paid`, `balance_due` and `payment_history` are derived
  from canonical allocations. Payment never changes repair status or delivery
  timestamps.
- POS new-ticket placement and collection now use retry-safe UUID-backed RPCs.
- Rollback-only tests passed no-advance, advance, duplicate create/payment,
  Cash change, parent/child allocation and denial cases. No fixture remained.
- Anonymous execution is denied; Technician payment is denied by the canonical
  role check. Advisor output added only the expected reviewed RPC notices and no
  new missing-FK-index finding.

### Phase 3F additional work and adjustments

Applied `20260904230000_phase3_additional_work_and_adjustments.sql` to DEV.

- Added a unique decision request id to `additional_work_proposals`.
- Added pending-proposal, decision and combined approved-work RPCs. Technician
  may propose, but only the existing financial roles may approve/decline.
- Approved decisions atomically create a distinct immutable child invoice with
  zero advance/payment; Declined decisions create no invoice.
- Added the PIN-protected immutable downward-adjustment RPC. It preserves the
  original invoice and rejects reductions that require refund reconciliation.
- Replaced the legacy sub-invoice INSERT with the approved-work RPC and removed
  authenticated direct `tickets` INSERT privilege/policy.
- Rollback-only tests passed Phone/WhatsApp approval, decline, no advance reuse,
  original-value immutability, adjustment/idempotency and denial cases. No
  fixture remained.
- Advisor review found only intentionally callable authenticated transaction
  RPCs and documented baseline notices; no new missing-FK-index finding.

### Phase 3G repair cancellation and delivery

Applied `20260905000000_phase3_repair_cancellation_and_delivery.sql` to DEV.

- Added immutable cancellation and delivery request IDs, timestamps, reasons
  and acting Auth-user references to repair roots.
- Added a ticket mutation guard that blocks direct financial, immutable,
  Delivered and Cancelled changes while preserving normal Workshop status
  movement such as Pending to Ready.
- Added `cancel_repair`, requiring the exact `repair-refund` PIN purpose and
  atomically reconciling the retained obligation, optional refund and Cancelled
  state without rewriting original invoices or payments.
- Added `deliver_repair`, permitting physical handoff only from Ready when the
  family is paid or its outstanding balance has a fresh Udhar approval.
- Updated the POS Ready-ticket modal to use explicit paid or PIN-approved Udhar
  delivery; removed direct Delivered and direct quote edits from Admin.
- Deployed `verify-pin` version 2 with JWT verification enabled and the new
  `repair-refund` purpose.
- Rollback-only tests passed full/partial/zero refund, payment-before-delivery,
  Udhar delivery, post-delivery payment, idempotency, actor/timestamp and all
  authorization/direct-write denials. No test fixture remained.
- Post-cutover counts remain 12 payments, 12 allocations, 2 Inventory opening
  movements, 1 legacy credit approval, 0 refunds and 0 adjustments.
- Advisor review found only the expected reviewed transaction-RPC and baseline
  notices; no new missing-index finding for a Phase 3 foreign key.

