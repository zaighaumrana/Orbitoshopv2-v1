\# Orbitoshopv2 Client Database

\# Living Schema \& Forensic Audit



\*\*Status:\*\* Active stabilization document  

\*\*Baseline captured:\*\* 2026-09-02  

\*\*Working branch:\*\* `development`  

\*\*Baseline schema:\*\* `supabase/baseline/orbitoshopv2-client-schema-2026-09-02.sql`



\---



\## Purpose



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



\---



\# 1. Current baseline tables



The 2026-09-02 client development database contains:



\- active\_sessions

\- attendance

\- employees

\- inventory

\- leaves

\- password\_reset\_requests

\- quick\_items

\- repair\_components

\- returns

\- salary\_config

\- salary\_slips

\- sales

\- shop\_config

\- tickets

\- udhar



Sequence/RPC helpers:



\- next\_invoice\_seq()

\- next\_ticket\_seq()



These sequence helpers are actively used and must not be treated as legacy.



\---



\# 2. Security findings



\## CDB-001 — Browser session is not a database authorization boundary



The application uses the Supabase anon client for ordinary database access.



The login Edge Function verifies the user's credentials, but successful

login is subsequently represented by frontend/sessionStorage state.



The browser does not receive a Supabase Auth identity whose claims can be

trusted by PostgreSQL RLS.



Therefore:



\- hidden buttons are not security

\- frontend role checks are not security

\- sessionStorage is not security

\- client-side PIN prompts are not security



\### Required fix



Create a real authenticated identity/server authorization boundary and

make PostgreSQL RLS enforce the same permissions as the application UI.



Priority: CRITICAL.



\---



\## CDB-002 — Core RLS policies are effectively open



RLS exists on several tables, but policies use broad forms equivalent to:



`USING (true) WITH CHECK (true)`



Affected core tables include:



\- employees

\- inventory

\- returns

\- sales

\- shop\_config

\- tickets

\- udhar



password\_reset\_requests also exposes broad anonymous access.



active\_sessions also exposes anonymous access.



\### Risk



An attacker does not need to respect the role system presented by the UI.



\### Required fix



Replace broad policies after the real authenticated identity model exists.



Do not tighten these policies before replacing the current anon-only

authorization mechanism because doing so would simply break the app.



Priority: CRITICAL.



\---



\## CDB-003 — Additional tables lack meaningful RLS protection



The baseline indicates insufficient protection around:



\- attendance

\- leaves

\- quick\_items

\- repair\_components

\- salary\_config

\- salary\_slips



These must be included in the authorization migration.



Priority: CRITICAL.



\---



\## CDB-004 — Plaintext credentials/PINs exist



Confirmed credential-related columns include:



employees:

\- password

\- pin\_code



shop\_config:

\- owner\_password

\- override\_pin



Current password-change/reset/login logic reads and writes plaintext values.



\### Required fix



Migrate shop users to a proper password authority such as Supabase Auth

or equivalent server-side credential verification.



Privileged PINs must also be server-verified and hashed if retained.



Plaintext columns may only be dropped after every current login/reset/PIN

path has migrated successfully.



Priority: CRITICAL.



\---



\# 3. Login findings



\## CDB-005 — Local Turnstile mismatch



Original behavior:



Frontend on localhost:

\- skipped Turnstile



Login Edge Function:

\- always required Turnstile



Result:

\- local login returned HTTP 403 even when localhost was allowed by Cloudflare



\### Resolution



Turnstile is now intended to run through the same path on:



\- localhost

\- production

\- Cloudflare Pages



The login button remains disabled until Turnstile succeeds.



Failed/expired verification requires a fresh token.



Status: FIXED DURING STABILIZATION PHASE 1.



\---



\## CDB-006 — Orbito support access



Requirement:



Orbito must be able to access a client installation for authorized support

without knowing or sharing the customer's owner password.



Architecture:



Client login page

\-> Orbito Support

\-> Turnstile

\-> client login Edge Function

\-> Orbito platform Supabase Auth

\-> configured Orbito master-admin account

\-> audited support session

\-> client Admin UI



Platform Auth tokens are not returned to the client browser.



Successful logins are recorded in:



`support\_access\_log`



Important:



This creates legitimate platform authentication for support access.



It does NOT by itself solve the wider anon/RLS authorization problem.



Status: FIXED DURING STABILIZATION PHASE 1.



\---



\## CDB-007 — active\_sessions may be legacy



The table exists but the current primary login flow does not establish its

authoritative session through this table.



Some account-management code may still reference it.



\### Required action



Verify every reference before deleting.



Classification: PROBABLE LEGACY.



\---



\# 4. Retail checkout findings



\## CDB-008 — Inventory is not decremented during retail checkout



Cart entries can retain an inventory identity, but persisted checkout does

not reliably decrement inventory.



\### Required fix



Sale creation and inventory movement must occur in the same database

transaction.



Long-term target:



`inventory\_movements`



rather than relying only on mutable inventory.qty.



Priority: CRITICAL.



\---



\## CDB-009 — Sale and Udhar creation are non-atomic



Current flow can:



1\. create the sales row

2\. attempt the Udhar row



If step 2 fails, the sale remains committed.



Retrying can duplicate financial records.



\### Required fix



One PostgreSQL transaction/RPC must create the commercial transaction,

payment/credit state and inventory changes together.



Priority: CRITICAL.



\---



\## CDB-010 — Cash underpayment can be persisted as a completed sale



The interface may show that cash is short while allowing the sale to be

recorded as though the bill were paid.



\### Required fix



Normal cash checkout requires:



cash\_tendered >= amount\_due



Any unpaid amount must explicitly enter the Udhar/credit path.



Priority: CRITICAL.



\---



\# 5. Returns findings



\## CDB-011 — Returns do not fully reverse the original transaction



A returns row may be created without reliably:



\- reversing/netting revenue

\- restoring inventory

\- adjusting the original commercial transaction

\- adjusting related Udhar

\- recording a proper refund/payment reversal



\### Required fix



Return/refund must become an atomic accounting and inventory transaction.



Priority: HIGH.



\---



\# 6. Repair accounting findings



\## CDB-012 — Repair money and retail money use different accounting worlds



Retail checkout writes to sales.



Repair work primarily stores money on tickets using fields such as:



\- advance\_payment

\- amount\_paid

\- balance\_due

\- payment\_history



Repair revenue therefore does not consistently enter the same revenue,

receipts and cash reporting system.



The schema already contains:



`sales.ticket\_id`



but repair flows do not use it as a canonical commercial relationship.



\### Impact



Repair money can disappear from:



\- dashboard revenue

\- reports

\- shift/cash calculations

\- receipt archive



Priority: CRITICAL.



\---



\## CDB-013 — Repair advance can be double-spent



Initial ticket creation reduces the parent ticket balance using the advance.



Later additional-work/sub-invoice logic can treat the original

advance\_payment as though the credit is still available.



Example:



Original repair = Rs 100  

Advance = Rs 50  

Additional work = Rs 30



The same Rs 50 can effectively be used twice.



\### Required fix



Create an immutable payment record.



Allocate that payment to charges.



An amount may never be allocated more than once.



Priority: CRITICAL.



\---



\## CDB-014 — Repair overpayment may silently disappear



Repair payment logic can consume only the outstanding balances while the

UI reports the whole entered amount as recorded.



\### Required fix



Either:



\- reject payment above amount due

\- explicitly record customer credit

\- explicitly record change/refund



Never silently discard money.



Priority: CRITICAL.



\---



\## CDB-015 — Repair payment allocation is non-atomic



Payments can update parent and child tickets sequentially.



Failure in the middle can leave a partially applied payment.



\### Required fix



Payment creation + allocations + resulting balances must execute in one

PostgreSQL transaction.



Priority: CRITICAL.



\---



\## CDB-016 — Financial status incorrectly changes repair workflow status



Paying a balance to zero can set:



status = Ready



and may populate:



collected\_at



Payment does not mean:



\- repair work is complete

\- technician marked device Ready

\- customer collected device



\### Required model



Repair status:

Pending

\-> In Progress

\-> Ready

\-> Delivered



Financial status:

Unpaid

\-> Partial

\-> Paid



Delivery:

explicit handoff event



These concepts must remain independent.



Priority: CRITICAL.



\---



\## CDB-017 — Multiple competing repair totals exist



tickets contains overlapping monetary fields including:



\- estimated\_quote

\- actual\_quote

\- final\_price\_override

\- final\_total

\- amount\_paid

\- balance\_due



Different paths can use different values.



\### Required fix



Introduce one authoritative invoice/charge total.



Payment balance must derive from:



charges - allocated payments



Priority: HIGH.



\---



\## CDB-018 — Removed repair components can remain financially charged



A repair component may be represented as:



removed = true



inside JSON without a corresponding authoritative financial revision.



\### Required fix



Define whether component removal is:



\- an operational note

\- invoice revision

\- credit/reversal



Visible repair contents and collectible amount must never diverge.



Priority: HIGH.



\---



\# 7. Udhar findings



\## CDB-019 — Udhar settlement can overpay



Payment input can be added to amount\_paid while only balance\_due is clamped.



This can produce:



amount\_paid > total\_amount



\### Required fix



Reject excess payment unless explicitly representing change/customer credit.



Priority: HIGH.



\---



\## CDB-020 — partial\_udhar\_allowed appears incomplete/dead



shop\_config contains:



partial\_udhar\_allowed



but forensic tracing found that it is not consistently enforced in the

actual checkout path.



\### Required action



Either implement it as an authoritative business rule or remove it after

verification.



Classification: VERIFY.



\---



\# 8. Routing finding



\## CDB-021 — Workshop -> POS can render POS under /workshop



Some navigation directly invokes POS initialization rather than using the

router.



Handlers can check window.location.pathname and therefore refuse to work

even though the POS interface is visible.



\### Required fix



Cross-module navigation must use the router:



navigate('/pos')



Priority: HIGH / LOW-RISK FIX.



\---



\# 9. SaaS billing findings



\## CDB-022 — Client rates are hardcoded



Current client code contains fixed billing-rate constants while Orbito

platform billing can expose configurable rates.



This can cause the client to log an event at a stale rate even after the

platform rate changes.



\### Required fix



Define one authoritative rate-distribution mechanism.



Immutable usage events must contain their effective rate/version at the

time of creation.



Status: DEFER until client transaction model is stable.



\---



\## CDB-023 — Repair flow may emit duplicate BILL events



A BILL usage event can occur at repair creation and again during payment

collection.



If SaaS pricing is intended to mean "per bill generated", collecting

payment must not create another billable event.



\### Required fix



Define the billable-event contract and make usage-event creation

idempotent.



Status: DEFER until repair transaction semantics are stabilized.



\---



\# 10. Legacy candidates



These are candidates only.



Nothing in this section should be dropped until code references and live

data are verified.



employees:

\- pin\_code



shop\_config:

\- strict\_login\_mode

\- platform\_client\_id

\- platform\_url

\- platform\_anon

\- billing\_model

\- per\_receipt\_rate

\- per\_ticket\_rate

\- per\_item\_rate

\- workshop\_enabled may overlap newer module flags



sales:

\- discount\_reason



tickets:

\- parts\_used

\- final\_price\_override



table:

\- active\_sessions



Candidate does NOT mean safe to delete.



\---



\# 11. Target financial model



The stabilized system should separate four concepts.



\## Ticket



Operational repair workflow.



\## Invoice / Sale / Charge



What the customer owes.



\## Payment



Money actually received/refunded.



\## Payment Allocation



How a payment is assigned to invoices/charges.



\## Inventory Movement



Stock changes caused by sales, repairs, returns or manual adjustments.



Target relationship:



Ticket

\-> Invoice / Charge

\-> Payment Allocation <- Payment

\-> Inventory Movement



Balances become derived financial values rather than independent numbers

mutated in multiple places.



\---



\# 12. Stabilization order



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



\---



\# 13. Migration register



\## 20260903\_001\_support\_access\_log.sql



Adds:



`public.support\_access\_log`



Purpose:



Audits successful Orbito platform support access.



Characteristics:



\- service-role written

\- no anon access

\- no authenticated-browser access

\- additive migration

\- does not change customer financial records



\---



\# 14. Final release audit



Before releasing the first client:



Create a fresh schema-only dump.



Compare:



2026-09-02 baseline

vs

all migrations

vs

fresh live development schema



Verify:



\- every DB change exists as a migration

\- no dashboard-only mystery schema changes exist

\- every table has intentional RLS/grants

\- no plaintext reusable credentials remain browser-readable

\- retail money reconciles

\- repair money reconciles

\- Udhar reconciles

\- refunds reconcile

\- inventory movements reconcile

\- support access is audited

\- production build passes

\- core route smoke tests pass



Only then create the client V1 release branch/tag.



\---



\# Update Log



\## 2026-09-03



Created the living forensic document.



Recorded the 2026-09-02 schema baseline findings.



Fixed the localhost/production Turnstile mismatch.



Started controlled Orbito platform support authentication.



Added the first post-baseline migration:

20260903\_001\_support\_access\_log.sql
- Fixed the localhost/production Turnstile mismatch.
- Added controlled Orbito platform support authentication.
- Added server-written support access auditing.
- Fixed duplicate route resolution after login.
- Added Turnstile widget cleanup during successful authentication.
