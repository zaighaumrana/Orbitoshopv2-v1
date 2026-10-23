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
