# RetraSell Shop engineering history

Persistent decision memory: WHY meaningful changes happened, accepted boundaries,
validation and impact. Git remains the exact source history. Follow `AGENTS.md`.
Dates use Asia/Karachi where applicable. Initial phases summarize repository evidence,
not every commit; historical validation was not rerun during this bootstrap.

Evidence labels: **committed** means present in Git; **local validation** means the
cited checkpoint's checks; **hosted verified (owner report)** is explicitly attributed.
Deployment instructions or commits alone do not establish deployed state.
On 2026-10-04, local HEAD and live GitHub feature-branch heads matched
(Platform `a054e28`, Shop `68885d4`). All implementation commits summarized
below are therefore committed and pushed as of that check; their historical
local-only checkpoint descriptions do not describe current Git state.
Older references to `development` describe their era; current integration is
`developmentv2`, with work on `feature/platform-overhaul-v1`.

## 2026-07 to 2026-09-03 — POS foundation and login stabilization

Branch/context: Original import and pre-Phase-2 client baseline.

### Purpose

Establish Shop operations and a reliable login entry.

### Major changes

Vite client with POS, repair/workshop, inventory, employee operations and receipt printing; login/Turnstile and support entry subsequently stabilized.

### Important decisions / invariants

Shop operations belong to the Shop project; later Auth/RLS work supersedes early browser/credential assumptions.

### Validation known from repository evidence

PROJECT_STATUS records Phase 1 completed/merged. Import commits establish source chronology, not a comprehensive test result.

### Deployment / database impact

Original source imports are committed; the later integrated status records frontend hosting through Cloudflare. No initial deployment-by-commit inference.

### Deliberately unchanged / deferred

Detailed July feature chronology and unrecorded test/deployment results are omitted.

### Relevant docs / commits

Git July imports including 8592503; docs/PROJECT_STATUS.md; Phase 1 tag referenced in docs/PHASE2_AUTH_RLS_FORENSIC.md.

## 2026-09-03 to 2026-09-04 — Canonical authentication and RLS

Branch/context: phase2-auth-rls, then historical development integration.

### Purpose

Remove broad anonymous authority and stabilize authenticated identity.

### Major changes

Supabase Auth plus app_users became canonical; public-table RLS, role checks, suspension and credential sealing hardened.

### Important decisions / invariants

Authorization follows authenticated UUID and active canonical role. Orbito Support is a dedicated local identity, not an employee or a branding alias. Phase 4 later replaces reusable PIN windows with request-bound approvals.

### Validation known from repository evidence

Phase 2 forensic record documents real-session role/anonymous/PIN/suspension gates and migration parity; this is historical hosted DEV evidence.

### Deployment / database impact

Forensic record reports additive migrations applied to the then-linked DEV project and integration completed. It is not an instruction to replay them now.

### Deliberately unchanged / deferred

No current hosted reinspection or blanket security certification. Preserve documented residual limits and existing support identity.

### Relevant docs / commits

docs/PHASE2_AUTH_RLS_FORENSIC.md; commits a297e8d, 972005d.

## 2026-09-04 to 2026-09-17 — Transaction ledger and repair-family consistency

Branch/context: Phase 3 and subsequent integrated follow-ups.

### Purpose

Make retail/repair money movements atomic and remove contradictory operational/financial views.

### Major changes

Canonical ledger, tenders/allocations, returns/refunds, unified Udhar and repair-family read models; approved child work, draft/custom components, dialogs and numeric input refined.

### Important decisions / invariants

RPCs own financial mutations; browser ledger writes are not authority. Approved child invoices contribute once; pending/declined proposals do not become active work. Technician financial restrictions remain.

### Validation known from repository evidence

Forensic report records SQL/role/transaction checks; final consistency report records isolated Node/browser fixtures and builds. Stubbed browser persistence and physical printing are explicitly limited.

### Deployment / database impact

Reports record additive migrations and subsequent merged/deployed client baseline; applied files are immutable.

### Deliberately unchanged / deferred

Preserve legacy unmappable-history limits; no inference that every hardware or multi-tab case was tested.

### Relevant docs / commits

docs/PHASE3_TRANSACTION_LEDGER_FORENSIC.md; docs/PHASE3_FINAL_CONSISTENCY_STABILIZATION.md; commits 435140a, 22e7890, f661e4c, 2c8641f.

## 2026-09-17 to 2026-09-28 — Bridge, billing semantics and module hardening

Branch/context: Phase 4 client completion, then billing/entitlement follow-ups.

### Purpose

Decouple operational success from Platform availability while retaining commercial semantics.

### Major changes

Immutable usage/outbox, versioned billing/resupply projections, durable thermal print intent and request-bound PIN security. BILL later normalized to invoice creation. Module navigation/handlers and stale-session guards hardened; dedicated bridge call auth added.

### Important decisions / invariants

BILL is invoice creation, not payment/printing; INVENTORY remains separate. THERMAL is metering, not a charge; resupply cannot disable printing. Source and call credentials differ. technician_module_enabled is the only new Workshop authority.

### Validation known from repository evidence

Phase 4 documents local SQL, browser/queue checks and owner-confirmed client live smoke. Module audit records targeted checks. Early proposed browser logging/default-client findings are superseded.

### Deployment / database impact

PROJECT_STATUS records client migrations/functions/frontend deployed and smoke passed. This historical client gate did not prove the later Platform counterpart/cutover.

### Deliberately unchanged / deferred

No invented missing usage IDs, wholesale held_legacy release, dual charging or permission expansion. Physical print certification remains separate.

### Relevant docs / commits

docs/PHASE4_PLATFORM_BRIDGE_BILLING_PAPER.md; docs/MODULE_ENTITLEMENT_AUDIT.md; MODULE_ENTITLEMENTS.md; commits 3d65042, 7ff65a3, 7f4c31b, fed5228.

## 2026-10-01 to 2026-10-02 — Manual-first Onboarding V2 and BYO boundaries

Branch/context: feature/onboarding-v2, integrated into developmentv2.

### Purpose

Safely distinguish fresh Shops from existing configured businesses and activate one reserved owner.

### Major changes

Protected V2 reservation, confirmed exact-email owner claim, six-step resumable setup, backend preflight and local BYO installation. Optional invitation converges on the same owner activation.

### Important decisions / invariants

No Platform owner password; employee_id stays NULL. Existing initialized Shops are preserved. V2 browser needs only Shop URL/public anon/Turnstile site key; optional legacy values do not establish ownership. Pairing contains two bridge credentials/endpoint, no customer service key/PAT/DB password.

### Validation known from repository evidence

Onboarding and BYO docs describe local handler/SQL/build checks and remaining hosted Auth/SMTP/redirect/Vault/Management limits; no new run here.

### Deployment / database impact

Commits 353b35f/c4b4776 are integrated by 1794ac2. This alone is not hosted release proof. Credential cleanup is coordinated metadata-only investigation, never a reset.

### Deliberately unchanged / deferred

Retired privileged resolver/map is not a fallback. Optional legacy usage remains explicit; no unsafe client-ID 1 default. Preserve Client 1.

### Relevant docs / commits

NEW_CLIENT_ONBOARDING_V2.md; BYO_SUPABASE_ONBOARDING.md; docs/BYO_SETUP.md; LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md; MODULE_ENTITLEMENTS.md.

## 2026-10-02 to 2026-10-03 — Branding, legal and publication boundary

Branch/context: Legal work integrated into developmentv2 before overhaul.

### Purpose

Separate public RetraSell branding and customer documentation from immutable authorization identifiers.

### Major changes

Central branding, legal/privacy/help framework, owner agreement status and version metadata with internal finalization guidance.

### Important decisions / invariants

Legal published=false until professional/provider review. Onboarding comes first; unpublished policies do not request acceptance. Unknown legal status fails closed. Orbito Support and technical IDs are unchanged.

### Validation known from repository evidence

Legal guide records local checks and unresolved provider/legal evidence. No professional approval or publication is inferred.

### Deployment / database impact

Additive legal metadata migration; commits b0ba811/f966f72 integrated by d626dcf. No hosted legal query performed here.

### Deliberately unchanged / deferred

Final legal publication, provider verification and stronger customer support consent remain pending. No copied customer/business private details in this history.

### Relevant docs / commits

docs/internal/LEGAL_FINALIZATION_GUIDE.md; docs/internal/BRANDING_AND_RENAME_GUIDE.md; docs/legal/LEGAL_IMPLEMENTATION_NOTES.md.

## 2026-10-03 — Overhaul configuration journal and approved release

Branch/context: feature/platform-overhaul-v1 from developmentv2.

### Purpose

Make Platform configuration retries safe and supply a deterministic approved managed-install artifact.

### Major changes

Forward config_request_journal migration records atomic request UUID/payload/response. Exact replay returns prior response without overwriting newer settings. Runtime diagnostics add known booleans; source-only release builder packages reviewed SQL/functions.

### Important decisions / invariants

Legacy no-ID config remains compatible; Platform always supplies ID. Protected journal/bridge stay service-only. Exact separate-project/migration/binding checks precede managed writes. No secrets read by the release builder.

### Validation known from repository evidence

docs/PLATFORM_OVERHAUL_V1.md cites focused local checks and Platform-side full-chain in-process SQL with Auth/Crypto/Vault substitutes; both checkpoint builds passed.

### Deployment / database impact

Committed in 62f3d47; function artifact correction in 8c96515. One additive Shop journal migration. Hosted execution is not proved by these local checks.

### Deliberately unchanged / deferred

Owner flow, billing/usage/financial ledgers, support identity, suspension and unpublished legal unchanged. Project/Cloudflare automation deferred.

### Relevant docs / commits

docs/PLATFORM_OVERHAUL_V1.md; scripts/build-platform-release.mjs; Platform PLATFORM_OVERHAUL_V1.md.

## 2026-10-04 — One-time Platform support handoff

Branch/context: feature/platform-overhaul-v1; 1c3d3a7 and 68885d4.

### Purpose

Replace Shop-side Platform password forwarding, which failed Platform CAPTCHA, with authenticated control-plane support entry.

### Major changes

Shop clears support URL fragment synchronously, exchanges grant through its login Edge boundary using protected pairing, verifies assertion and establishes audited local Orbito Support session. Old support password mode is denied.

### Important decisions / invariants

Platform issues 256-bit/90-second grants; only hash persisted. Single-use, source/client/project/binding-bound; support can enter a suspended managed Shop while Owner is denied. Archived/destroyed/decommissioned and BYO targets are ineligible. Legacy support-auth settings are compatibility only.

### Validation known from repository evidence

Counterpart docs/SUPPORT_SESSION_HANDOFF.md records actual-handler regression, local overlapping PostgreSQL consumption checks, both builds and diff checks. These historical local results do not prove hosted Vault/Auth.

### Deployment / database impact

Shop login/helper/frontend changes committed; no Shop migration for handoff. Platform has a new grant migration/function. Current-client login update and future-client approved release are separate deployment concerns.

### Deliberately unchanged / deferred

CAPTCHA unchanged. Stronger per-ticket consent, immediate suspension of already-open sessions and BYO handoff remain outside this implementation.

### Relevant docs / commits

src/support-handoff.js; supabase/functions/login/index.ts; supabase/functions/_shared/support-handoff.ts; Platform docs/SUPPORT_SESSION_HANDOFF.md.

## 2026-10-04 — Current checkpoint and durable memory bootstrap

Branch/context: `feature/platform-overhaul-v1`, HEAD `68885d4`; local
`developmentv2` verified as ancestor. Both repositories were clean at task start.
Current integration target is `developmentv2`; `main` remains legacy.

### Purpose / changed

Created root `AGENTS.md` and this phase history to reduce repeated discovery and
preserve decisions. Reconciled stale Git-status documentation using dated
superseding notes; preserved original validation/deployment evidence.
Updated the historical project-status banner and BYO support compatibility wording.
Documentation only, not a new implementation or deployment.

### Accepted current state

Platform is the control plane; each managed customer uses an isolated Shop
Supabase project, always different from Platform (same account/org is allowed).
Shop owns operations/Auth; Platform retains registry, provisioning, lifecycle,
billing projections and historical/audit state. Cloudflare Pages hosts frontends.
Browser configuration is public-only; applied migrations remain immutable.

Lifecycle is Provisioning → Active ↔ Suspended → Archived; infrastructure is
independently unknown/present/unreachable/destroyed/decommissioned.
Archive is offline local retirement retaining history, not remote destruction
or a remote access-revocation guarantee. Server UUID/payload and leases govern
recovery; browser state cannot release uncertain outcomes.

Manual owner Auth creation/activation remains default. Canonical support is
one-time Platform-master handoff to local Orbito Support: 256-bit randomness,
90-second issuance lifetime, hash-only persistence, single-use bound exchange.
Suspended support access does not authorize Owner or reactivate the client.
Archived/destroyed/decommissioned and BYO targets deny handoff.
Current legal policies remain unpublished (`published=false`) pending review.

### Hosted smoke status — owner-reported, not independently rechecked

The task's supplied 2026-10-04 checkpoint reports verified: managed provisioning,
hosted Shop/custom domain/Turnstile, manual owner activation and completed setup,
suspend/reactivate, Owner denial while suspended, secure support handoff,
consumed-grant replay denial, unused grant expiry after 90 seconds, support session
refresh persistence and continued suspension during support access.

Repository documents establish the implementation and historical local checks;
their earlier "no hosted operations" statements describe those tasks. The newer
hosted results above are attributed to the project owner's supplied checkpoint,
not to a hosted inspection performed for this documentation task.

**IN PROGRESS / PENDING:** same-request retry, race/concurrency, unknown-outcome
recovery/reconciliation, cross-session recovery, history baseline, physical Shop
deletion, destroyed/unreachable recording, no resurrection, offline Archive,
historical retention, secret non-exposure and terminal integrity.
Local concurrency checks do not close the hosted concurrency gate.
The overhaul is NOT wholly accepted; no merge until that hosted gate completes.

### Validation / deployment and DB impact

Reviewed selected authoritative docs, recent commits and key identity/support
implementation; verified branches/status/base ancestry and live GitHub branch heads.
Local HEAD, origin tracking and live remote match: Platform `a054e28`, Shop `68885d4`.
Existing implementation through those heads is committed and pushed; exact push
times are not inferred from commit dates. Historical local-only wording describes
earlier tasks and is superseded by dated notes, not silently erased.
Checked generated Markdown,
content, secret patterns and whitespace, then final diffs/status.
No suites, builds or database tests were run for this documentation task.
No runtime, dependencies, migrations, Edge Functions, hosted data/secrets,
Cloudflare, Client 1 or legal worktree were changed. No commit/push/merge/deploy.

### Deliberately unchanged / deferred

Per-ticket customer support consent/legal disclosure, instant suspension of
already-open sessions, Platform owner Auth creation, automatic project/Cloudflare
environment operations, remote destructive decommission and final legal
publication remain deferred. No private customer identities, secret values,
raw logs, unsupported deployment dates or speculative completed roadmap are copied.

### Sources / Git

Sources are listed by repository-relative path in phase entries above. Current
hosted smoke attribution comes from the user-supplied durable-memory task checkpoint
dated 2026-10-04; no independent per-case hosted evidence artifact was supplied.
This documentation remains uncommitted; suggested message:
`docs: add durable engineering memory and agent rules`.
