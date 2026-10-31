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

## 2026-10-26 — M2 Workshop expansion and config equivalence
Branch: feature/shop-modernization-m2

D03 removes every per-root monetary startup RPC. Workshop pages active roots with
stable timestamp/id ordering and completely retrieves their required children;
status queries/page totals are distinct from explicitly page-scoped presentation
filters. Components and exact editor data load on edit. Owner/eligible Support
financial expansion calls only the existing selected canonical summary, with local
loading/error/retry and route/selection/authority fences. Technician receives no
summary action; Manager remains denied Workshop. Canonical summary shape is checked
before displaying amounts. No batch financial API or backend change.

Configuration shares concurrent equivalent requests only inside its public/app and
native authority scope. A private one-use proof passes the just-verified initial
app config into the first screen; later navigation reads fresh config. Reset and
config mutation invalidate pending work/proofs. No TTL/completed permission cache,
public/auth conflation, logo Storage migration or changed saved merchant data.

Actual-loader and browser fixtures prove zero startup monetary calls for0/10/100
roots, all100 roots reachable under a seven-row API cap, selected-only expansion,
departed response suppression and Support revocation/Technician/Manager negatives.
Config tests include concurrent reads, native replacement, failure, one-use proof,
mutation and a max-size embedded payload. Hosted ACLs are not inferred from mocks.
No Platform source, packaged backend, hosted write, deployment or merge.

## 2026-10-26 — M2 active EMS resources and complete selected payroll period
Branch: feature/shop-modernization-m2

EMS reads only its active attendance/leave/salary/slip dependencies and a separately
verified current-attendance banner. Directory/history/slip pages have deterministic
ordering and explicit matching counts; server history search reaches older data.
Presentation filters rerender the current bounded page without Supabase reloads.
Salary config is complete for its selected employee page; salary generation uses
its own complete approved employee/month attendance and overlapping approved leaves,
never directory or attendance-page rows. The overlap restriction is equivalent to
the prior period-clamped calculation; unrelated leaves contribute zero. Existing
UTC EMS day, Sundays/pay formula, account authority and pending-action fence remain.
Selected salary reprint reads the complete persisted slip. Failed live attendance
is unavailable independently; incomplete payroll reads prevent a salary write.

Actual-browser tab/search tests pass with a seven-row cap and older history beyond
1,000 rows. Actual generator tests verify complete selected-period pages, independent
expected pay and no write after incomplete attendance. Existing EMS callback/revisit,
duplicate payroll and departed-result tests remain, with the local-filter oracle
updated to require zero resource reloads. No SQL/function/release, Platform, hosted
write, provider change, deployment or merge is performed by this frontend slice.

## 2026-10-26 — M2 browser continuity and expanded SQL investigation scope
Branch: feature/shop-modernization-m2

Added an extension of the existing native-entry fixture for projected/search/count/
range/detail query behavior. Actual browser acceptance passes old inventory/staff/
attendance discovery beyond1,000 rows with a seven-row API cap, exact report/reprint
detail, deferred POS actions, active Catalog/Legal/EMS resources, zero Workshop money
at0/10/100 roots, all100 roots paged without duplicates, selected-only summaries and
stale/revoked/denied cases. The existing M1 entry suite also passes privacy, routing,
read failures, route recovery,100 transitions/listener stability, Enter and PIN.
Its held-config test now releases the equivalent shared in-flight read before
awaiting its successor; the old route still cannot publish. Failed prior fixtures
and browser attempts remain in the permanent archive.

Owner additionally authorized Docker/local Shop SQL development and a read-only
study of both development release/provisioning/upgrade implementations. A new
network-isolated, no-port disposable Supabase PostgreSQL17 container is used; no
existing container or provider is changed. Real Managed/BYO SQL envelopes install
all38 immutable v6 migrations in isolated fixtures after supplying synthetic Auth
prerequisites. This is local SQL evidence, not hosted provisioning/Auth acceptance.
Current v4→v6 controlled upgrade is supported; v5 is explicitly superseded, and
protocol/source/gateway gates still govern every transition. New Shop SQL remains
local; Platform source/selectors/manifests/database require explicit owner approval.
No final new release fingerprint, Platform edit, push, PR, merge or deployment.

## 2026-10-26 — M2 additive bounded reads and measured consent-policy initplans
Branch: feature/shop-modernization-m2

Expanded owner scope permits local Shop SQL and Docker validation; the latest
instruction requires repository migrations delivered by existing provisioning,
with no direct hosted SQL. Platform investigation remains read-only pending
explicit approval. Added forward migration20261025233743 and mapped its ninth
requirement into both existing installer plans. Two invoker/RLS read RPCs select
distinct roots by any-member search and unified bounded receipt headers with
global off-page retail deduplication. Exact invoice search returns family identity;
complete selected-family reads and the inherited helper retain child/date/order
semantics. An additive config field advertises availability, not permission.
No monetary batch API, financial write, Edge function or old migration is changed.

EXPLAIN on102,003 tickets/101,003 sales showed the existing stable restrictive
Support predicate evaluated per row. A transactionally rolled-back prototype
retaining the same predicate as a statement initplan reduced exploratory median
receipt SQL6341.955→1976.851ms and family page3601.988→434.142ms(three warm samples).
The migration preserves restrictive policy roles/USING/WITH CHECK, updates only
tickets/sales and bounds DDL lock waiting to5s. No speculative index is added.
Network payload is bounded; exact counts/substrings still scan eligible history.
These are local synthetic SQL measurements, not hosted/browser performance claims.

Final source evidence: existing modernization archive, M2 evidence run
20261026T024629Z-M2-012-44d79fa-sql-initplan-final. Fresh Managed/BYO and populated
v4→v6→forward SQL envelope fixtures all pass39migrations. Complete helper oracles,
direct RLS wrong-session/revoked/expired/deleted/binding/client negatives, inert
replay, source conflict, intentional insert+ledger rollback and lock-timeout then
same-step retry pass. Synthetic Auth fixtures do not prove hosted Auth/provider or
Edge deployment. Earlier failed and pre-optimization runs remain archived.

Existing v4/v6 packages, customer pins, active v6 selectors and both development
branches remain unchanged. Final new immutable package/fingerprint, paired release
catalog/manifests/selectors and parity approval are pending explicit Platform
integration authorization. Two integrated unit release gates correctly reject the
old manifest against this new backend source; they have not been relaxed. No
hosted write, push, PR, merge or deployment is performed by this backend slice.

## 2026-10-26 — M2 capability-gated family and receipt screens
Branch: feature/shop-modernization-m2

Frontend reads new family/archive APIs only when authenticated bootstrap advertises
version1. Missing/public/failed/replacement config clears availability; older shops
retain verified legacy behavior and no newly introduced RPC call. Selected roots
retain server page order and complete selected children; unsafe numeric identities,
count drift, duplicate rows, missing roots and departed owners fail closed.
Admin repairs/Workshop/POS collection search checks parent and child history on an
upgraded backend. Receipt headers use stable bounded pages; exact child search
loads the complete cross-date family with the inherited helper and natural sort.
Opening a normal receipt fetches the full selected sale/ticket, with owned loading,
error/retry and parent reads. Counts distinguish matching families, pending tickets
on the current collection page and archive rows. Filtered POS previews say matching
rather than recent. No command identity, financial authority or role is widened.

Final frontend local evidence: existing M2 archive run
20261026T153456Z-M2-013-6776983-dialog-browser. Resource browser, M1 entry/100
transitions/listener/Enter/PIN/privacy/recovery browser and local Vite build all exit0;
33focused read/config/ownership/legal/period/EMS cases pass. Earlier startup timeout,
ambiguous main/dialog selectors and predecessor-route test race remain archived;
fixture synchronization/selectors were corrected without weakening assertions.
The integrated86-case run retains2 release-source blockers pending approved paired
integration. Its outdated legal function-signature fixture is repaired and passes.

Backend source remains677698391ae1a77d259022b2453d20dc76e79cd9. A focused local
Platform release-integration decision is pending in the permanent archive. Final
paired performance profiles, package/parity, independent audit and M1 publication
dependency remain open; this slice is not a complete/release-ready M2 milestone.
No Platform source edit, hosted write, push, PR, merge or deployment is performed.

## 2026-10-26 — M2 undated receipt oracle correction before release freeze
Branch: feature/shop-modernization-m2

A schema-permitted legacy receipt with a NULL stored date exposed a mismatch in
an additional independent oracle: the inherited helper includes it for a to-only
filter, while the initial unpromoted candidate excluded it. The unreleased M2
draft read migration now preserves that behavior and uses the inherited epoch-zero
ordering for unknown dates without altering the returned stored date or time policy.
Nullable parent/child invoices and pre-epoch records are included in the oracle.

All four real Managed/BYO SQL envelope fixtures pass again, including populated
upgrades, direct/current RLS denial, replay, source conflict, transaction failure and
lock-timeout/retry. Evidence run:
20261026T171054Z-M2-012-941cf69-corrected-date-source. The failed preceding oracle
is retained in20261026T170312Z-M2-009-6776983-null-oracle-run.

The earlier6f817827 local v7 candidate had never been committed, pushed or installed
by this task. It was verified untracked/unapproved/unsupported and moved, with both
absolute paths checked inside the workspace, into the failed-oracle evidence as
superseded-support-v7-6f817827.json. Its fingerprint is invalidated; it is not a final
release. A replacement is generated only from this newly committed, verified source.
Older immutable releases, all existing pins and both active v6 selectors stay intact.
No hosted write or remote Platform operation occurred. The prior local fixture
container disappeared during the environment restart; its replacement is owned
container808955b36125974f5ad171aab504c46733017e2dcccf556a6f2d8c4ee13afdd3,
networknone/ports{}, with synthetic data only.

## 2026-10-26 — M2 older-Shop operation and final paired profile harness
Branch: feature/shop-modernization-m2

Older supported backends with large histories now retain bounded root pages and
explicit exact ticket/invoice lookup through existing authenticated APIs. Complete
small histories retain free-text behavior; a capped member array is never advertised
as complete. Exact old-invoice lookup fetches the full parent/children and excludes
repair-linked duplicate retail rows even when the linked repair was outside the
first page. Old shops need no new RPC for these operations. Broader global text
search and unified archive pages remain availability-gated for the new backend.
Page/global/status labels are distinct; the effective cap is preserved when moving
back from a short final page. Superseded capped-reader code is removed. Workshop
filters render known statuses only, rather than interpolating arbitrary stored
status names; unknown text stays escaped and metadata counts are validated.

Actual old/new browser compatibility passes in
20261026T161730Z-M2-013-941cf69-legacy-compatibility, including full exact receipt/
family lookup beyond1000 members. Final-short-page cap7 navigation passes in
20261026T162717Z-M2-013-941cf69-legacy-paging.34focused cases, M1 entry/100-transition/
listener/Enter/PIN/privacy browser and compile pass in the intervening compatibility
run; additional actual-render stored-status and benchmark-fixture checks pass.
Final compile after the pagination/label cleanup exits0. These are local synthetic
I/O checks, not hosted business or physical-print acceptance.

The matched harness is source-snapshot based, uses schema-correct fixtures and
real loopback HTTP, fixed response delay and browserCPU4. It supports measured
search, a max-size merchant logo payload and100-transition GC/DOM observation.
One unreported warmup and actual cold/warm contexts remain. A fixture unit verifies
literal punctuation search, exact counts and stable multi-column ordering. Both
immutable M1 and current-source one-sample smoke profiles pass; these are not final
20-sample distributions. Initial fixture/header corrections and failed text-edit
source are retained, as are all original pre-implementation baseline distributions.

The local v7 customer catalog and existing parity wrapper support explicit candidate
review, without changing the ordinary approved-active gate or v6 BYO selector.
Backend source is50b94931ecf743166136b2c562cbb6d2fbaebdc7; verified replacement
fingerprint is c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada.
The earlier6f candidate is superseded and never a final approved package. Platform
integration is local-only under the owner's explicit approval; no remote Platform
operation, application deployment, push, PR or merge has occurred.

## 2026-10-26 — Pair local M2 release review sources without promotion
Branch: feature/shop-modernization-m2

The owner-authorized local Platform candidate is committed at
cedde3838e039b2ec9aebc163153e01253ede1ca. Pinned the paired review workflow to that
exact source and added explicit support-v7 candidate review while retaining the
ordinary approved-active release gate. That latter gate intentionally blocks
promotion until the actual Managed selector and BYO manifest are separately
reviewed. No workflow ran remotely and no Platform operation was published.
Final backend source remains 50b94931ecf743166136b2c562cbb6d2fbaebdc7 with fingerprint
c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada.
This workflow/history-only change does not alter the backend package or browser
behavior. Exact local candidate parity and immutable-source proofs are archived
with M2 review evidence; no database, merge or deployment change occurred.

## 2026-10-26 — Preserve benchmark timeout diagnostics and final release decision
Branch: feature/shop-modernization-m2

Added failure-only DOM/resource/read/route diagnostics to the browser measurement
harness after one cold Reports sample timed out without a page error. The failed
20-sample batch is preserved (Reports19valid, all other screens20); a separate
30-sample Reports candidate run passes without reproduction. This is an unresolved
benchmark anomaly, not silently discarded evidence or an established production
root cause. Diagnostics do not change the timed path or application/backend code.
Updated the backend decision with the owner-approved local Platform integration,
final corrected c4 fingerprint, old-backend exact-lookup compatibility and retained
promotion gates. These test/documentation changes do not invalidate packaged
backend bytes or prior business/security tests. Final profile closure remains
pending; no remote operation or deployment occurred.

## 2026-10-27 — Approved support-v7 source selector and controlled-upgrade guide
Branch: feature/shop-modernization-m2

Source now selects the immutable support-v7 c4d210d0... fingerprint, backend source
50b94931ecf743166136b2c562cbb6d2fbaebdc7, 39 migrations/seven unchanged Edge packages.
Shop catalog agrees with Platform: v7 single fresh-approved, v6 historically supported,
v5 unsupported. Historical packages, source SQL, JWT settings, pins and original
jobs remain unchanged. Shared classifier incorporates PR6's independent drift/evidence
and version-aware capability logic exactly; customer scripts gain no provider access.
The authoritative CONTROLLED_BACKEND_UPGRADES guide covers exact installed-source
assessment, Master approval/separate clearance, authorized customer apply, final
evidence and original-request/journal recovery. Old ungated terminal Managed and
uncleared BYO instructions are superseded. V6→v7 expects one SQL/zero changed functions.

Normal cross-repo parity, immutable/source integrity, focused release/upgrade/clearance
contracts and PR6 evidence/capability checks pass. Seven PowerShell blocks parse and
upgrade flags match the real parser. A single isolated Platform PG17 policy fixture
passes with original history preserved. Initial stale fixture assumptions were fixed;
no production verification gate changed. No browser, benchmarks or full suite ran.

Owner authorizes existing branches to be pushed and configured automatic Pages builds,
without skip markers, ending in an empty deployment-trigger commit. Exact paired CI
source, pushed identities/results are retained in M2 evidence. Both PRs remain Draft/
Open; no merge, hosted Supabase write/function deployment or Shop upgrade is performed.
Hosted activation and customer installation remain owner actions. Full source evidence
limits, F22 deferral and other M2 acceptance obligations remain explicitly separate.

## 2026-10-28 — Customer BYO release preflight and native CLI guidance
Branch: feature/shop-modernization-m2

Added customer-only local source preflight using the existing approved manifest,
public customer catalog, canonical source hash, exact provenance, executable plan
and committed backend ancestry. The expected SHA from authorized Platform can be
supplied explicitly. It reads no private Platform code or provider state. Inspection
and upgrade review/apply invoke it before provider access. The internal paired
checker remains authoritative; an early compatibility check explains stale v6/38
Platform versus M2/39 Shop, including sibling/override recovery, instead of a raw
assertion. V7/historical package bytes and fingerprints remain unchanged.

Native CLI discovery supports Windows PATH/Path and tries compatible executables,
including Scoop shims, retaining explicit native override compatibility. Normal
instructions use supabase directly with official Scoop installation; no package
runner is introduced. Project/account/private-folder errors give safe recovery.
Controlled-upgrade and BYO references now defer to the primary in-app guide and
distinguish external customer preflight from internal paired source validation.

Three focused preflight/native/identity groups, paired current/stale cases, one
existing clearance transport group and ordinary source parity PASS. Platform's
three guide and four navigation groups, 15 PowerShell blocks, flags/import/syntax
checks PASS. No browser, broad suites, benchmarks or Docker/SQL. Owner authorizes
normal commits/pushes and automatic Pages builds; Draft/Open PRs remain unmerged.
No SQL/Edge/package/executor/authorization change or actual customer upgrade occurs.
Small M2 evidence records exact files, commits, results and owner acceptance steps.

## 2026-10-28 — Specific controlled-upgrade input diagnostics
Branch: feature/shop-modernization-m2

Replaced the combined upgrade argument failure with a focused parser that identifies
missing/invalid mode, exact project, client ID, source SHA, journal path and review/
apply selection. Missing option values, duplicates and conflicting flags fail closed
with nonzero exit. Unsupported historical source remains denied with evidence-review
recovery. The executor, release preflight, authorization, clearance, journals, original
request and provider fences are unchanged; no SQL/Edge/package source changed.

Technical guides now describe the repaired in-app fresh-wizard-style instructions:
complete self-contained PowerShell blocks, default/original private-folder restoration,
unique reports, actual contract/identity/plan checks and explicit terminal PASS/STOP.
A clean older M2 checkout gets guarded fetch/--ff-only recovery; dirty/wrong/divergent
source stops. Developer parity remains outside customer stages. The actual trial
checkout and private files were untouched.

Focused checks cover one actual read-only assessment using synthetic native/provider
responses, fresh-terminal copied inventory/assessment blocks, and specific invalid-
input/nonzero-exit behavior. No provider write or journal replacement occurs. Platform
checks cover customer commands, local guide navigation and copy-control rendering.
Only the failed multiline-stdin test harness was repaired and rerun through an isolated
script file. No browser, broad suite, benchmark or Docker/SQL work was done. Existing
Draft PR3 push and automatic Pages build are owner-authorized; no skip/empty trigger,
merge, actual upgrade or hosted Supabase change is performed.

## 2026-10-28 — Final M2 local pre-merge cleanup

Owner reports 7/7 live Managed/BYO disposable-Shop functional checks accepted and
both support-v7 controlled upgrades complete/recorded. This cleanup does not rerun
or independently certify those operations, performance or deployed source.

Removed operational temporary-branch dependencies from supported guides, source
recovery/help, setup gating, links and CI triggers. Historical commit/source hashes,
immutable releases and dated PR/engineering evidence are preserved. Broken audit
links now use verified immutable merged snapshots. Root AGENTS uses durable
main/development and pre-merge dependency-hygiene rules. Paired CI retains compatible
immutable peer pins across either merge order and branch retirement; customer
preflight still needs no private Platform checkout. The safe customer-reference
handoff order is Shop PR3 then Platform PR6, using merge commits to preserve the
approved backend source ancestry. No branch deletion is authorized.

Focused UI/history, generated PowerShell syntax/reference, source-preflight, setup
validation, paired v7 parity and narrow workflow checks pass. No broad/browser,
performance, Docker or hosted Supabase work. V7 remains c4d210d0… / 39 migrations /
7 functions / 9 requirements. Changes stay LOCAL/UNCOMMITTED pending explicit owner
commit-and-push approval; merging requires another separate approval. Full results,
exact files and acceptance attribution are in the single M2 final cleanup report.
Publication authorization update: the owner explicitly approved Gate 1 for normal
commits/pushes of the reviewed cleanup on both existing M2 branches, with automatic
Pages builds. Exact commit/CI/deployment outcomes are recorded in the existing final
cleanup report. STOP before merge; separate owner authorization is still required.
No local/remote branches may be deleted. No additional feature/backend work authorized.
## 2026-10-28 — M3 stable rendering, dialogs, dual branding and print presentation
Branch: feature/shop-modernization-m3

### Purpose
Implement the owner-approved final frontend modernization candidate from Shop
2dffa1eaf0ddd63d0e8369ccf6f889e4d31e028d. Platform development
864cdbc1c09184a72e33afe67aa4a4f516e78e68 is read-only design reference.

### Changed
Existing Admin/POS/Workshop templates now reconcile stable shell/content/dialog
boundaries, keyed cart/receipt rows and revision-checked family/receipt models.
Shared dialog ownership supplies bounded responsive geometry, accessible names,
focus containment/restoration, inert background and dirty/busy protection while
retaining specialized confirmation/PIN and M1 authority/request guards. Quick Item
variants, compound password/repair/credit controls and receipt actions reflow.

Official original artwork, PWA/favicon assets and licensed local Inter use scoped
Platform tokens. A distinct font alias and unchanged legacy login rules protect
login appearance and animation. Product identity stays fixed; saved merchant colors
remain raw while readable accents, names and logos stay in business contexts.
Onboarding, inline operational modules and the project-scoped tracker share the
system. Tracker phone input styling is consistent with its exact-reference input.

Printing has an optional, default-off plain attribution for the current action,
including actual POS/Admin/EMS callers and six builders. No preference is stored.
An exact duplicate line is avoided; actual height is measured before unchanged
copies multiplication. A measured blocked-CDN barcode failure justified vendoring
exact JsBarcode 3.11.6 with MIT notice, preserving readiness, CODE128 and queue rules.

### Validation
Focused model/assets, unchanged-source, checkout/draft/thermal/ownership checks;
actual-entry loopback dialog/cart/search/receipt/role/inline/tracker fixtures;
matched login computed appearance and advancing shader observations; real 200%
Chrome page zoom; one small matched cart sample; original versus candidate queued
print readiness and default-output comparison. Commands/results and source hashes
are in the existing M3 evidence register and implementation report. Build and v7
parity checked locally. Earlier failed fixture/layout cases are retained with fixes.

### Deployment / DB impact
Local only. No push, PR, deployment, merge, Platform modification, hosted Supabase
operation, migration, Edge Function or release generation. Approved v7 fingerprint
c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada
remains 39 migrations / 7 functions / 9 requirements. Worker remains online-only.

### Deferred / deliberately unchanged
D01-D06, canonical roles, money/time semantics, request UUIDs and unknown outcomes
remain. Independent audit/owner acceptance, physical printer, actual mobile keyboard
and installed OS-app icon evidence are pending; no self-certified acceptance.
F22 retains its existing bounded deferral. F18 has a local implemented correction.

### Git
Reviewable local checkpoints use [CF-Pages-Skip]. Publication and Draft PR require
separate owner approval; all later PRs target development. No branch deletion.


## 2026-10-29 — M3 owner visual acceptance corrections (local)
Branch: feature/shop-modernization-m3

### Purpose and decisions
Implement M3-OA-01–05 from owner visual review. Safely fast-forwarded the clean feature
branch to approved empty ancestor 9f74a8fff4d37424c31d8ba9bd942523e659a8b6.
D05's optional/default-off presentation is expressly superseded: every supported
printed document now receives the small approved local RetraSell logo and plain
Powered by RetraSell footer automatically. Original D05 rationale remains historical.
This removes only print attribution choice; Support consent/PIN/financial approval
and authorization remain unchanged.

### Changed
Removed retired checkbox/event-choice logic from POS/Admin/EMS/Workshop and shared
normalization. The idempotent shared footer covers six builders, receipt/ticket
previews, shift output and direct queued printing, before existing image readiness,
height measurement and copies. Merchant terms, amounts, IDs, barcodes and reprint
markers remain. Refined merchant logo containment/padding and removed accent borders.
New Repair uses wide information/issue panels with the owner's full-width bottom
finance tile: labour/quote, centered payments, balance. Existing Admin repair detail
separates repair/history from finance/status/operations. Existing fields, draft state
and actions are retained; narrow layouts stack and actions stay reachable. Centered
Support with its single existing maximum-width rule; no Support logic changes.

### Validation
Only the focused M3 owner fixture, automatic print/unit comparisons, short existing
repair draft checks, source/artwork and JS/CSS syntax checks, plus one application
build. Exact results, four dialog geometries, Support alignment, logo variants, one
matched login comparison and real print-renderer height/copy evidence are recorded
in the M3 owner-acceptance archive. No broad M1/M2 matrix or benchmarks.

### Impact and gates
Local implementation/commits only, with [CF-Pages-Skip]. No push, CI dispatch, build
trigger at Cloudflare, manual deployment, Platform modification or hosted Supabase
operation. Backend/support-v7 unchanged. Existing retrabyo preview missing-variable
failure is separate provider configuration, not repaired here. Physical printer,
actual device keyboard, independent audit and final owner acceptance remain pending.
Do not publish until explicit owner authorization; production follows this branch.


## 2026-10-29 — live-review Support styling and Catalog action placement (local)
Branch: feature/shop-modernization-m3

### Purpose and changes
Owner screenshots showed that centering Support still differed from Billing/Settings.
Superseded the bounded-center presentation with full-workspace standard cards and
inherited workspace spacing. Moved the request heading into its form card and grouped
history/detail/refresh/pagination in a card; card headings use the shared h2 style.
The shared stylesheet changed only in the Support wrapper. Owner also requested
Catalog search above content in both tabs and Add Quick Item above the item list.
Passed the existing search-toolbar helper into the Catalog renderer and moved the
unchanged add action into its card header. Existing IDs, callbacks, fields, retry,
consent, access rules, filter state, paging and business operations are preserved.

### Validation and boundaries
Focused local Support/Billing style comparison at desktop/light and mobile/dark;
owner/manager/pending control signatures equal the published ancestor. Four real-entry
Catalog geometries pass; existing filters/clear/Add dialog work without business writes.
Selected escaping and protected-source/artwork checks, JS/CSS syntax and one build pass.
An initial fixture omitted client-shell; retained as invalid, corrected before accepting
desktop evidence. No broad suites, hosted Supabase, Platform, release or print changes.
No push/build trigger/deployment; these follow-up edits await publication authorization.
Independent review and owner final acceptance remain pending. Evidence is in the
existing M3 archive's 20261029-support-style and 20261029-catalog-placement folders.


## 2026-10-29 — consistent numbered pagination throughout Shop (local)
Branch: feature/shop-modernization-m3

Owner identified the same count-left/Previous-middle layout in multiple sections.
The shared pageControls used generic toolbar flex spacing and count-first markup.
Reordered only its presentation to Previous/count/Next and added authenticated,
shared three-column styling with equal side tracks, centered/wrapping summaries
and edge-aligned buttons. Support's separate pager opts into the same class.
Admin lists, POS lists/repair collection, Workshop and EMS callers inherit the fix.
No offsets, size/count calculations, read queries, callbacks, guards or disabled
conditions changed. Receipt detail's unnumbered document navigation is unchanged.

A selected boundary/action/order unit check and real-template browser geometry at
1280/320px pass: both pager types preserve left/center/right alignment, balanced
vertical positioning and no overflow. Existing Support control/consent comparisons
pass, as do syntax, protected-source/artwork boundary and the updated build.
No broad suites, hosted writes, Platform/backend/print changes, push or deployment.
This adds to the unpublished Support/Catalog refinements; owner publication,
independent review and final acceptance remain separate gates.


## 2026-10-29 — live pager asset skew and intrinsic receipt-preview width (local)
Branch: feature/shop-modernization-m3; baseline: 340994565f113e888abd9dfbf72d28eb7a44511f

Owner live findings M3-LV-01/02 were confirmed through read-only DOM/CSSOM inspection
of the existing POS tab. Pager markup was current but the fixed-URL branding CSS had
no pager rules (display:block); no cache layer was guessed or provider cache altered.
Receipt backdrop's implicit auto track shrank the dialog to 280px and paper to 238px.
Moved shared pager CSS into the content-hashed app stylesheet and removed retired
Support flex overrides. Added a scoped explicit backdrop track and 600px receipt/
ticket preview dialog with a scrollable body and fixed actions; paper max stays 380px.
Print builders, amounts, IDs, barcode/thermal logic, paging state/handlers and all
backend/Platform sources stay unchanged.

Focused actual-entry tests load built CSS while deliberately serving the observed
older branding asset: 12 pager contexts at desktop/mobile, both preview types and
byte-exact receipt/ticket print comparison pass. Syntax and one build pass. The first
run used an older-backend fixture without a pager; retained and corrected to v7 mode.
No broad tests, hosted operations, commit, push or deployment. Local evidence records
measurements and limits; publication, independent review and owner acceptance pending.


## 2026-10-29 — M3-IR-01 native KPI and receipt-detail activators (local)
Branch: feature/shop-modernization-m3; baseline: a77e751c55c017098eb9672defb58ad6eaba2ad1

Independent audit M3-IR-01 identified unfocusable clickable DIVs. Replaced Dashboard
KPI cards and only Receipt Archive's detail-opening region with type=button native
controls; preserved existing target/index/action attributes, permission filtering,
selection/loading guards and one delegated click path. Receipt controls have escaped
record-specific accessible names. Print/Reprint/Summary remain sibling actions,
not nested buttons. Scoped bundled-CSS resets preserve the original card/content
appearance and mobile wrapping; existing 3px keyboard focus applies. No key handler
or second navigation implementation was introduced.

Focused actual-entry Dashboard and Receipt journeys exercise Tab, Enter, Space and
pointer: one existing navigation/detail opening each, visible focus, zero submits,
neighbor print actions or writes. Selected old/new style/geometry matches at1280/390.
The first comparison caught a native-button font override; specificity was corrected,
then the focused check passed. Two builds total (initial plus corrective); syntax pass.
No broad suites, hosted operations, backend/Platform or protected-login changes.
Local Skip-marked commit only; no push. Status: locally corrected, pending independent
re-review. IR-02/03 and physical/device evidence remain separately tracked.


## 2026-10-29 — POS operator workspace and catalog backend candidate
Branch: feature/pos-operator-overhaul; baseline 784c2ce7ef3d584294b26ad3b48ce8cce253b2b7

### Purpose and changed
Reorganized POS beneath the existing header/actions into adjacent Catalog/Inventory, a horizontal expandable open-repair queue, and a right Cart. Compact paging retains server bounds/counts; Catalog search has revision guards. Stock SKU matching now stays authoritative in its backend query. Stable cart keys, inputs and all financial/PIN/receipt command behavior remain. The root-only lazy queue uses Pending/In Progress/Ready without accounting-balance inclusion; complete selected families enter existing guarded collection.

Catalog retains Quick Items and Components, adding semantic icon assignment and nested Device Brands. Additive migration 20261029173151 adds nullable icon IDs and isolated Shop brand records, normalized uniqueness, non-destructive defaults, canonical role/module/lifecycle RLS and restrictive Support consent. Existing guarded bootstrap/probe boundaries are extended without a new definer API. The queue gains a matching partial index and bounded DDL timeout. Repair intake uses searchable native choices plus unchanged manual text; failed choices do not block manual entry. Existing tickets/ledger rows are never rewritten.

### Decisions and validation
The supplied 36-entry registry remains a proposal: exact bytes imported, empty trusted artwork map, safe category/terminal fallbacks, no SVG fabrication or external loading. Backend capability gating preserves older Shop projections/forms. Focused real-entry synthetic browser checks pass for 320–1440px geometry, lazy queue/status exclusion, stable cart/input, paging/search, icon persistence and brand administration/manual draft retention. SQL uses disposable native PostgreSQL with actual Managed/BYO envelopes, denied roles, valid/revoked Support consent, atomic rollback/replay and historical preservation; exact results/failures are in the external pos overhaul archive. Eight focused registry/draft/checkout unit checks pass. Legacy upgrade tests that require approved source cannot execute their transport paths from this unpromoted candidate; this guard remains intentional and is separately rehearsed/documented.

### Impact and gates
No hosted mutation, migration, Edge deployment, customer upgrade, release promotion or merge. Preserve support-v7 c4d210d0… / 39 migrations / 7 functions / 9 requirements and older packages. Final candidate generation follows this committed backend source through the official builder/validator; no active customer selector changes. Artwork approval/intake, independent review, owner visual acceptance, hosted BYO verification in the different account and physical printer remain separate gates. Both PRs stay Draft/Open. Every feature commit/push uses the verified [CF-Pages-Skip] prefix.


## 2026-10-30 — approved SVG V1.0.1 intake and local integration
Branch: feature/pos-operator-overhaul

Owner delivered final artwork and authorized integration. Independently verified the latest 45-entry ZIP CRC/path inventory, original registry digest 0924786e… and all 36 SVG bytes against both source manifests. Strict XML allow-list and local source equality pass. Copied only production SVGs/manifest; Codex 1 workspace unchanged. Frozen trusted literal renderers replace temporary placeholders, preserve stable IDs/aliases/fallbacks and inherit currentColor through decorative nonfocusable inline SVG wrappers with adjacent text. Raw production bytes retain Git attributes; no runtime dependency, parser or external icon loading.

Four focused resolver/manifest groups and actual Shop light/dark 24/32px rendering for all 36 assets pass; local Catalog/Cart/queue captures and one post-intake build pass. Full known-brand name artwork is revision 1.0.1. Exact hashes, screenshots, checks and exceptions are in the existing pos overhaul evidence. Registry approval/artwork intake gates are now complete; independent review, owner app acceptance, hosted verification and separately authorized promotion/merge/deployment remain. No backend-affecting changes: support-v8 fingerprint af64c402… (40/7/10), source 5a9fca79… and active support-v7 remain unchanged.


## 2026-10-30 — POS-AUD-01/02/03 local frontend corrections
Branch: feature/pos-operator-overhaul; audited baseline 7f1aae83c2a17b48296e31da1975ba4d4d4ee062

### Purpose and changes
Reproduced all three independent P2 failures using the auditor's original isolated actual-entry harness: null price crashes rendering, Cart increment reenables outgoing Catalog rows during debounce, and selected variant loses accessory.cable. Added a shared price decoding boundary for preview/activation and defensive Admin labels; invalid values cannot become payable zero amounts, while actual finite nonnegative stored numbers retain their values. No stored record rewrite or new financial calculation.

Catalog actionability now requires accepted query/revision and ready state. Input invalidates state immediately; one cancellable debounce timer and existing view/session/load guards reject stale responses, including entry reads completing after a search. Cart updates/removal cannot restore stale actionability. Selection uses the accepted record and captures its icon ID with prices/identity/current view through the picker; price/variant/quantity and existing Cart keys remain. Existing Inventory selector was assessed without unrelated refactoring. Corrected current artwork-status documentation while retaining original checkpoints externally.

### Validation and gates
Two targeted price unit cases and six focused actual-entry browser assertion groups pass, covering the three fixes and combined legacy/search/Cart/variant journey, stale/failure/clear/debounce, focus/caret/synthetic composition retention, session/navigation departure and modal rerenders. No business writes or non-read RPCs occur. Relevant JS syntax checks and one final normal frontend build pass. Original before-fix failures and exact commands/results remain in the existing pos overhaul audit-corrections folder. This is author local evidence, not independent closure or real-device IME certification.

### Impact and Git
One local [CF-Pages-Skip] correction commit only; do not push without separate owner authorization. Both existing PRs remain Draft/Open at audited remote heads. Platform, backend source/requirements/selectors, support-v8 af64c402… (40/7/10), active v7, all approved SVG bytes/resolver, protected login/print and canonical checkout/repair command APIs remain unchanged. No migration, release regeneration, hosted mutation, deployment, promotion or merge. Independent NOT READY verdict remains historical authority; three fixes await delta re-review and owner acceptance.


## 2026-10-30 — support-v8 promotion attempt blocked before publication

Owner authorized source promotion for hosted acceptance, not independent final release certification. Local draft selectors/catalogs now agree on exact support-v8 af64c402ff72fb4ef4d72b892786c53a000d45ecb4045c4f9a7e89db51cf5dd4 (40 migrations / 7 functions / 10 requirements; backend source 5a9fca79ee24d6902cbdbcbfe5a0759454025e04). v7 remains supported with optional successor v8; immutable packages and customer pins are unchanged. The existing promotion utility validates a prospective selector through the strict parity gate before writing. Current-state fixtures account for the v8 migration delta without weakening customer preflight.

Ordinary paired source parity and approved customer preflight pass. Final successful focused results across reruns: 20 Platform / 8 Shop; verified v7-to-v8 plan is one migration and zero functions. Original failed attempts and corrected stale fixture/launch-sequencing observations remain in external evidence. These are local/mocked checks, not hosted upgrades.

Read-only hosted inspection found Platform platform_private.approved_shop_releases has no v8 entry and still freshly approves v7. Live upgrade preparation requires a supported fresh-approved target; Managed pinning delegates to a function requiring exact hosted catalog membership. Source currently has the v7 approval migration but no v8 activation migration. Bundle redeployment alone cannot promote that table. Per the owner stop-on-approval-failure instruction, no commit/push was performed and no forward migration was added/applied. Local draft changes are intentionally preserved uncommitted. Resolve and authorize the missing catalog-promotion step before continuing.

Platform local/remote/PR7 stays 8eabe3700290cf56220b2c56474dae45e2285f70; Shop local/remote/PR5 stays f7b217a131adf7e01e1c851dda4bb416317433ff. Both PRs remain Draft/Open/unmerged targeting development. Exactly inventory5 (JWT true), upgrade4 and provision29 (JWT false) need later metadata bundle redeployment to Platform ukbhyerxshteyetwomqy. Provider GET confirms the intended two Shop and one Platform production branches, environment-key presence and rollback IDs; third Shop project is excluded. No hosted write, deployment, build trigger, merge or customer upgrade. NOT READY audit history and independent delta review remain. Detailed evidence: external pos overhaul/SUPPORT-V8-PROMOTION-BLOCKED-2026-10-30.md and support-v8-promotion-2026-10-30/.


## 2026-10-30 — architecture-safe support-v8 source approval correction
Branch: feature/pos-operator-overhaul

Before editing, recorded the source-to-package and four-workflow architecture checkpoint in external pos overhaul/support-v8-approval-correction-2026-10-30. Shop remains authoritative; the immutable v8 artifact is byte-identical, reconstructed in memory as af64c402ff72fb4ef4d72b892786c53a000d45ecb4045c4f9a7e89db51cf5dd4 (40 migrations / 7 functions / 10 requirements; source 5a9fca79ee24d6902cbdbcbfe5a0759454025e04).

Added only Platform control-plane migration 20261030141736_promote_support_v8.sql through native CLI migration new. It checks historical hashes/support/protocol policy and sole expected fresh release, rejects conflicting v8 or unknown catalog entries, transactionally registers exact v8 and verifies the complete resulting catalog. Supported v7 retains optional successor v8; unsupported v5 and all historical fingerprints remain. No Shop SQL is copied into Platform migrations; the packaged Shop migration 20261029173151 remains the sole v7-to-v8 component delta, with zero function changes. Prior prepared metadata, validator/utility and test changes are preserved. Current operator guidance now distinguishes source approval from pending hosted activation. CI uses ordinary approved parity and compatible immutable peer snapshots.

Focused results: 20 release/upgrade/fleet checks, three actual Managed engine continuity checks, 15 customer preflight/clearance/guided BYO checks and four SQL promotion assertions pass. SQL uses the actual complete Platform forward schema in the existing isolated PostgreSQL harness, with documented crypto/Vault substitutes; verifies catalog/JSON equality, idempotency, unchanged actual pins/jobs/journals/audits/authority definitions/RLS, conflict rejection and final-failure atomic rollback. Both ordinary paired gates and exact customer preflight pass. The initial test-file generation syntax error and previous interrupted-attempt logs remain separate. No broad suite or frontend build.

Linked project ukbhyerxshteyetwomqy verified; read-only inventory matches 29 historical migrations, with only 20261030141736 pending. Explicit --dry-run --skip-vault lists only that approval migration, no seeds or roles, and applies no SQL. Three Platform bundles still require coordinated later redeployment: inventory JWT true, upgrade/provision JWT false. The existing twelve-stage fresh BYO and ten-stage controlled upgrade workflows, private journals, canonical Master approval, dispatch/unknown-outcome fences, source checksums, customer authority, pairing and bootstrap boundaries remain unchanged. No hosted activation, customer upgrade, provider change, build trigger, merge or branch deletion.

This is owner-authorized hosted acceptance preparation, not independently certified final release acceptance. Preserve the blocked report and original NOT READY audit; frontend independent delta review and hosted acceptance remain pending. Source publication uses [CF-Pages-Skip] on the existing branches; exact final SHAs, clean-tree/PR parity and provider skips are recorded externally.

CI pin completion: the Platform promotion pins compatible Shop source f2be0cc54e6bc20dfa6d0688cc86f0129b23670f. This small nonempty Shop follow-up pins Platform b17daaee492442972f5f68b74501f1a2d758a691 and removes the candidate-only command. Sequencing avoids circular immutable commit references; no temporary-branch dependency or runtime/source release change. All three source-publication commits carry [CF-Pages-Skip].


## 2026-10-31 — focused owner POS workspace UI correction
Branch: feature/pos-operator-overhaul; starting local/remote/PR5 19b97640775e0e3ec51c81922ba121e4e5351f95, clean.

Removed the redundant Catalog label: its sr-only class had no CSS definition. Search retains an explicit accessible name, placeholder and existing debounce/current-result guards. Replaced custom-item details/summary with an always-visible labeled compact responsive section below pagination; unchanged input IDs and financial handler preserve existing validation, Cart semantics and draft nodes.

Catalog now expands only when Inventory is disabled or a current successful unfiltered bounded sellable-stock read has exact count zero. Accepted stock query/revision is invalidated during loading and input changes; entry results cannot overwrite newer accepted searches. Nonempty, filtered-empty, loading, failed and unknown reads retain Inventory and retry behavior. No additional query, reset, module disable or data deletion; authoritative updates restore dual panels. Cart markup/totals, checkout, custom financial handler, command APIs, queue placement and theme tokens are unchanged.

Validation: 11 actual-entry compatibility groups, nine operator groups, six prior audit groups and eight icon/price/checkout units pass. Responsive checks cover six requested widths in both themes; screenshots inspected. A first harness attempt incorrectly required node identity across SPA route remount; the corrected test invokes the existing read-retry handler and verifies actual POS refresh preservation. Both attempts retained externally. One local production build is checked before publication; no broad suite or hosted financial record.

Five focused files only: POS, CSS, compatibility harness, workspace guide and this history. Backend sources/releases/manifests and all 36 SVGs remain unchanged; Platform and BYO tooling untouched. Owner reports Managed v8 complete and BYO on hold; neither is acted on. Normal [CF-Pages-Skip] commit/push to existing PR5; exact SHA and provider skip evidence are in external pos overhaul/focused-pos-ui-2026-10-31. PR remains Draft/Open/unmerged. Hosted redeployment and owner visual acceptance require the next separate authorization.


## 2026-10-31 — expanded POS selectors and owner-authorized frontend publication
Branch: feature/pos-operator-overhaul; preceding focused correction b7e69d181a7492aea8a55ef17d5372de6c5da2f9 was normally pushed and provider-confirmed skipped.

Owner requested an expanded popup from the center of both Catalog/Inventory paging arrows, then explicitly authorized a non-skip push to trigger the connected Shop production builds. Added a POS-only paging presenter and a wide dialog reusing the current item renderers, accepted search/page state and unchanged Cart add handlers. Opening performs no query; existing 25/24 page limits, exact counts, stale/session guards and inventory-module access remain. Variant selection/cancel returns to the expanded Catalog; persistent search is not treated as an unsaved financial draft. Existing dialog ownership, focus trap, Escape and mobile viewport behavior remain; no shared dialog authority/financial logic change.

Focused final checks cover 15 compatibility groups (including both expanded selectors at six widths in light/dark), nine original operator groups, six prior audit groups and eight icon/price/checkout units. Actual-entry loopback tests use only synthetic SDK data and block external operations. The first expanded test exposed an intrinsic grid track limiting popup width; the scoped backdrop now supplies a full-width grid track. Screenshots prompted heading/close spacing and removal of a duplicate popup close action; the final checks pass. Logs/captures and the earlier SPA-remount harness failure are retained externally. One final local build is checked before publication.

Cart structure/totals, custom/stock financial handlers, approved 36 SVGs, backend/release artifacts, bounded resource queries, provisioning and BYO tooling are unchanged. No real transaction or hosted backend action. Publish the substantive frontend commit normally without [CF-Pages-Skip] per the later explicit owner instruction; verify both intended Shop production mappings/build outcomes and PR5 Draft/Open/unmerged. No empty trigger, merge or branch change. Exact source/deployment IDs and remaining owner acceptance are recorded in the external evidence.


## 2026-10-31 — fixed selector frames, adaptive sparse tiles and close target
Branch: feature/pos-operator-overhaul; clean starting local/remote/PR5 c48c6e67309691c162df0c6bc856944099ecab0b.

Owner screenshots exposed content-dependent popup height and a tiny X. A later branding font reset overrode the close glyph size. Selector-only CSS now fixes both expanded frames to the maximum safe visual viewport height at the existing desktop width, anchors footer/status and scrolls the item area. Sparse results (up to four) use slightly larger tiles; denser pages return to the previous grid density. Compact lists share stable height, heading/search/price presentation and aligned paging; max-content rows prevent dense-item compression, and a stable scrollbar gutter prevents width jumps. Other modal/Cart styling and all event/financial handlers are unchanged. The close control has a 28px glyph, 44px target and reserved heading space.

Seventeen actual-entry compatibility groups pass, including zero/nonempty/filter/loading/stale read safety, both selector frame comparisons across result counts, adaptive expanded-only tiles, compact equality and repeated corner/center X actions after searches, refreshes and selection. All six widths/light-dark and existing variant/Cart paths remain covered. Eight icon/price/checkout units pass; final local build checked before publication. First sizing runs caught scrollbar-width movement and dense CSS grid row compression; exact failures and corrected captures are retained separately in external pos overhaul/pos-selector-sizing-2026-10-31. No broad backend suite or real transaction.

Source comparison preserves POS controllers, Cart/checkout/custom/stock financial handlers, dialog event guards, bounded resource queries, 36 SVGs, backend packages/manifests/fingerprints, Platform and BYO tooling. Publish a substantive non-skip commit normally to the existing PR so the authorized Managed build runs; no empty trigger, force push, merge or provider setting change. Do not retry BYO: the owner previously chose to leave that frontend unchanged. Final source/PR parity and actual provider outcomes are recorded externally; owner visual acceptance remains pending.


## 2026-10-31 — owner icon settings, symmetric empty selectors and preview corrections
Branch: feature/pos-operator-overhaul; starting local/remote/PR5 8bc0848cb3df36b259ed6aa0809594d83de8d366. The owner authorized substantive non-skip Shop publication and reiterated the established backend delivery routes; BYO frontend retry remains declined.

Confirmed empty, current unfiltered Catalog now yields the product width to Inventory, with custom entry retained below. Loading/error/filtered-empty and both-empty cases remain explicit; keyed panel/custom nodes preserve drafts through reordering. The inventory deletion FK protects stock/sales history. Keep RESTRICT and its authoritative failure; replace raw constraint details with history/Adjust Stock guidance. No cascading deletion, ledger change or inventory quantity change.

Shift Stats reuses the invoice preview frame and scrolling body without changing report/print data. Account buttons in POS/Admin/Workshop use a local monochrome SVG with official muted tokens (#A9B7D0 dark / #526079 light). The account badge remains the signed-in app_users.display_name; Admin appends role. Shop identity independently uses shop_config.shop_name beside the logo. Explained that distinction; no identity/role/name mutation.

Added dedicated Settings > Icons for Owner/consented Support: 36 local previews, editable icon labels and category-constrained offerings for Catalog, repair components, Inventory and device brands. This changes picker labels, never actual item names or registry IDs/aliases/artwork. Native details/radio choices scroll inside forms; selected hidden/unknown assignments remain retained and Generic fallback stays offered. Responsive Catalog variant rows prevent small-screen overflow. Labels are escaped. Existing v8 defaults remain usable; unsupported saving is visibly disabled without querying a nonexistent table.

New Shop migration 20261030233527_icon_label_preferences owns canonical per-Shop preferences, exact registry IDs, constrained labels/contexts, active-role/lifecycle RLS, owner-only writes and restrictive Support consent. Existing guarded bootstrap/probe boundaries advertise optional capability; private/session reset clears presentation preferences. A single guarded upsert saves all rows atomically and confirms the selected result. Requirements map both Managed/BYO fresh and existing routes; shared optional capability classification preserves healthy historical v8. Stage a new immutable support-v9 candidate, never rewrite v8, change active selection or directly apply hosted SQL. Actual release packaging/source hashes are recorded by the subsequent integration commit and external report.

Local focused evidence: 21 actual-entry browser groups, nine asset/preferences/price/delete checks and a normal build pass. Four native PostgreSQL paths apply actual Managed/BYO envelopes: pristine fresh and seeded v7-to-v8-to-preferences upgrades, failed-DDL rollback with no ledger residue, replay retention, staff/anon/lifecycle/revoked Support denial and consented Support access. Initial browser runs exposed existing variant overflow and radio sizing; failures and corrected captures remain external. No hosted Auth/financial operation or independent acceptance claim. A wider milestone report covers the earlier search label fix through these changes in pos overhaul. Controlled candidate release/approval and hosted upgrades remain separate gates; both PRs stay Draft/Open, no merge.


## 2026-10-31 — Quick Item visual revision and v9 package handoff
Owner rejected the first chooser preview. Replaced the narrow side column with full-width Item Name and searchable icon choices in a responsive 640px dialog, three even desktop columns, consistent selected/keyboard states and a clear close target. Catalog list headers now use fixed icon/name/action columns. The original dialog grid's intrinsic track limited the first width attempt; a scoped full-width track resolves it. Focused browser geometry checks confirm matching field widths/heights, aligned list columns, no-result filtering and mobile containment; corrected previews are retained under owner-corrections-2026-10-31/chooser-final. The preceding combined 21 browser groups and nine original operator groups pass; the final visual revision's affected checks and build pass again.

The versioned generated v9 fingerprint is 60f0abe1ee5c5d1b7e2410a58acffa158a4514edb45c20f6f704745008c7d367, 41 migrations / 7 functions / 11 requirements, from committed backend 46aa53af323ac495e0fc5fcb1fd81de6663cf9d8. The CLI output argument is positional; an initial incorrect flag wrote a local file subsequently moved to the intended candidate path and hash-verified. Candidate/source parity and five release-policy/planner checks pass. Catalog/registry entries are source-only unapproved; active v8, approved customer manifest and all earlier packages/pins remain unchanged. docs/ICON_SETTINGS_UPGRADE.md maps both fresh and existing routes and the separate approval gate. Final CI uses compatible immutable paired snapshots and candidate parity, not a false approved-source preflight. The Shop frontend publication is non-skip; Platform candidate publication is source-only and must not trigger a Platform production release. Exact final refs/builds and remaining gates are in the consolidated external report.


## 2026-10-31 — support-v9 source promotion preparation, no hosted mutation
Owner explicitly authorized source-only promotion of exact v9 for hosted acceptance, with both publication messages carrying CF-Pages-Skip. Starting Shop 607d1f8912d16fefad6e95d52d3bdbc85ff3b4ff / Platform 90192296fe94b08746e219c09b37c09948a786a8; existing feature branches and Draft PRs preserved. Fresh focused source/SQL re-review confirms exact registry IDs/contexts, owner/consented Support writes, denied staff/anon/lifecycle access, atomic preferences, escaped labels/local SVGs, retained assignments and old-backend defaults. This is not independent final release certification.

The immutable package remains 60f0abe1ee5c5d1b7e2410a58acffa158a4514edb45c20f6f704745008c7d367 (41/7/11), raw e6b534245effbc47918758f4d686413a53610d87b05090a31ec8792a8c5eaac8, source 46aa53af323ac495e0fc5fcb1fd81de6663cf9d8. No package regeneration or Shop SQL edit. Both source catalogs/manifest and active pointer select approved v9; supported v8/history/pins remain. Platform CLI created only 20261031001127_promote_support_v9.sql (853ac3c9fbf0db1b3b55aa59c6e15ee22c107d2e956476562588a27592bef088): metadata-only table lock, exact pre/post-catalog admission, conflict denial, supported optional successors and transactional final equality. New Shop SQL is not copied into Platform migrations.

Four native Managed/BYO fresh/upgrade security paths and atomic preference rejection pass; four approval SQL checks prove idempotency, conflicts, final-failure rollback and unchanged actual pins/jobs/journals/audits/authority definitions. Twenty focused policy/fleet/executor checks pass after updating historical fixed-v8 test expectations; no runtime guard was relaxed. Both ordinary exact-source parity gates and v9 customer preflight pass. Linked Platform ukbhyerxshteyetwomqy has 30 synchronized historical migrations; dry-run lists only the new approval migration with no seeds/roles. Initial incomplete local metadata editing was rejected by source validation before selector/hosted action; evidence distinguishes that from final success.

All four provisioning/upgrade paths retain existing authority, stage journals, customer clearance and unknown-outcome fences. Verified v8-to-v9 is one migration/zero functions. Future activation requires the one Platform metadata migration plus inventory JWT true / upgrade and provision JWT false deployments, then owner-controlled Client #2 application upgrade. Existing BYO Client #1 is excluded. Owner also requested a wider variant picker: a scoped 600px frame changes width only; 21 actual-entry groups confirm unchanged height and current behavior. No custom-entry relocation was implemented; shared-bar recommendation awaits owner preference. No hosted SQL, Edge/frontend rollout, upgrade, provider change or merge. Final publication/dry-run and staged exact PowerShell are recorded externally; independent/hosted acceptance stays pending.


## 2026-10-31 — shared custom sale bar and PIN-authorized permanent Inventory retirement
Owner approved the shared Custom item bar above Catalog/Inventory and requested simplified stock removal and permanent retirement while preserving sales/history, PIN protection and all four provisioning routes. V9 is already immutable/published: keep its 60f0abe1ee5c5d1b7e2410a58acffa158a4514edb45c20f6f704745008c7d367 package and Shop migration untouched; prepare additive support-v10 instead. Publication follows the last source-only task: skip-marked commits, existing feature branches/PRs, no hosted activation or deployment.

Moved the original keyed Custom item inputs/financial handler into one shared responsive bar; empty Catalog/Inventory layout still uses accepted exact counts, with no duplicate form in expanded selectors. Existing draft, Cart, search and variant behavior remains. New-capability Inventory offers Manage stock (Add, Remove, Set exact quantity using whole positive values), explicit permanent Retire, and bounded read-only retired history. Legacy backends keep their previous form and no unsupported column/RPC reads. Retired historical returns are marked non-sellable; the financial return RPC remains unchanged.

New forward Shop migration 20261031003158_inventory_permanent_retirement.sql adds irreversible retirement metadata, private immutable request/approval journal, dedicated inventory PIN purpose and canonical stock RPC. One-time purpose/actor/request/payload-bound approval, global request lock, item row lock, reviewed quantity and nonnegative range enforce atomic intent/replay and concurrent safety. Positive stock removals use existing immutable movement semantics; zero-stock retirement still records its PIN-linked operation. The old adjustment RPC delegates to the same protected boundary; direct browser DELETE is revoked, quantity writes remain guarded, and retired rows cannot be edited/restocked/reactivated/deleted. Actor/module/lifecycle/Support consent and private ACLs remain canonical. PIN cooldown/expiry and all prior purposes survive; only verify-pin's purpose allowlist changes. No historical sale, payment, stock movement, item assignment, PIN hash, customer pin or journal is rewritten.

Client requests retain original unconfirmed intent/UUID, reject conflicting retries, restore pending drafts, and suppress delayed feedback after departure/private reset. PIN cancel restores the stock form; known rollback errors keep its draft, and authoritative reads/quantity checks prevent silent stale changes. Optional capability/default and bounded active/history reads preserve healthy older installations. Requirements map the new SQL and exact verify-pin package into both Managed/BYO fresh and existing controlled upgrade plans; source hashes are recorded by the subsequent package/catalog commit.

Native PostgreSQL four-path fresh/v9-upgrade checks pass actual Managed/BYO envelopes, PIN absence/expiry/one-use, role/consent/module/lifecycle/private ACL denials, direct-write/deletion/reactivation protection, same-request concurrency once, competing stale rejection, atomic movement-failure rollback and replay. Original sale/payment snapshots survive retirement; a non-sellable historical refund succeeds, while restocking a retired SKU rolls back. Eleven focused unit checks, 21 existing actual-entry compatibility groups, five new stock/bar browser groups and normal frontend build pass. Initial failures were an isolated inactive-status fixture value and a test missing the existing success acknowledgment; retained evidence distinguishes them. Synthetic/local verification is not hosted Auth or independent final acceptance. Exact migration/package hashes, controlled plans, pending Platform metadata chain and owner activation instructions are recorded externally under pos overhaul/inventory-retirement-2026-10-31.


## 2026-10-31 — support-v10 immutable source promotion and activation preparation
Owner requested publication/preparation for permanent Inventory retirement through established fresh and existing routes. Kept frozen v9 unchanged and selected additive v10 in both source catalogs, active pointer and customer manifest. Fingerprint 26885074b7035280985f5f33c42b395541fccbffe3fde94ed589969fd913b305; backend source f78c5342fbc568a45feccdf5947fb49c774e474f; 42 migrations / 7 functions / 12 requirements. V9 upgrade delta is one SQL and verify-pin; v8 adds the v9 icon migration too. Existing historical packages/pins/jobs/journals stay protected. The new Platform metadata migration accepts only exact complete v9 or already-promoted v10 state, transactionally rejecting conflicts and rolling back failed final invariants. No Shop SQL is duplicated Platform-side.

Fresh Managed/BYO and existing controlled/customer-owned upgrade plans include the same requirement and PIN package. Optional older-capability classification preserves healthy historical releases. Four native SQL paths and 24 focused Platform promotion/planner/fleet checks pass, including replay, rollback, protected records, wrong-source denial and continuity. Final browser check adds navigation/authority departure while an approved request is pending; deferred callback failures are caught without stale UI feedback. Six new browser groups and 21 existing compatibility groups pass; local evidence does not certify hosted Auth or independent acceptance.

Read-only preparation shows the previously published v9 metadata approval and new v10 approval both pending over hosted v8. Separate owner activation must apply only this ordered chain, redeploy three Platform release consumers with unchanged JWT settings, and coordinate the new Shop frontend BEFORE a real v10 upgrade: old stock UI cannot request the new inventory PIN and would fail closed. Source publication uses skip markers; no frontend is deployed here. The existing Client 2 app route must retain the original exact job/plan; BYO Client 1 stays excluded. Docs and external evidence include exact hashes, final source/CI/provider verification and staged owner instructions. No hosted migration, Edge/frontend deployment, customer upgrade, provider change or merge; independent/hosted gates remain pending.


## 2026-10-31 — Device Brand helper input-row alignment
Branch: feature/pos-operator-overhaul (Shop PR #5 to development). Owner clarified the helper must remain on the right on desktop and align vertically with the input rectangle, not the label. Grouped the existing Brand field/datalist/helper in one scoped subgrid; the label keeps its own track and helper shares the input track, with subdued wrapping text and no offset, spacer or bordered box. Existing mobile breakpoint stacks the helper after the field. Input name/value/list/required, helper ID/aria relationship and wording are unchanged; New and Modify use the same renderer.

Focused actual-entry synthetic browser regression reproduces the original 12.75px center mismatch and passes eight corrected New/Modify, message/theme/desktop/mobile geometries (desktop mismatch 0px). Surrounding field order, datalist/custom brand, Tab order and draft/component round-trip pass without database writes. Normal frontend build and final diff check pass. Backend/migrations/functions/manifests, immutable v8-v10 artifacts and Platform source are unchanged.

Owner authorizes normal non-skip publication to both development Shop Pages integrations. Exact commit, provider results and evidence are recorded externally in pos overhaul/repair-brand-alignment-2026-10-31. Hosted visual approval remains mandatory before any merge or feature-branch retirement. No Cloudflare branch/configuration change, backend action, Platform mutation, merge or deletion is part of Phase A.


## 2026-10-31 — Repair helper cached-stylesheet correction
Owner's hosted screenshot rejected the first publication: the Brand helper appeared underneath and Device Model moved to the right. Reproduced that exact arrangement by combining the new renderer with the cached pre-correction public branding stylesheet. The initial fresh-style browser check missed this mixed-version case. Restored the original branding stylesheet and 16px helper size. Moved only the scoped input-row alignment rules into the hashed app CSS, with specificity that also overrides a cached first-fix stylesheet; no modal/customer/financial/keyboard logic change.

Focused New/Modify, normal/unavailable, desktop/mobile and light/dark geometry passes with both cached stylesheet versions deliberately retained (eight geometries each; desktop center delta 0px, original text size retained). Draft/component/custom brand, datalist and Tab checks still pass with zero database writes. Normal frontend build and diff checks pass. Normal non-skip publication updates both authorized Shop frontends; exact resulting commit/deployments and initial failure remain external in repair-brand-alignment-2026-10-31. Backend and immutable releases remain unchanged, Platform untouched. Owner approval still pending; no merge, branch transition or retirement.
