# Phase 4 client completion — implementation work log

Status: PHASE 4 CLIENT-SIDE WORK COMPLETE (100% of this client phase), merged into `development`, migrated to Supabase, required Edge Functions deployed, frontend pushed and deployed through Cloudflare, and live smoke PASSED. This status is based on the project owner's confirmation; no new validation was performed for this documentation update. `development` is the current integrated client baseline for completed Phases 1–4. The original implementation branch `codex/phase4-client-completion` and base `2c8641f` are historical, not the current HEAD. Separate Orbito Platform modernization remains future work. Final repo-wide regression/cleanup is the next planned client task, not completed work. See [PROJECT_STATUS.md](PROJECT_STATUS.md).

Both post-deployment fixes are committed, pushed and deployed: missing/non-string numeric key handling, and duplicate retail checkout suppression through RPC completion and reload. Backend sale validation and request-ID retry behavior remain unchanged. The former 95%/pending-deployment status is superseded.

## Implementation map

1. S1: extend existing `src/html.js` escaping across Admin, POS, Workshop, repairs, inventory, EMS, receipts, and public tracker. Preserve trusted markup and numeric identifiers; validate URL contexts separately.
2. S9: replace temporary-password `Math.random` with rejection-sampled Web Crypto and guaranteed existing password-policy character classes.
3. S2: service-only transactional PIN verification/attempt state/authorization issuance, actor-keyed cooldowns; distinguish infrastructure errors from wrong/locked PIN.
4. S3: request-scoped claim metadata on existing authorization rows, preserving FK audit history. Consumers: retail discount/Udhar, repair adjustment, cancellation/refund, delivery-Udhar, retail return, settlement, component removal. Review UI-only admin gates and inventory separately; do not invent new authority.
5. Local canonical usage/outbox with server-derived source identity and default-deny access. Derive BILL from retail sale, original repair creation, repair payment; INVENTORY from item creation. Capture only new operations at an explicit deployment boundary, not historical rebilling.
6. One bridge contract/adapter with Platform transport disabled until counterpart provisioning. Separate immutable payload from mutable delivery state. No fabricated Platform tables or invoice values.
7. Owner-only versioned customer-safe billing projection, UI route and server authorization. Raw thermal/outbox state remains private.
8. 80 mm print-intent capture through shared pipeline; preview excluded, reprints separate, unavailable measurements nullable rather than zero. Durable device fallback where Shop unreachable; no physical-consumption claim.
9. Owner-only enabled resupply action, durable idempotent request and single active request, Platform-owned lifecycle mirror.
10. Explicit legacy compatibility/cutover, tests, browser fixtures, final handoff.

## Reference precedence / Platform dependency

The user's Phase 4 request controls scope. Reference documents describe intended contracts and older snapshots, not authority to deploy or change the separate Platform product. In particular, do not implement the review's proposed 6-digit PIN, S4/S6/S7/S8/S10/S11, or structural cleanup.

Platform source is not required for independent Shop storage/UI/security implementation. Platform ingestion authentication, source binding, durable acknowledgements, projection publication and legacy reconciliation remain unverified external counterparts. Do not activate outbound billing or pretend the Platform is modernized. Publish the concrete implemented contract and required provisioning before cutover.

## Implemented functionality (original checkpoint 2026-09-18; now integrated/deployed)

- `20260917015216_phase4_pin_request_security.sql`: actor-keyed, service-only transactional verification; 5/8/10 failures impose 1/5/30 minute cooldowns. Correct PIN during cooldown does not bypass it; successful verification after cooldown resets attempts. Wrong/locked responses remain identical. Verification infrastructure failure stays distinct.
- Request-scoped approvals bind actor, purpose, operation, request ID and full request payload. Separate requests cannot reuse an approval; identical retries may reuse their consumed approval after expiry. Private claim helper is not callable by browser roles. Seven Phase 3 consumer definitions retain their financial bodies with narrowly replaced authorization predicates. Concurrent distinct requests have exactly one winner; concurrent identical retries return the same approval (tested against separate database connections).
- `src/security/password.js`: Web Crypto, rejection sampling, Fisher–Yates, existing character-class compatibility.
- `public/ui-text.js` and `src/html.js`: shared HTML encoding and constrained image URL helper. Render-site hardening is integrated and deployed, including nested EMS greeting text and currency text through `moneyHTML`; raw `money()` remains for textContent/dialogs. Browser tests cover customer/component payloads, invoices and print templates; inventory/attribute/currency checks are included in the fixture. Final repo-wide regression/cleanup remains the next task.
- `20260917174024_phase4_platform_bridge.sql`: private source config, immutable events, separate leased outbox, complete versioned customer-safe billing projection, durable paper request and lifecycle mirror. Default delivery is disabled; no client binding is invented.
- Owner-only `/admin/billing-usage` route/menu, guarded Shop RPC read, unavailable/stale presentation, issued outstanding separate from estimated current charges, escaped invoice fields. No Support/Manager/Cashier/Technician access. Staleness considers both local receipt time and Platform publication time, using a documented 24-hour UI threshold.
- Minimal Paper Resupply button follows the projection flag. In-flight calls coalesce; the browser persists an actor-scoped request UUID before sending; timeout/reload uses the same ID. Server serializes requests and enforces one active request. Success is shown only after durable Shop acceptance, not as a claim of Platform fulfillment.
- Atomic usage wrappers preserve the exact four existing financial function bodies as private cores. New public wrappers add one canonical usage event and route marker in the same transaction; browser roles cannot invoke cores directly. `settle_udhar` uses the private repair-payment core, preserving its non-BILL behavior. No financial calculation was changed.
- Shared 80 mm print-intent capture and IndexedDB device retry queue are implemented. Retail, repair parent, child, family summary and return slips are metered. Shift stats and salary slips have no document marker and remain explicitly excluded in this phase.
- The deployed Shop-side `platform-bridge` Edge Function provides service-only outbound delivery and inbound revision application, disabled by absent configuration and disabled database delivery. Deployment does not establish that Platform ingestion, scheduling or billing cutover is enabled; real counterpart exchange remains future Platform work.

## Concrete Shop bridge contract v1 (implemented; Platform counterpart future)

All new tables are in `app_private`, RLS-enabled, and revoked from anonymous and authenticated roles. No browser may read raw usage/outbox or directly edit projection/request state. Source UUID comes from server provisioning; the browser supplies neither source nor client identity.

### Outbound envelope

`event_id`, `source_id`, `source_sequence`, `kind` (`usage`, `thermal`, `resupply`), `operation`, `operation_id`, `body`, `occurred_at`, `schema_version: 1`.

`append_bridge_event` is private to authorized transaction implementations. It serializes sequence allocation using the source row lock, so allocation and commit order align. Same kind/operation/request with identical body returns the event; conflicting body is rejected. UPDATE/DELETE of canonical events is rejected. ACK affects only outbox state. No event reset or historical rebilling occurs.

Service-only `bridge_claim_outbox(limit)` leases due records for two minutes, up to 100 per batch. Disabled delivery returns no events. `bridge_finish_delivery(event_id, lease_id, accepted)` accepts only the current lease, ACKs each event independently, or queues a bounded retry delay (30 seconds per attempt, up to one hour). Expired leases are recoverable. Platform must atomically deduplicate event IDs and reject payload conflicts before returning an explicit per-event durable acknowledgement. Do not use a largest-sequence ACK as evidence of receiving a gap-free prefix.

`usage_mode=legacy` creates usage outbox records as `held_legacy`; other kinds remain pending but cannot leave the Shop while delivery is disabled. Switching mode does not retroactively release held legacy events. Operational wrappers return `usageEventId` and `usageDelivery` (`legacy`, `bridge`, or `none` for a historical replay without a new event). Client legacy logging only runs for new legacy-owned operations. The adapter supports a pre-migration response without the route marker, but skips known idempotent replays. **Shop capture/transport code is deployed; the separate Platform billing cutover is still future work.**

### Transport contract and configuration

`supabase/functions/platform-bridge/index.ts` accepts POST only from the Shop service-role bearer, not employee JWTs. Keep the normal gateway JWT check enabled. It sends to server-configured `PLATFORM_BRIDGE_ENDPOINT` using a per-source `PLATFORM_BRIDGE_SOURCE_SECRET`. Neither value belongs in VITE variables. The URL must use HTTPS; redirects are refused; fetch times out after 15 seconds. The endpoint is a future agreed contract, not a claimed existing Platform API.

POST body: `{ schema_version: 1, source_id, client_binding, events: [...] }`. Platform must authenticate that secret to exactly this source/client and verify the envelope matches that binding; never authorize solely from JSON source IDs.

Reply: `{ schema_version: 1, source_id, acknowledgements: [{ event_id, status: "accepted" | "duplicate" }], billing?: { sync_version, payload }, resupply_updates?: [{ request_id, sync_version, status, platform_updated_at }] }`. Only one matching accepted/duplicate ACK marks a leased event delivered; missing/conflicting ACKs remain retryable. An empty event batch may still fetch projection/lifecycle updates. Unknown extra ACK IDs do not affect local events. Monetary/lifecycle publication is validated again in SQL. Secret-bearing errors and raw remote payloads are not returned to callers. A billing-revision rejection does not undo already durable per-event ACKs.

The Shop implementation does not install Platform scheduling/provisioning. Required Edge Functions are now deployed and client live smoke passed. The earlier local Deno check was blocked by package approval; no separate Deno type-check result or real Platform transport test is invented here. Production Vite build does not validate Edge Functions. Counterpart scheduling/provisioning and end-to-end transport acceptance belong to future Platform modernization.

### Inbound billing revision

Service-only `bridge_apply_billing(source_id, version, payload)` validates source, complete schema and customer-safe allowlists, then replaces the entire revision under a lock. A higher version applies, a lower version returns `stale`, equal/identical returns `unchanged`, and equal/conflicting errors. No usage history is changed.

Required payload fields:

`schema_version: 1`, ISO currency, `platform_updated_at`, boolean `paper_resupply_enabled`, `usage: { BILL, INVENTORY }`, `invoices`, nullable `outstanding_total`, nullable `estimated_current_charges`, nullable string `recent_billing`, nullable `billed_through`, `settled_through`, `estimate_through`, nullable string `pricing_version`.

Each invoice contains exactly `id`, `reference`, `period`, `status`, `total`, `paid`, `outstanding`. Amounts/counts can be null when unavailable; null is never treated as a customer-visible zero. Extra/raw thermal fields are rejected. Platform remains authoritative for invoice membership, partial payments, settlement gaps and estimates; Shop does not derive debt from usage less payments.

Authenticated `get_platform_billing()` checks an active canonical Business Owner and current unsuspended client access. It returns only the customer-safe projection plus sync metadata, or `{ available: false }`.

### Paper request

Authenticated Owner-only `request_paper_resupply(request_id)` validates the enabled flag for new requests. Identical accepted requests can still be retried if the flag later turns off. One active request is enforced transactionally and by a unique index. Different rapid request IDs return the existing active request. Requestor identity is stored locally; outbound resupply body carries request ID/time/schema version, not customer consumption or fulfillment data.

Service-only `bridge_apply_resupply(source_id, request_id, version, status, updated_at)` applies monotonic lifecycle revisions. States: requested, approved, dispatched, fulfilled, rejected, cancelled. Terminal states cannot reopen. Customers cannot mutate lifecycle status.

### Thermal intent

At actual `printThermal` invocation, the shared pipeline waits (bounded) for document load, fonts and images, renders barcodes, flushes layout and measures the 80 mm body. Estimate: `ceil(height_css_px * 25.4 / 96 + 6) * copies`, integer mm. Copies are 1–20; explicit copies are also duplicated in printed content. Metadata versions are `thermal-80-v1`, `css-height-v1`, `feed-6mm-v1`. A missing/failed layout dependency records `measurement_status=unavailable`, `estimated_mm=null`, never zero. Calibration is a software default, not printer-specific physical certification.

Preview builders only attach hidden document metadata; they do not enqueue anything. Each print/reprint has a new request UUID. Before printing, an IndexedDB transaction durably saves an actor-bound intent; Shop delivery is asynchronous. Auth refresh/startup, reconnect and subsequent print retry pending entries. The server checks queue actor against auth.uid(), active role, suspension, module access and document existence, returning no financial details. Technicians can record the child-invoice print workflow already present but cannot use this API for parent/summary/retail financial documents. This adds no Technician financial-summary access or table grants.

The canonical event stores document type and local numeric document ID, copies, mm, width, versions, measurement status and reprint/original-event link. Caller payload fingerprint detects conflicting request reuse; an identical request returns the original event ID. The server detects prior print intent for the same document. The paper-resupply flag is never consulted by metering.

Limits: browser cancellation, hardware failure and printer-dialog extra copies are not knowable. IndexedDB exhaustion/disabled storage or missing local identity logs a metering warning but does not block printing; cleared browser storage before Shop acceptance can lose unsent intents. Invalid-parameter rejections are retained as rejected device entries and skipped so they cannot block later valid prints; a diagnostic warning is logged. Transient failures retry every 30 seconds while online, and on reconnect/auth refresh/next print. The queue uses existing session auth and never a persistent support password or privileged browser key.

## Compatibility and remaining validation

Legacy browser delivery is retained only in `src/platform/legacy.js` using existing BILL rate 5 and INVENTORY rate 1. The unsafe default client ID of 1 is removed; a valid explicitly configured legacy ID is required. Shop operations no longer wait for this best-effort legacy network write. Missing/failed legacy delivery is not silently promoted to new bridge billing: immutable held events remain for explicit reconciliation. This compatibility path is still not durable end-to-end because the current legacy Platform schema has no agreed idempotent ingest protocol.

Current captured triggers are retail checkout, root repair creation, direct repair collection, inventory item creation. Split tenders are one operation. Udhar repair settlement uses the same financial core without emitting a new BILL. Prints, returns, child proposals/invoices and summaries do not create new BILL usage by inference.

Remaining future work and historical evidence limits:

1. Broad financial/security/final-release regression is intentionally outside this closeout; it was not repeated. The existing `admin` PIN UI gates (open ticket editor and employee deactivation shortcut) were not database step-up consumers: account-admin uses canonical role/target checks, and employee status is also editable through the authorized form. No new privilege or PIN requirement is invented for these role-authorized operations. Inventory create/adjust is likewise role-authorized, not a PIN consumer.
2. Required Edge deployment and client live smoke are complete. The earlier transport inspection covered service-only authentication, disabled configuration, HTTPS/no redirects, bounded fetch timeout, lease expiry recovery, explicit per-event ACKs and database-validated revisions. Actual future Platform counterpart acceptance is not implied by that inspection or client smoke approval. The response-size check occurs after reading the body, not as a streaming memory cap; the endpoint must be trusted and bounded.
3. Queue reload, permanent rejection recovery, actor switching and public tracker payloads now pass isolated checks. Extensive multi-tab simulation is deliberately deferred. Native printer-dialog/output remains a manual check; the fixture stubs native printing and cannot prove physical output.
4. Phase 4 client live smoke is now confirmed passed by the project owner. This does not add per-case JWT, hardware or Platform exchange evidence beyond what was actually recorded. The earlier local SQL evidence below remains historical; no database or regression checks were rerun during this status update.

Platform modernization must implement authenticated per-source ingest, immutable dedup/conflict handling, durable per-event acknowledgements, billing revision publication and request lifecycle publication. Provision source/client binding server-side, reconcile legacy ownership, agree the cutover boundary, and verify both sides before enabling delivery. Shop code alone cannot make current Platform accept this contract safely.

Cutover must also retire/refresh cached older Shop bundles and close the Platform legacy direct-write path at an agreed boundary. Older clients do not understand `usageDelivery` and could otherwise send legacy usage beside a bridge-owned event. Do not release `held_legacy` history wholesale. Reconcile missing legacy writes explicitly, with Platform-side ownership/dedup evidence. Keep a source-aware boundary: held legacy sequences form deliberate non-bridge gaps and are not automatically billable through a numeric watermark.

## Validation evidence

- `node --test tests/*.test.mjs`: 20 tests PASS at this checkpoint (security helpers, billing renderer, stable resupply retries, legacy routing, thermal math and existing Phase 3 tests).
- `npm run build`: PASS, 88 modules. `git diff --check`: PASS (only repository CRLF notices).
- Disposable PostgreSQL 18 fixture: fresh database rebuilt successfully from all 23 migrations including both staged Phase 4 migrations. Fixture has a minimal local Auth stub; this is **not** a live Supabase JWT test or remote migration-ledger check.
- `tests/phase4-pin.sql`: PASS for wrong/correct PIN, 1/5/30-minute tiers, persisted lockout, success reset, one-request claim/replay/conflict, expired same-request retry, blocked second discounted sale and idempotent retry.
- `tests/phase4-bridge.sql`: PASS for unavailable projection, disabled transport, held legacy usage, event identity conflict/immutability, paid v18 versus unpaid v17, revision conflict, source mismatch, raw-field rejection, request retry/dedup/flag, delivery failure/retry/ACK, lifecycle versioning, no history deletion, role/inactive/suspended restrictions and API grants. All fixture data rolls back.
- `tests/phase4-usage.sql`: PASS for atomic retail/root/direct-repair/inventory usage, retry dedup, bridge versus legacy ownership, no Udhar-settlement BILL, unchanged payment amount, and operation completion with Platform disabled.
- `tests/phase4-thermal.sql`: PASS for actor binding, print request dedup/conflict, distinct linked reprint, unavailable/null validation, no BILL increment and independence from resupply projection. All fixture data rolls back.
- `tests/phase4-concurrency.mjs`: PASS using separate local database sessions: exactly one winner for two unrelated requests; same approval for concurrent identical requests. Temporary committed auth fixture was removed afterward.
- `tests/phase4-browser.html`: 22/22 PASS, with browser console errors/warnings empty, for Owner-only menu permission, unavailable/stale billing, flag show/hide, hostile text in print builders, inventory/attribute/currency escaping, focus/caret preservation, five thermal document types, reprint/copies/80 mm, preview exclusion and outage recovery.
- `tests/phase4-queue-browser.html`: 6/6 PASS: actual reload retains request ID, permanent rejection retained, later valid intent not blocked, rejected intent not retried, different actor cannot deliver another actor's entry, original actor resumes. One deliberate rejection warning is expected. Test-owned rejected entry was removed; no queue-wide deletion.
- `tests/phase4-tracker-browser.html`: 3/3 PASS using the actual tracker renderer with fixture transport: customer/device/invoice text, component name/tag/custom text and no payload execution. Initial fixture-only flag/completion-signal issues were corrected before the passing run. Total isolated browser checks: 31 PASS, not 31 live end-to-end checks.
- Current deployment/live acceptance: client Phase 4 smoke PASSED, latest migrations applied, required Edge Functions and Cloudflare frontend deployed (project-owner confirmation). Real Platform counterpart transport and final repo-wide regression/cleanup remain future work; physical printer results are not inferred from overall smoke approval.
- Numeric-input follow-up: exact missing-key exception reproduced and fixed; 21 automated tests and production build passed at that patch checkpoint. Retail-checkout follow-up: one focused duplicate-submit/retry test and production build passed. Both fixes are now committed, pushed and deployed. No new tests were run for this documentation update.

## Smoke checklist reference (client smoke completed; Platform items future)

The client deployment and overall Phase 4 live smoke gate are complete. The original checklist below is retained as an operational reference, not a pending client-phase gate or a claim that every unrecorded subcase was separately tested. Keep bridge delivery disabled and usage ownership in legacy mode until the Platform counterpart and cutover are ready.

1. Completed deployment: both migrations applied and required Edge Functions deployed. For future releases, retain ordered migrations, Edge type-checking and migration-history checks; keep server credentials out of VITE/browser configuration. No new ledger/type-check result is claimed in this status update.
2. Owner, Cashier, Technician and Support: login/refresh; only Owner can open Billing & Usage. Verify a denied role cannot call the billing RPC or read private bridge tables. Technician operational access and financial restrictions must remain unchanged.
3. PIN: wrong then correct; five wrong attempts then refresh must stay blocked until cooldown expires. Approve one protected request; same-ID retry must not duplicate it, a separate request must require a new approval. Network failure must not say incorrect PIN.
4. One retail sale, root repair, direct repair payment and inventory creation: each produces one expected canonical usage event; retry creates none. With Platform unavailable, Shop operations still succeed. Do not enable dual legacy/bridge charging.
5. Preview, print a retail receipt and parent/child repair receipt or summary, then reprint/two copies: previews produce no event; prints have distinct intent IDs, 80 mm metadata and positive integer mm or explicit unavailable/null. Confirm native output and offline/reload recovery.
6. With a trusted contract endpoint, check missing/invalid credentials denied, outage/malformed reply remains queued, and accepted/duplicate ACK affects delivery only. Apply paid revision 18 then unpaid 17: 18 must remain. Confirm unavailable/stale/partial-payment display and estimate separate from issued outstanding.
7. Resupply flag ON/OFF: button follows flag while thermal metering continues. Double-click/timeout retry creates one durable active request; Platform lifecycle update is reflected without exposing raw paper usage. Before enabling bridge billing, reconcile the ownership boundary and retire legacy writes/cached old bundles.

Steps 6–7 involving Platform publication cannot complete until its counterpart exists. Scheduling, source binding and per-source secrets are deployment/provisioning work, not silently installed by this change.

## Historical implementation file manifest

Paths below are repository-relative. The original pre-merge checkpoint contained 25 modified files and 24 new files. These are now committed and integrated; the labels below describe their original change classification, not current Git status. Post-deployment fixes additionally touched `src/numeric-input.js`, `src/pos/pos.js`, `tests/numeric-keydown.test.mjs` and `tests/retail-checkout-submit.test.mjs`.

```text
Modified:
docs/PHASE2_AUTH_RLS_FORENSIC.md
public/track.html
src/admin/admin.js
src/admin/pages/reports.js
src/auth.js
src/features/admin/catalog/render.js
src/features/admin/checkout/render.js
src/features/admin/ems/index.js
src/features/admin/inventory/api.js
src/features/admin/inventory/render.js
src/features/admin/repairs/render.js
src/features/ems/index.js
src/features/pos/checkout/api.js
src/features/pos/checkout/render.js
src/features/pos/inventory/render.js
src/features/pos/repairs/api.js
src/features/pos/repairs/render.js
src/features/repairs/additional-work.js
src/html.js
src/main.js
src/pos/pos.js
src/pos/workshop.js
src/print/print.js
src/shared.js
supabase/functions/verify-pin/index.ts

New:
docs/PHASE4_PLATFORM_BRIDGE_BILLING_PAPER.md
public/ui-text.js
scripts/phase4-settlement-core.mjs
scripts/phase4-step-up-consumers.mjs
src/admin/pages/billing-usage.js
src/platform/bridge.js
src/platform/legacy.js
src/platform/thermal.js
src/security/password.js
supabase/functions/platform-bridge/index.ts
supabase/migrations/20260917015216_phase4_pin_request_security.sql
supabase/migrations/20260917174024_phase4_platform_bridge.sql
tests/phase4-billing.test.mjs
tests/phase4-bridge.sql
tests/phase4-browser.html
tests/phase4-concurrency.mjs
tests/phase4-local-bootstrap.sql
tests/phase4-pin.sql
tests/phase4-queue-browser.html
tests/phase4-security.test.mjs
tests/phase4-thermal.sql
tests/phase4-thermal.test.mjs
tests/phase4-tracker-browser.html
tests/phase4-usage.sql
```

This current status update changes documentation only. Historical build/test evidence above was not rerun. Financial semantics, Technician permissions and applied migration files are unchanged. Next: final repo-wide client regression/cleanup; separately, Orbito Platform modernization.
