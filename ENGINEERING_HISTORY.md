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


## 2026-10-18 — Verified customer Support v1 source implementation

Branch: feature/verified-customer-support-shop; base development
f91f02819a9f2909062e36140f1775a870009115. Coordinated Platform branch:
feature/verified-customer-support-platform, base 23a157a5c2aa581eec6e0f02b97318c784296e79.

### Purpose and changed

Add Help & Support to the existing Owner/Manager admin navigation: create, list,
detail/status/customer resolution, safe same-UUID retry, private session cleanup and
escaped rendering. The Shop migration adds live-session actor context with active
canonical app/employee/email/role/lifecycle/pairing checks; support-tickets verifies
Auth, derives identity locally and calls the exact central endpoint with transient
access JWT plus its independent credential. Extend optional BYO allowlists and a
separate release builder mode; support-setup provides managed and split-operator
BYO enrollment without collecting customer Management authority.

The coordinated Platform extends its existing Support administration. New forward migration adds private credentials,
immutable requester provenance/events, atomic budgets, opaque ticket IDs, audited
revision-based resolution and the legacy integer resolver wrapper. Dedicated
platform-support-tickets revalidates a real Shop Auth token and actor-context RPC
against the registered project on every call. platform-support-enrollment requires
canonical live Master authority; managed preparation uses protected Vault recovery,
BYO accepts a locally generated credential hash, installation dispatch/acknowledgment
is audited and only an exact capability proof enables a key. Rotation/revocation
and permanent re-pair invalidation are separate from bridge/handoff credentials.
The existing page gains verified/legacy labels, category/history, customer-visible
resolution and pagination, with session/view stale-response fencing. Resolution
still refreshes existing dashboard data. No global redesign or existing Edge
Function modification was needed.

### Decisions and compatibility

Anonymous closure is prepared under supabase/staged-migrations, outside automatic
discovery, because all deployed historical senders are not inventoried. It is not
claimed deployed or closed. The accepted _shared/shop-release.json remains
unchanged; a separately generated, reproducible seven-function Support candidate
is staged under supabase/releases and requires explicit future promotion. Completed
Shop upgrades must not replay onboarding. Support capability is optional for
existing POS/bridge readiness. The privileged Master handoff, financial bridge,
canonical staff identity, existing migrations and unrelated worktrees are preserved.

### Validation

Final unit/handler/simulation set: 309/310 Platform and 99/100 Shop, retaining the
two independently recorded baseline failures (config-recovery fixture and accepted
release/runtime-preflight byte drift). New actual handler groups 8/8; Shop Support
client/renderer/package/installer groups 7/7; actual native PG17/GoTrue-schema/Vault
Support matrix across three databases 7/7, including concurrent duplicates, ACLs,
quotas, atomic audit rollback, scope/tenant/role/session boundaries, rotation,
managed recovery and staged closure. Existing PR4 security native groups 8/8.
Actual Support browser integrations for both products pass at 320/768/1440px;
existing login/Add Client six light/dark browser groups pass. Both builds pass;
built JS scan finds no privileged JWT/Support secret variable. All browser network
transports are synthetic/loopback, not hosted provider proof.

The broad native team runner timed out; an old handoff native fixture fails its
Master-approved-destination prerequisite identically on an archive of the unchanged
development base. Neither is relabeled passed. Full evidence, baseline distinctions
and pending provider/Deno/device gates are in docs/CUSTOMER_SUPPORT_VALIDATION.md.

### Deployment / Git

No hosted Supabase schema, secrets, functions, Auth, Shop pairing/provisioning,
customer data or Cloudflare resources changed. Owner CLI-2.120.0 runbook is in
docs/CUSTOMER_SUPPORT_DEPLOYMENT.md. Git delivery is authorized as a feature-only
CF-Pages-Skip commit/push and coordinated Draft PRs targeting development, unmerged.
Final SHAs and PR links are recorded by the delivery response/PR descriptions.
Real hosted cross-project/different-account BYO acceptance, release promotion and
legacy-sender compatibility remain before-use gates; no production-ready claim.


## 2026-10-18 — Standalone customer BYO installation portability

Final review found support-setup's physical-path check assumed the Platform sibling
checkout exists. Customer installations can have only the Shop repository. Use the
real path when an excluded repository exists, otherwise retain its absolute lexical
exclusion; keep private-file/symlink protections. A regression copies the actual
installer into an isolated customer-only checkout and executes private generation
without a sibling Platform. BYO deployment messages now report the optional seventh
function accurately. Final Shop suite: 100/101, retaining only the same preexisting
accepted artifact/runtime-preflight byte gate; new Support groups 8/8. No frontend,
SQL, release candidate bytes or hosted systems changed in this follow-up. Existing
Draft Shop PR #1 and Platform PR #5 remain unmerged against development. Earlier
feature pushes were independently confirmed skipped by Cloudflare for commit_message;
this follow-up also uses CF-Pages-Skip. Updated the shared validation ledger.


## 2026-10-19 — Verified customer Support stabilization and independent regression review

Branch: feature/verified-customer-support-shop

### Purpose and changes

Correct confirmed Support compatibility/state defects and independently close the
previous local validation gaps, updating the existing Draft PRs only. Both shared
protocols remove the unsupported 3660-second remaining JWT ceiling, add exact
issuer/authenticated-audience/UUID checks, and retain real Auth plus live canonical
actor verification. Shop's final identity/generation check now follows asynchronous
error parsing, preventing a late old HTTP 400 from erasing another account's retry.
The new unshipped Platform read RPC uses client-first shared locks; all writer
ordering, post-wait authorization and actor freshness checks remain.

Corrected stale recovery/handoff fixtures through verified read-back and canonical
Master protected-destination approval, preserving historical migration-cutoff
contracts. Production recovery/handoff/POS/billing/provisioning sources and all old
migrations remain unchanged. Bounded native subgroup runners stream progress,
retain both output streams and avoid hidden test grandchildren. The accepted
release remains frozen; only the separate Support candidate was regenerated.

### Validation and decisions

Platform broad suite 312/312; Shop 101/102, retaining the preexisting accepted
artifact raw-byte equality gate. Exact drift is newline-only across three unchanged
Git blobs; promotion/fingerprint changes need a separate owner decision. New
handlers 10/10; Shop Support groups 9/9; native Support 10/10, including independent
read/create/revoke/re-pair/rotation/config/pricing/provisioning/resolution backends,
closure retention and real two-hour GoTrue/Auth/PostgREST verification. Existing
native groups total 32 passes across bounded historical/current runs; focused
privileged handoff passes. Both builds and actual Support browser integrations
pass at 320/768/1440px with synthetic loopback SDK transport. A local restart
interrupted some runs; only completed checks and targeted recoveries count.

### Deployment and remaining gates

No hosted Supabase/Cloudflare mutation or deployment. Same feature branches and
Draft PRs target development, unmerged, with CF-Pages-Skip delivery. Both contracts,
owner CLI-2.120.0 runbooks and validation ledgers describe runtime privilege trust,
precise snapshot/network freshness, protected hash material, optional capability,
manual baseline/pairing gates and staged anonymous closure. Local report:
Support ticket/implementation-evidence/STABILIZATION_REPORT.md. Conditional GO for
owner-controlled additive development deployment after exact dry-run/prerequisites;
customer use and production remain blocked on real hosted managed/BYO/Auth/gateway,
deployed-sender inventory and explicit release/closure/acceptance decisions.

## 2026-10-19 — Refresh, semantic login and staged Support integration

Integrated the owner's uncommitted /admin/customer-support route correction.
The actual entry/router preserves authorized URL/query only after live identity,
configuration, suspension, onboarding, legal and clock-in gates. Query Back/Forward
and async navigation/authorization generations prevent stale imports/loads from
replacing a newer view. Safe scoped history retains whitelisted tabs, receipt
filters and bounded scroll; transaction drafts/actions are excluded. Login now
uses one semantic form submission, independent in-flight and Turnstile verified/
expiry/error guards; auxiliary actions and existing visuals/PWA remain intact.

Attempted uncertain Support requests can recover the same UUID/canonical payload
from tab storage only after live Auth and actor/source/binding proof. Recovery is
scoped, expires after six hours and clears on account/role/binding/authorization
changes, logout or receipt; no JWT/server credential is persisted. Unsent drafts
remain memory-only. Added a forward-only service readiness RPC requiring a
confirmed active owner and complete onboarding; old deployed actor SQL is fixed.
A concrete public-schema SDK type annotation resolves Deno inference errors in
login without runtime auth changes.

Added customer-authorized full/additive BYO migration/function installation,
private dedicated Support secret recovery and hash-only operator handoff. Added
explicit public-input builds and compiled target/digest verification. Accepted
32/6 and prior 33/7 candidates stay immutable. New inactive Support-v2 is 34/7,
SHA-256 144d918859db1007cccfbed724d1988a043ca1e5fef42ce694dee6df1a603414.

Local validation: Shop 105/106 (retained frozen-release byte gate), Platform
320/320, 13 native Support groups plus canonical bootstrap, actual main/router
login and Support browser regressions, Platform light/dark/mobile visuals, Deno
checks and actual provider ESZIP bundles. Details: docs/SUPPORT_AUTOMATION.md and
Support ticket/implementation-evidence/SUPPORT_AUTOMATION_FINAL_HANDOFF.md.
Owner-reported manual Client 2 success is historical hosted evidence. No hosted
mutation/deploy/owner reset, promotion, anonymous closure or merge was performed.
Existing feature branches/Draft PRs target development with CF skip. Fresh
managed automatic enrollment and genuinely separate-account BYO acceptance remain
owner-operated after explicit promotion/deployment approval.

## 2026-10-20 — Customer-local guided BYO and durable Paper updates

Continued `feature/verified-customer-support-shop` at 5becfae, verified against Draft
PR1/head. Preserved the owner's sole existing uncommitted CLI correction exactly:
linked query, explicit project and output-format json. No commit/push/deploy,
hosted query/write, Auth deletion, credential rotation or production cutover occurred.

Added a guided Node entry reusing the verified installer: native CLI/cache discovery,
capability/account/pairing/package checks, named-target authorization, private local
journal/status/lock, atomic exact-source migration recovery, provider write fences,
observed owner/onboarding waits, automatic public Support target, stable local secret
and hash handoff. Owner activation and six-step onboarding remain explicit; Completed
is an identified owner-reported hosted ticket receipt, not fabricated machine proof.

Frozen 34-entry native runs using both actual wrappers initialize correctly.
An inserted pre-existing Auth identity reproduces the conservative timestamp path,
but Client3's original trigger is not established without its pre-correction state.
Added a forward service-only diagnostic and fail-closed pre-secret check; no timestamp
repair/configuration reset. New separately reviewable Paper SQL/sender/history/UI
carry customer messages, dates and expectations with source/revision/terminal guards
and escaped Owner display. Existing additive Support setup preserves base runtime;
Paper sender rollout for existing Shops requires separate approval.

The owner's active Support-v2 and earlier frozen artifacts remain intact. A new
inactive, unregistered 36/7 Support-v3 candidate matches source. Future managed
promotion needs separate compatibility review. Six new native groups and all 13
existing native Support groups, six guided cases, 52 focused Platform cases, affected
Deno, explicit builds and actual browser flows pass. Broad Shop 110/111 retains the
frozen-source equality gate; new candidate parity passes. Platform's initial digest
stub failure is corrected with real SHA-256 and its SQL subgroup passes 3/3.
Guides and seven evidence reports record remaining Client4/hosted/Paper/production
approval gates and exact commands under stabilization-2026-10-20-byo-paper.

## 2026-10-20 — Approved GitHub review checkpoint

The owner explicitly authorized one stabilization commit and push to this existing
feature branch and its existing Draft PR. This is source-control backup/review only.
The staged scope is the completed implementation, forward migrations, scripts,
tests and repository documentation; private settings, pairing files, local journals,
temporary artifacts and the external evidence directory remain excluded.

No tests, builds, simulations or migrations were rerun for this checkpoint. Earlier
validation and its recorded limitations remain the evidence of execution. Commit
messages retain the Cloudflare Pages skip marker. PRs remain Draft/open; no merge,
hosted Supabase change, Cloudflare deployment, production change or Support-v3
promotion is authorized. The preceding entry describes the local stabilization
state before this later source-control authorization.

## 2026-10-21 — BYO key separation and recoverable Paper status

Branch: feature/verified-customer-support-shop.

Added customer-local static Turnstile checks and an explicit public JSON input
before new wizard base installations. Wrong project/anon role, public/private
equality, placeholders/testing/unrelated credentials fail with fixed value-free
errors. Native CLI login is discoverable without a fixed npm-cache path. Backend
preflight is explicitly separate from real browser CAPTCHA acceptance. Existing
release identities, private files, journal reconciliation and Support UUIDs remain
intact; retain pairing through enrollment/recovery rather than deleting it early.

Paper UI disables new submissions while Requested/Approved/Dispatched, reloads
after a receipt, offers explicit refresh and shows local pending versus evidenced
Platform updates. Failed refresh retains same-account observations and acknowledged
submission blocking; account changes clear cached views and delayed responses are
discarded. Only an exact authenticated status-read acknowledgement clears a lost
response's saved request ID. Unknown IDs and other actors' retries remain intact.
No polling, accounting changes, migrations or packaged Shop function edits.

Validation: Shop broad regression initially 116/117; the inherited test comparing
an old frozen package to newer source was corrected to assert frozen byte/internal
integrity and exact separate v3 source parity, then its five-group subset passed.
Platform 324/324, six native PG17/Auth groups, copied on-screen wizard walkthrough,
actual paper browser lifecycle/offline/reload/account-change checks and both clean
public builds/digest/stale-target refusal passed. Evidence: the preserved Oct 20
folder's new hardening-2026-10-21 subfolder. Client #4 success is owner-reported;
next fresh hosted acceptance is pending. No commit/push/deploy, hosted change,
release promotion or stable customer credential/journal mutation occurred.

## 2026-10-21 — Customer identity and installer reliability checkpoint

Branch: feature/verified-customer-support-shop; starting HEAD 3ddf5d5f9b3e.

The earlier numeric Client1 exclusions conflated a former protected installation
with a legitimate first client after Platform reset. Shared validation now accepts
positive database IDs including 1, retains the exact historical protected project,
and independently compares intended client/project against pairing and journal.
The Support target validator had a third numeric exclusion and is corrected too.
No customer's private files were inspected or modified and no live install ran.

The coordinator emits fixed, value-free phase/category/check/write-state recovery
diagnostics. Original release, pairing, paths, mode, locks, migration provenance,
request IDs and uncertain-write fences remain authoritative. Provider completion
requires explicit review, public receipt ID and named confirmation. Installer
diagnostics conservatively retain possible writes for interrupted/malformed journals
even when failure occurs before release validation. Core acceptance
is separately owner-reported without requiring optional Support, leaving the same
journal resumable. Help and authoritative BYO guidance cover private runtime
template, Windows ACLs, tooling, exact target/mode, recovery, verified frontend,
manual owner and optional Support/ticket/Paper acceptance.

Compatible Vite8.2.4/source-map-js1.2.2 patches remove the two current Shop findings;
final public audit reports zero vulnerabilities. Complete Shop regression passes
122/122, replacing the historical 116/117 plus corrected subset limitation. Final
commit-specific cross-repository native/browser/build evidence is external under
coordinated-wizards-2026-10-21. Shop source appearance, migrations/functions,
36/7 candidate fingerprint and managed release pointer remain unchanged. The legacy
bridge SQL test now checks unavailable state and empty requests while accepting the
additive Paper response field; its financial authorization assertions remain intact.

Commit/push to existing Draft PR1 against development is authorized; all new
commits use [CF-Pages-Skip] prefix. Actual Cloudflare skip confirmation remains
pending provider access. No merge, hosted mutation, deployment or promotion.

## 2026-10-22 — Coordinated final stabilization and owner support consent
Branch: feature/verified-customer-support-shop

### Purpose / changed
Complete S-01/02/03 and the Shop side of shared backend parity before independent
fresh Managed/BYO acceptance. Removed the hard-coded Turnstile fallback, aligned
build validators, completed fixed/redacted diagnostics and captured immutable
Paper navigation ownership. Added a dedicated additive v1/v2 backend upgrader with
separate customer-CLI/Managed Master authorization, exact provenance, immutable
journals, all-function deployment and uncertain-provider fencing. Existing-mode
setup stops instead of claiming SQL-only upgrade completion.

### Security / decisions
A forward migration introduces explicit owner approval for a verified Support case,
purpose/scope/actor/time, a 30-minute single-session authorization, append-only
history and revocation. Ticket creation does not authorize access. The login binds
consent before returning tokens; Data API pre-request enforcement, restrictive RLS
and privileged Edge checks reject revoked/expired/unbound Support sessions.
Existing custom hooks fail closed for manual composition. BYO managed handoff
remains prohibited; canonical Master and one-time capability boundaries remain.

### Validation / impact
Four focused Shop tests passed (Turnstile, diagnostics, stale Paper response and
upgrade uncertainty/provenance). Targeted Docker PostgreSQL checks passed for the
forward chain, existing-v2 owner/reservation/data/PIN/Vault preservation, owner vs
Manager authority, case attestation, idempotent approval, one-session binding,
replay denial, expiry and revocation. Changed Edge entrypoints type-check with Deno;
explicit synthetic-public production build passed. These are local checks, not
hosted Auth/provider/customer acceptance. No hosted changes or production deployment.

### Release / deferred
All packaged backend changes are complete in this implementation commit. Build a
NEW immutable shared release from this committed source afterward; do not reuse or
rewrite v3. Final selectors/fingerprint are recorded in the following metadata
commit and coordinated Platform release documentation. Future packaged changes
require another immutable version. Preserve older packages and original job pins.
Owner-authorized migrations/functions/frontend deployment, effective hosted hook
verification, two fresh customer acceptances and final security review remain.
Legacy anonymous Platform intake stays a compatibility-gated release blocker.

## 2026-10-22 — Final immutable shared backend release metadata
Branch: feature/verified-customer-support-shop

After backend implementation commit 089fd7870f9f0665e35674bf7b8db9fd190f1509,
built NEW support-v4: 37 migrations/7 functions, SHA-256
`f5295937f06e45177190bedebf19a54c86fd067d03785365a393e3de269e062f`. Both provisioning selectors now reference
that exact package; previous packages/fingerprints and original pins remain.
Manifest approved-shared records the completed backend commit. Final parity
verification compares every embedded migration/source hash against committed
backend Git blobs; existing v2 additive preservation and trusted consent checks
passed locally. See coordinated Platform docs/Release-parity.md and
docs/Release-parity-acceptance.md. No packaged backend changed after this build.
No deployment/merge/customer acceptance occurred. Effective hosted hook checks,
fresh Managed/BYO acceptance, historical sender compatibility before anonymous
closure, and final security review remain gates.


## 2026-10-23 — Release requirements, restricted diagnostics and durable Support
Branch: feature/verified-customer-support-shop

### Changed / purpose
Appended the complete mandatory Managed/BYO parity rule to AGENTS.md without
rewriting existing instructions. Added a canonical backend requirement inventory
and executable installation planner consumed by customer CLI and Platform paths.
The small release-check wrapper/CI gate compares final committed source, exact
migration/function/dependency/gateway hashes, coverage and selectors; deliberate
negative fixtures prove drift/omission rejection. No pull, branch restructuring,
customer upgrade or automatic repinning occurred.

Forward SQL introduces a private RLS Support submission journal and append delivery
events. Valid live actors persist sealed fields/original UUID before network work.
Leases, backoff, review and server-only receipt acknowledgment preserve uncertainty;
stale workers cannot acknowledge another lease. The receiver's existing atomic
source/request dedupe and actor/payload conflict checks remain. Support UI restores
own pending work after tab loss without relying on storage; accepted-at-Shop and
received-by-Platform states are explicit. Live authorization is required on each
retry, including a new session of the original user. No JWT/secret is journaled,
no service worker impersonates a revoked actor and ticket creation still grants no
privileged consent. Existing consent/history/revision/privacy/abuse rules remain.

A restricted paired Bridge challenge exposes nonsecret structural/runtime capability
evidence; an owner-only RPC and customer-authorized read-only CLI provide supported
BYO diagnostics. Reports separate historical migration identity, full-source unknowns,
optional successor policy and runtime health. Provider function presence/version is
not accepted as approved-source proof. Detection never writes customer state or
executes upgrades. Existing usage outbox, billing revisions and config journals are
reused. Platform adds financial receipt read-back before original-ID retries.

### Validation / impact
Seven focused cross-repository source tests pass, including actual Support sender,
browser pending recovery without storage, financial reconciliation, independent
health/compliance and deliberate gate failures. Owned PG17 forward chains verify
Support persistence, actor/conflict/ACL/lease recovery, receiver dedupe and actual
invoice/payment idempotency; fixtures enforce existing owner/cutover guards. Changed
Shop Edge entrypoints typecheck. Final build/gate and fingerprint evidence follow
once this completed backend is committed. No broad acceptance campaign was repeated.

All packaged backend changes are complete in this implementation commit. Build NEW
immutable support-v5 from this committed source afterward; never rewrite v4 or older
packages. Both final selectors/manifests and exact SHA are recorded in the following
metadata checkpoint. New SQL must precede changed Shop functions/UI. No hosted SQL,
Edge deployment, reset, credential rotation, customer suspension or production
promotion. Live BYO administration remains unavailable and hosted acceptance remains
separate. See docs/BACKEND_DIAGNOSTICS_AND_DELIVERY.md and new external milestone evidence.


## 2026-10-23 — Final immutable support-v5 metadata
Branch: feature/verified-customer-support-shop

Completed backend source f9df8eb0ac4055378a77fdfc11503cc9007882ca was packaged only after the Support/diagnostic
implementation and focused SQL/source checks. NEW immutable support-v5 contains 38
migrations / 7 functions; canonical SHA-256 7953927660473aeaafcc62b3b8d45e382f5189d1536f7e0100b890d938ff5fdd.
Both source selectors/manifests/catalogs reference that exact package. Catalogs
retain all older hashes and describe optional upgrades, supported releases and
evidence limitations. No existing job pin or customer backend is changed. Packaged
source did not change after this build; the following commit is release metadata
only. The canonical final committed-source gate and actual CI/provider outcomes
are recorded in the external milestone report. Hosted rollout/acceptance remains
separate; production promotion and PR merges remain unauthorized.


## 2026-10-23 — Legacy receipt compatibility before final release
Branch: feature/verified-customer-support-shop

Final old/new client review found that an older Shop page treats any2xx as a reason
to clear its original request. The sender now returns503 for uncertain delivery to
legacy clients, preserving their UUID, and returns an explicit persisted/pending202
only to a client opting in through the already CORS-allowed x-client-info header.
The new client works with the older handler, which ignores that header. Verified
Platform receipts keep their existing accepted shape. No authentication, ticket
wire contract, queue authority or consent is weakened.

The locally fingerprinted support-v5 candidate remains immutable at
7953927660473aeaafcc62b3b8d45e382f5189d1536f7e0100b890d938ff5fdd;
it was not deployed or installed and is superseded for fresh selection. The corrected
backend requires NEW support-v6, generated only after this source correction is
committed. Old-v4 remains supported; no existing Shop was upgraded or repinned.
The focused compatibility fixture covers both old and opted-in pending responses.


## 2026-10-23 — Final corrected support-v6 release metadata
Branch: feature/verified-customer-support-shop

Final backend source 95448d75b7c78fbe5e7cf0e9a02f87e7d919650d includes the legacy/modern receipt compatibility
correction. Built NEW support-v6 only afterward: 38 migrations / 7 functions,
canonical SHA-256 64fcec36fa7a5e2565db2a6d3aa6ddbd8e6c1170eefd4a07a57ae6ba0c066a31. Both fresh source selectors/manifests now reference
this exact package; v5 remains unchanged as an uninstalled superseded candidate,
and v4/older approved artifacts and original pins remain unchanged. The final
committed-source parity gate is the approval check; no packaged byte changes
after this build. Hosted migration/function rollout and joint acceptance remain
pending; no automatic customer upgrade or production promotion.

Final checks: canonical v6 parity, nine focused source/contract cases, four bounded
Managed engine cases, isolated native PostgreSQL continuity/catalog checks, changed
Edge typechecks, explicit synthetic-public builds and syntax/diff checks passed.
Read-only hosting inspection found retrasellshop/retrabyo use this feature branch
as their production branch. The final metadata checkpoint therefore uses the
established [CF-Pages-Skip] prefix to suppress its automatic Pages deployment;
hosting settings are unchanged. Actual remote skip/CI results are recorded in the
external release-parity-fleet-continuity-2026-10-23 evidence.

## 2026-10-23 — Customer-owned controlled upgrades and current release guidance
Branch: feature/verified-customer-support-shop

Replaced ungated terminal upgrade execution with the customer-owned BYO path backed
by the Platform's exact approved plan/request and pending-operation fence. Managed
terminal mode now refuses and directs the operator to the live Master workflow.
The CLI verifies approved source/target, exact project/client/source/binding, native
CLI capabilities and actual SQL progress; requires separate customer confirmation,
an expiring private clearance and original private journal; and shares the bounded
planner/engine with Managed. No customer PAT/service key/password reaches Platform
or browser. A blocked claim causes no provider write; missing/unknown outcomes retain
the original UUID for authoritative review. Only missing SQL and changed functions
are installed, preserving owner, pairing, configuration receipts and customer data.

Customer assessment and checkpoints are explicitly customer-reported evidence.
SQL/gateway/runtime checks do not become full deployed-source compliance; final
state requires source/component review and separate hosted acceptance. The owner
Support screen has restrained read-only upgrade guidance that also works on older
supported backends without assuming new RPCs. Historical upgrade instructions are
labelled superseded; current instructions identify immutable support-v6 and distinguish
fresh source, historical pins, observed ledger and independent installed proof.

Five focused contract/source/CLI/UI cases and three directly affected Support,
financial and legacy compatibility cases pass. Real owned PG17 checks verify shared
approval/ACL/concurrent/session/recovery rules, preserve an actual old pin, and apply
v4→v6 SQL idempotently while retaining Shop configuration/journal data. The customer
CLI fixture covers blocked clearance and successful serial original-ID execution.
Changed Edge typecheck, both explicit-public builds, syntax/diff and canonical parity
pass. Windows sandbox atomic-rename denial was isolated; the unchanged safe journal
path passes in an ordinary Windows private temp directory. No unsafe fallback.

No packaged Shop migration/function/dependency changed, so v6 remains unchanged at
64fcec36fa7a5e2565db2a6d3aa6ddbd8e6c1170eefd4a07a57ae6ba0c066a31;
no v7 or new fingerprint was needed. Historical releases/pins are preserved. New
Platform SQL then platform-upgrade/UI rollout remains pending; deployed provisionv26
is not reinstalled. Owner kept independent fresh hosted acceptance pending and BYO
admin is unavailable. No hosted install/upgrade/reset, secrets/Auth/Vault change,
production promotion or merge. Checkpoint uses [CF-Pages-Skip]; actual remote results
are external in controlled-upgrades-stabilization-2026-10-23. Both existing PRs stay
Draft/Open/unmerged against development.

## 2026-10-25 — Permanent customer clearance public-key compatibility
Branch: feature/verified-customer-support-shop

The upgrade CLI assumed every Platform public key was a legacy anon JWT, rejecting
valid publishable-key clearances before execution. It now recognizes both public
formats and rejects privileged/malformed credentials. A fixed-project, read-only
Auth settings request verifies the key before sending clearance authority; decoded
JWT claims or a publishable prefix alone are not authentication. Redirects, failed
network/HTTP and malformed responses fail closed. The authoritative original claim
also must match its exact mode, state, invocation, client/project/source/target,
binding, request and recomputed plan digest before any customer write.

Five synthetic compatibility/security groups and the existing Platform customer CLI
regression pass, including both formats through three mocked operations, altered
identities, expired/revoked/unauthorized clearance and original-journal recovery.
Changed-JS syntax passes. Canonical cross-repository parity verifies unchanged
immutable support-v6; no packaged backend source or fingerprint is regenerated.

Only CLI, focused tests and guidance/history change. Both completed hosted upgrades,
their source limitations, checkpoints, pins and audit history remain untouched.
Owner authorized this Shop commit's normal Git-connected production builds for
retrasellshop/retrabyo, without skip markers or settings changes. Platform's separate
fixture/history commit retains its skip marker. Actual deployment/CI outcomes are
saved in new external clearance-compatibility evidence. PRs stay Open/Draft/unmerged
against development; hosted owner acceptance and final merging remain separate.

## 2026-10-25 — Final Help & Support presentation correction
Branch: feature/verified-customer-support-shop

The Support renderer contained already-corrupted punctuation despite the document's
correct UTF-8 declaration. Replaced static punctuation with HTML entities; customer
subjects/messages and stored records are unchanged. Generic card buttons and flat
metadata lacked compact list styling and shared control classes. Support now uses
scoped token-based fields, buttons, badges, aligned history metadata, pagination,
notices, disclosure and owner approval/history. Long subject previews use two lines
with full accessible/title/detail text; long identities wrap. Responsive Refresh
alignment and dark-theme contrast were checked visually. Other screens retain their
existing CSS defaults.

The existing isolated Support browser regression passes form/retry/one receipt,
escaped detail, Owner/Manager access and fifty-row pagination. Synthetic presentation
checks pass four widths/both themes, six message states, disclosure and unrelated
component CSS comparisons. Two focused renderer/role cases, JS syntax, production
build (118 modules) and diff checks pass. Initial captures are preserved separately
from final screenshots. No broad suites, backend tests or customer tickets were run.

Owner reports hosted Support acceptance already passed in Managed/BYO; only final
visual review remains. No Support handlers, consent/retry/query contracts, backend,
immutable v6, Platform or excluded BYO checkout changed. Normal Shop commit/push has
no skip marker; existing Git-connected production builds are authorized. Actual
deployment results are in external shop-support-ui evidence. PR1 stays Open/Draft/
unmerged to development; no Cloudflare settings or Platform deployment changes.

## 2026-10-25 — M1 preflight and current Support fixtures
Branch: feature/shop-modernization-m1

Both owner-specified historical post-merge annotated tags were created, pushed and
peeled against the exact development baselines before this branch existed. The
permanent M1 evidence archive retains merge/ref/provider checks; neither development
moved. Cloudflare's four connected projects retained their canonical/latest IDs.

Shop parity CI now pins read-only Platform development commit
a329287df71ad031a3f2ea90a1b4cb5333848dad and covers the M1 push branch. PR path filters,
least privilege and parity validation remain. Platform workflow/source is unchanged.
The obsolete Support fixtures now supply consent/native-session binding and exercise
missing consent, failed current binding, invalid OTP evidence and required audit.
The packaging assertion uses selected immutable support-v6 rather than historical
v3; old release assertions remain. No production handler was changed.

Validation: Support/customer-Support/billing 20/20 pass (baseline 15/19, four obsolete
fixture failures); billing assertions execute with existing locked dependencies.
Canonical parity passes support-v6, 38 migrations/7 functions/eight requirements.
Node24.21.0/npm11.19.0; Vite8.2.4; Supabase SDK2.114.0. No migration/function/release,
hosted DB, provider setting, deployment or Platform source change. Publication uses
[CF-Pages-Skip]; exact remote skip confirmation follows publication.

## 2026-10-25 — M1 tracker exact build destination (R1)
Branch: feature/shop-modernization-m1

The standalone /track.html imported a fixed foreign customer destination/key. It now
imports shop-public-config.js, generated in dev/build from the same validated public
input that explicitly defines the main app's Vite values. Customer query parameters
cannot select the project. Managed environment builds and explicit BYO builds retain
exact project/anon-key validation; verified-dist additionally checks tracker config.
Ticket/phone lookup, public-track and renderer semantics are unchanged.

Validation: tests/tracker-target-browser.mjs creates two independent synthetic builds,
inspects compiled main/tracker destinations and exercises both with real bundled SDK
under Chrome. All non-loopback transport is intercepted; foreign transport aborts.
Both builds pass exact URL/key assertions and hostile target-query/ticket/phone checks.
No hosted request was sent. Initial runner-shape and sandbox-loopback failures are
retained beside the passing evidence. Evidence: permanent M1 run
20261025T013642Z-M1-003-629a9fb5. This is local synthetic verification, not hosted
acceptance. No backend, release, Platform, DB or deployment changes. R1 is ready for
independent inspection; independent disposition remains NOT REVIEWED.

## 2026-10-25 — M1 private authority boundary and original checkout outcomes (R2)
Branch: feature/shop-modernization-m1

Verified native Auth session identity now owns UI state. Actor/session replacement,
USER_UPDATED and signout invalidate private caches, cart/customer/tenders, repair
working draft, Admin/Workshop/EMS data, PIN callbacks and app dialogs. Ordinary route
activation within the same native session retains the cart/draft. Canonical role,
consent, entitlement, onboarding and legal checks remain authoritative.

Checkout and cart repair/payment records remain separately original-actor owned in
memory. Replacement UI gets no old result; checkout retains immutable input/tax,
UUID, outcome/uncertainty and old busy completion cannot unlock successor work.
Only the original actor sees detached request references. Review reads the original
sale/repair by UUID; absent/error is unconfirmed and never causes automatic replay.
Detached payment uncertainty retains its original request/input and instructs review
against original payment history. It does not claim an absent read means failure.
These in-memory recovery records do not claim persistence through tab destruction.

Validation: actual entry browser proves same-role account/session changes clear cart
and repair data while same-session activation preserves drafts. Actual checkout/API
fixture proves late ACK after A→B retains A UUID/payload/result, performs no B reload
or replay and permits original-actor inspection. Focused transaction/repair/module/
numeric/handoff tests pass; exact logs are in permanent M1 evidence. Initial VM
harness dependency/cross-realm assertion failures were corrected in test setup.
No backend/release/DB/provider/Platform source change or deployment. Independent
review NOT REVIEWED; R2 is a separately inspectable source boundary.

## 2026-10-25 — M1 centralized Workshop navigation and Manager affordances
Branch: feature/shop-modernization-m1

Workshop Admin now navigates through the central router to /admin/dashboard instead
of directly initializing Admin while /workshop remains the browser URL. Admin POS,
New Ticket and Collect affordances use can(pos); denied collection cannot leave an
intent in sessionStorage. Defensive navigation handlers also check can(). Existing
Manager Admin access and all role/entitlement policies remain unchanged. Actual
entry browser cases cover Owner/Support history/deep-link/refresh and Manager denial;
final candidate results are recorded with integrated acceptance. No backend, DB,
Platform or deployment change. Independent disposition remains NOT REVIEWED.

## 2026-10-25 — M1 async continuation and operation ownership
Branch: feature/shop-modernization-m1

POS/Workshop loads now capture route activation, native authority and resource
sequence, including child/family continuations. Admin retains its resource sequence
and also captures native/route ownership. Async delegated actions check current view
and selected modal before and after each await, including before starting follow-up
work. A shared listener wrapper preserves synchronous preventDefault and owns async
failures. This async event wrapper is a dependency of M1-006; remaining synchronous
input/change/keyboard listener ownership is deferred to M1-010 after EMS.

UI reset and late-result guards are separate from a private in-memory financial
command journal: exact original actor/session, UUID and arguments survive UI reset.
Only the same current actor can inspect those records; no retry is scheduled. Known
business-command RPCs pin the original transient bearer before submission; credentials
are never journaled. A changed session before submission fails closed. Existing
server transaction/consent/role/PIN authority and idempotent RPCs remain unchanged.

Actual-loader reverse completion, departed-follow-up and late family-summary tests
pass, as do original checkout/actor/payload tests (5 focused cases). The real entry
browser passed its existing cases, then exposed a selector ambiguity caused by the
pre-existing Admin shell/page duplicate headings; the fixture now selects the first
current heading. No styling redesign is included. Initial failures and editing-aid
provenance remain in permanent M1 evidence. No backend/release/DB/Platform source or
provider setting changes. Local source verification is not independent audit.

## 2026-10-25 — M1 truthful failed and incomplete reads
Branch: feature/shop-modernization-m1

POS/Admin/Workshop now settle thrown and ordinary Supabase error results into
explicit loading/ready/unavailable states. Failed required values remain null;
Admin suppresses unverifiable reports/history instead of presenting zero/empty
success. Workshop rejects partial root/child queues before summaries or actions.
Child-detail helpers throw on failed reads. EMS validates its required resources.
Configuration read failure is a fail-closed screen. Read retries perform no command.

POS scopes optional failure: unavailable quick items/inventory/repair/credit/shift
resources have notices, and dependent actions cannot use those missing inputs.
Safe custom-item work remains available under optional catalog failure. Existing
working drafts and original command outcomes are retained; no transaction retry is
inferred from a failed read. No new pagination/read API or M2 redesign is introduced.

Focused actual-loader/read/checkout tests pass6/6, including reversed results and
partial-family rejection. Existing browser fixture now contains denied report,
optional catalog and partial-child oracles; final-candidate execution is recorded
in integrated evidence. No backend/function/migration/release/DB/Platform/provider
change or deployment. Independent review NOT REVIEWED.

## 2026-10-25 — M1 owned route recovery and failed-chunk retry
Branch: feature/shop-modernization-m1

Router now awaits route handlers and catches import/initializer failures only for
the current activation. Operational initializers are awaited. Current-session
recovery provides Retry loading, Return home and Sign out through existing gates;
retry does not submit a business command or clear same-session cart/operation memory.
A failed module fetch is browser-cached: the focused real browser exposed that a
plain repeated import never recovered. The loader now permits a cache-busted retry
only for the exact same-origin operational module URL, then retains its successful
namespace. Customer input cannot choose a module host/path. Init failure reuses the
already-loaded namespace. No automatic page reload destroys unresolved context.

Actual entry browser confirms route/role/privacy and denied/optional/partial read
cases, then successfully recovers the deliberately503 module after transport is
restored. The follow-on synthetic initializer test initially referenced the known
failed original URL; its fixture now uses the actual recovered namespace. All
failed logs are retained. Integrated final source will run the complete sequence.
No backend/release/DB/Platform/provider change or deployment. Independent review
remains NOT REVIEWED.

## 2026-10-25 — M1 current EMS controller and action ownership
Branch: feature/shop-modernization-m1

Persistent EMS handlers now read a current controller refreshed on every mount.
They retain current route/native-session/generation checks; tab/filter reads have a
request sequence so reverse completion cannot replace newer data. Successful leave
and salary actions refresh the current controller once. Departed callbacks cannot
refresh/toast elsewhere. Pending salary generation is fenced by native actor/session
and employee/month/year, including leave/re-entry, without changing payroll policy.
Required salary configuration/attendance/leave failures stop before generating a
false zero-derived result; post-await ownership prevents departed follow-up writes.

The focused fixture executes the actual EMS binder and common async wrapper: reentry,
current tab/filter, one leave write/refresh, duplicate payroll submission, pending
revisit and late-result suppression pass. Synthetic I/O is explicitly not hosted
payroll acceptance. No backend/release/DB/Platform source/provider change or deployment.
Independent review remains NOT REVIEWED.

## 2026-10-25 — M1 consistent persistent event ownership
Branch: feature/shop-modernization-m1

All remaining synchronous Admin/POS/Workshop input/change/keydown delegates now use
the same current route/native-session/module predicate as async click/submit work.
Inactive modules cannot consume shared selectors or keyboard input. The existing
single shared PIN keyboard owner is retained; route/authority changes cancel stale
PIN callbacks. Native form prevention still occurs synchronously in owned delegates.
No stopPropagation patches, permission expansion or transaction changes are added.

Focused EMS/loader/checkout regressions pass7/7. Actual entry browser passes recovery,
role/history/privacy/read cases and100 transitions with stable app/document listener
counts. The final Enter case initially used an additional-work selector rather than
the current intake selector; corrected to the actual intake/tag controls. Integrated
candidate verification additionally checks input/change/Enter/PIN. Prior failed
runs remain. No backend/release/DB/Platform/provider changes or deployment. Independent
review NOT REVIEWED; this is implementation-author validation only.

## 2026-10-25 — M1 integrated ownership closure
Branch: feature/shop-modernization-m1

Final source review found that shared EMS clock-in/out gate continuations also need
native/session ownership, beyond Admin EMS. They now capture the gate owner and
recheck after reads/ACKs before rendering, proceeding, clocking out or signing out.
Failed attendance reads remain unavailable rather than becoming a missing shift.
A focused actual-gate test proves a departed same-role response cannot open/proceed
under the new account. Existing payroll/business-day policy is unchanged.

The financial RPC observer sends a detached copy of original arguments after live
session verification. Conflicting changes to a pending checkout cannot silently
replace/reuse the original UUID; local pre-send insufficient-cash validation remains
correctable. Original uncertain outcomes are offered for read-only review, never
automatic replay. Existing Paper race fixture is adapted only for the new async
wrapper dependency; its original successor-data/busy assertions remain.

This is a small M1-006/011 closure, no new backend/release/DB/provider/Platform source
scope. Final candidate commands/results,13-case ledger and audit handoff are in the
permanent archive. No independent audit or owner acceptance is claimed.

## 2026-10-25 — M1 explicit public build validation coverage
Branch: feature/shop-modernization-m1

The two-target synthetic browser regression now also executes the actual explicit
BYO build CLI and its verify-dist digest/target check using only synthetic public
input. Managed-style Vite builds and explicit customer builds therefore share direct
execution evidence for the tracker correction. This adds no public configuration
field, backend component, provider operation or release. Integrated final-candidate
logs are retained in the permanent M1 evidence run.

## 2026-10-25 — M1 final validation fixture repair
Branch: feature/shop-modernization-m1

Integrated candidate validation executed70 focused tests:68 passed and two inherited
account-admin onboarding fixture cases failed. Both the test and production handler
were unchanged since development; the VM omitted the handler's current imported
supportSessionAllowed helper. The fixture now executes that real helper, supplies a
synthetic native-session token and models the trusted binding response. Owner-only
completion and revoked-Support denial assertions remain; no handler is weakened.
The focused onboarding group passes8/8 after repair. Earlier68/70 evidence is retained.

Application/browser/build sources are byte-identical to the passing2643b8f1 candidate:
actual entry/100-navigation/PIN, two-target builds, explicit BYO verify-dist and
canonical support-v6 parity all passed. Final unit rerun and source-equivalence proof
are archived at the next exact commit; no historical test is promoted without that
proof. No hosted operation, backend/release, Platform or provider change occurred.

## 2026-10-25 — M1 post-ACK refresh ownership correction
Branch: feature/shop-modernization-m1

Final audit preparation found a second await after successful repair creation/payment:
the following resource reload also requires ownership before opening a receipt or
showing remaining balance. Both continuations now recheck original authority/view
and detach their original outcome when replaced. A successful payment with an
unavailable current ticket read reports acknowledged payment plus unknown balance,
never a fallback historical amount. Mixed retail carts require every applicable
catalog resource, rather than selecting only the first type.

An actual-function test exercises both repair and payment ACK→delayed reload→A/B
replacement and proves no replacement-account modal/notice while the original
actor/outcome remains retained. Final current-source validation is recorded in a
new run; earlier successful runs remain associated with their exact prior source.
No backend/release/DB/Platform/provider change or deployment.

## 2026-10-25 — M1 final acceptance boundary coverage
Branch: feature/shop-modernization-m1

Extended existing acceptance fixtures to explicitly cover private customer/tender
reset, Cashier/Technician denied operational bundles/data, /admin alias and unknown
route fallback, and actual-router suppression of a departed async failure. These
close named M1 acceptance oracles rather than adding duplicate test permutations.
Application source is unchanged by this coverage commit. Final exact-candidate
results and source archive follow in the permanent evidence register; no independent
review, owner acceptance, merge, deployment or backend operation is implied.

## 2026-10-26 — M2 local baseline and resource contracts
Branch: feature/shop-modernization-m2

Owner authorized local M2 development atop the verified unmerged M1 tip 4186b518.
Its empty Cloudflare refresh commit has the same application tree as 1ca15ba3.
Both development refs and historical checkpoint tags remain unchanged. M1 PR #2 is
still draft/unmerged with no independent review or owner acceptance recorded;
M2 publication waits for that dependency or a specific owner decision.

Defined fourteen screen resource/ownership/error/detail contracts and a comparable
actual-Chromium, synthetic-Auth, delayed-loopback HTTP performance harness. Baseline
is captured before modifying application loading. Harness development failures and
early invalid markers are retained outside source and excluded from comparisons.
Independent full-fixture family/receipt gap tests reproduce why independently
truncated arrays cannot establish complete search/dedup/family counts. The narrow
backend scope memo is proposed only; no SQL/function/release/Platform edit is made.
Disposable Shop identity was verified read-only; available SQL settings did not
expose its API cap, so the fixture cap is explicitly synthetic. No hosted write,
provider setting change, agent deployment, push, merge or Platform operation.

## 2026-10-26 — M2 POS critical path and demonstrated shift scope
Branch: feature/shop-modernization-m2

POS now waits only for bounded projected stock and quick-item selectors after live
configuration. Intake components, complete collection compatibility read, canonical
Udhar and shift report are owned on-demand modal reads with local retry/error.
Return search projects matching invoice identities server-side, verifies complete
matching pages and then uses the existing canonical return context; no entrance
sales/return history. Remote stock typing is debounced and generation-owned; cart
and financial commands remain immediate with original UUID/PIN/ACK ownership.
Stock refresh after retail ACK is limited to affected visible stock; repair payment
re-reads its canonical family summary rather than refreshing unrelated histories.

D02 is reproduced against the actual M1 renderer: UTC-prefix/display-name matching
includes the wrong local day and same-name/unmapped actors. Shift operational rows
now use the same existing local-midnight half-open report period and canonical
Auth UUID; legacy unmapped rows are explicitly identified, never guessed by name.
EMS day policy is unchanged. Complete selected-period reads reject cap/count drift.

First real-browser loopback smoke has six cold/three warm data-service reads
including config versus twelve/nine at M1; final paired distribution is pending.
Focused checkout/draft/paging/day-actor cases pass9/9. Large repair collection is
explicitly unavailable when the existing member array is incomplete; Track B family
and receipt completeness remain blocked rather than silently showing a partial
archive. No backend/release/hosted write/Platform/provider change or deployment.

## 2026-10-26 — M2 scoped Admin resources and complete flat pages
Branch: feature/shop-modernization-m2

Dashboard uses eight projected recent sales, canonical global/day financial reports
and independent exact root/employee counts. Reports uses its canonical global scope
and fifteen projected recent summaries, with complete selected sale fetched before
reprint. Unused ticket/return/Udhar/today reads are removed; complete Udhar detail is
owned on demand. Inventory imports only for its consumer; Catalog loads only its
active entitled tab; owner Legal status loads only in Legal settings.

Projected Inventory/Employees/Catalog search runs on the authorized server scope
with deterministic primary/id order and finite pages, adaptive smaller API caps,
owned query responses and exact selected editor records. Matching count is distinct
from page rows; low-stock alerts explicitly describe their page. Recent previews
reach their finite8/15 bound even below a small cap. POS search keeps its input
usable while old results are disabled and rejects a late prior query. Incomplete
legacy family/receipt histories now show unavailable rather than false completeness;
the approved replacement read contracts remain a separate authorization gate.

Actual application browser with a seven-row synthetic API cap reaches stock and
employees beyond1,000 records, verifies canonical report scope, complete reprint
selection, tab scoping and stale search protection. Focused paging and ownership
tests pass. Final exact-source distribution/audit remain pending. No packaged
backend, hosted write, Platform source, provider setting or deployment change.
