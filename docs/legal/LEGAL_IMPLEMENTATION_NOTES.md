# Legal / Help implementation notes — INTERNAL

> Repository status update — 2026-10-04: Legal work was later committed (b0ba811/f966f72), integrated into developmentv2 (d626dcf) and pushed. Historical no-commit/merge statements below describe their original tasks. This is not legal publication or professional approval. Local HEAD and the live GitHub `feature/platform-overhaul-v1` head match at `68885d4`. Current integration target is `developmentv2`. Preserve the original validation/deployment evidence below as a point-in-time record; Git does not prove hosted deployment. See [engineering history](../../ENGINEERING_HISTORY.md) for the owner-reported hosted checkpoint and pending smoke gate.

Ported 2026-10-02 from the legal donor into feature/legal-finalization-v2 after Onboarding V2. Earlier donor work was prepared 2026-09-27 and updated 2026-09-29. Current release checklist: [LEGAL_FINALIZATION_GUIDE.md](../internal/LEGAL_FINALIZATION_GUIDE.md). Historical research below is not lawyer review or a promise to international customers.

## Status and publication blocker

IMPLEMENTED: canonical Markdown documents rendered by a separate public Vite entry, centralized metadata/company placeholders and provider register, Account Help links (no login document links), Owner Settings section, Owner acceptance gate, additive private SQL storage and restricted RPCs.

DOCUMENTED: actual local data inventory, Platform-bound payloads, role/workflow guide, retention/processing limitations and research sources below.

NEEDS LEGAL REVIEW: all contractual language, especially the requested Parent Company / Holding Company relationship for a sole proprietorship, liability/mandatory carve-outs, applicable law, provincial statutory protections, employment data, retention and vendor notice mechanisms. Initial drafts target Pakistan business customers; foreign-market clauses were moved out of contractual promises into future-review guidance. These drafts have not been reviewed by a lawyer.

CONFIRMED BUSINESS DECISIONS: RetraSell contracting entity, Sole Proprietor; product RetraSell POS; Ground Zero, Hospital Road, Gujranwala, Punjab, Pakistan; Pakistan law/Gujranwala jurisdiction subject to mandatory law; shared support/legal/privacy mailbox ranazaighaum@gmail.com and phone +92-552139051; client-specific pricing/refunds; immediate invoice due date unless written terms differ; 3 Working Days grace/ordinary notice, Monday-Friday excluding Punjab public holidays; 30-day request window for available service data. No separate backup-retention guarantee, nonexistent-data recovery promise, monetary cap or numeric SLA. Registration/NTN are intentionally absent from customer copy, metadata and readiness. Terms/Privacy/DPA are 1.0 effective 2026-10-03, revision 2026-10-03.1. Professional legal/provider review remains pending; no publication or production acceptance is authorized.

## Publication and placeholder classification

The already-applied 20261002015159_legal_acceptance.sql creates legal_policy.published boolean NOT NULL DEFAULT false and is unchanged. The new forward migration 20261002071259_legal_policy_metadata.sql updates only policy revision/versions to match the confirmed metadata and explicitly retains published=false. It is not applied to a hosted database in this task. RPC bodies, grants, RLS and evidence protections remain unchanged. Only a separately reviewed server-side forward migration/configuration may publish. Browser roles cannot write either private table. accept_legal_terms checks publication under the same policy lock as version validation and rejects unpublished acceptance. get_legal_status includes published; only an explicit false bypasses the Owner gate (unknown/network error does not imply unpublished).

The public get_legal_publication RPC is read-only and returns publication/version metadata only, never Shop identity, users or acceptance evidence. The public reader redirects unpublished/unfinished legal URLs to Help before rendering contractual content; it does not show a large finalization page. Contract links/versions are hidden until publication, bundled versions and required configuration agree. Help navigation is separate and remains readable regardless of publication. A failed public lookup never renders unfinished legal copy. No localStorage publication flag exists.

Required before publication: resolved metadata.requiredCompanyFields, matching Terms/Privacy/DPA versions and effective dates, a complete reviewed provider schedule and professional legal approval. Shared support/legal/privacy email is intentional and accepted by readiness. Registration/NTN, monetary-cap and fixed-notice placeholders are not required or rendered. subprocessorScheduleReviewed remains false and is a presentation/release check, not server publication authority. Unknown provider regions and legal/contractual roles remain explicit rather than invented.

Optional/conditional: DPO, EU_REP, UK_REP. Unconfigured values render neutral contact wording, never literal placeholders or an implied appointment. Determine legal applicability before publication and fill required appointments when applicable.

Public product/short names come only from src/config/brand.js: RetraSell POS / RetraSell. Legal metadata has no independent product branding fields. ENTITY is the confirmed RetraSell contracting name, matching LEGAL_ENTITY_NAME. ABCD Ventures remains plain-text project attribution with the exact requested Parent Company (Holding Company) sentence in Terms, not the contracting entity or a fake website link. That relationship requires professional review. Internal notes are not imported by customer navigation.

Acceptance additionally rejects null, empty and all-whitespace Owner names, with a table CHECK preventing blank accepted_name. Identity, Shop, exact versions and accepted_at remain server-derived. No existing RLS or business behavior was changed.

Connectivity copy distinguishes the Shop's own backend (needed for transactions) from the separate Platform. Evidence: usage adapter catches delivery errors; bridge outbox delivery occurs outside financial transactions; Support verification explicitly contacts Platform Auth. No general offline mode is promised.

The global Privacy Notice now uses applicable-law complaint timeframes. The previously researched UK 30-day acknowledgment requirement remains an operational/legal-review item only; see the ICO June 2026 reference below. No new legal claim was introduced.

DPA Annex headings use ASCII hyphens to avoid dash-decoding artifacts. UTF-8 scans of customer legal documents found no remaining mojibake/replacement characters.

NEEDS ENGINEERING / OPERATIONS: no comprehensive self-service data-subject export/erasure, retention scheduler, legal-hold workflow, verified backup expiry, vendor-change notification automation, or privacy complaint case-management process was found. Assign accountable staff/processes, especially before EU/UK/US launches. The new legal acceptance feature does not solve those gaps.

## Canonical content and UI

- docs/legal/TERMS_OF_SERVICE.md, PRIVACY_NOTICE.md and DATA_PROCESSING_ADDENDUM.md are the legal copy source.
- docs/user-guide/ORBITOSHOP_USER_GUIDE.md and QUICK_START_GUIDE.md are the guide copy source.
- src/legal/page.js imports these exact files as Vite raw content. No independently maintained frontend copy.
- metadata.json is the central title/slug/version/effective-date/required-revision and company substitution source. Markdown tokens such as {{ENTITY}} are template substitutions for the confirmed centralized values, not unfinished business decisions.
- subprocessors.json is the maintainable infrastructure register used by DPA Annex C: Supabase, Cloudflare Pages/Turnstile, jsDelivr and esm.sh. Unconfirmed Resend/SpaceMail/application-email Gmail/SMS rows are removed. The current Gmail mailbox is business correspondence only; GitHub source hosting alone is not Shop-data subprocessing. Actual provider locations, roles and contracts remain unreviewed.
- /legal.html is a separate reader with no Supabase Auth SDK, Turnstile or WebGL. Final legal content requires the minimal anonymous publication RPC plus readiness/version matching. Unpublished contract routes redirect to Help. There are no login document links.
- Profile / Account → Help & User Guide is in the shared account modal; the shared modal covers Admin, POS and Workshop without replacing those screens. Owner Settings → Legal & Privacy shows a compact no-publication status without links while unpublished. Published matching documents show versions and acceptance name/time, not Auth UUIDs. Support cannot accept or read Owner evidence. Help and legal links are separate.
- Public reader supports table of contents, keyboard links, skip link, mobile layout, readable measure and local light/dark switching. No documentation CMS or external Markdown renderer was added.

## Acceptance and tenancy

Canonical contracting role is exactly Business Owner. Manager, Cashier, Technician and Orbito Support bypass the commercial gate, not existing authorization. Existing Shop suspension still applies.

Migration 20261002015159_legal_acceptance.sql adds app_private.legal_policy and app_private.legal_acceptances. This architecture is one Shop per Supabase project (shop_config singleton), not a shared multi-Shop row tenant model. The server creates a stable random Shop UUID in that project; neither frontend nor Platform supplies it. Do not reuse a cloned project's legal identity/acceptance history for a different business. A future multi-Shop schema would require a new membership-bound tenant design.

Only authenticated active unsuspended Business Owner may invoke acceptance/read private status. SECURITY DEFINER functions use fixed search_path and canonical app_users/current_client_access_allowed; execute for these private-evidence RPCs is revoked from PUBLIC/anon. The separate publication-only RPC grants anon/authenticated read access to non-personal metadata. Both private tables have RLS and no browser table privileges/policies. No existing RLS was weakened. service_role/DB administrators retain explicit maintenance authority; immutability is against browser users, not a claim of tamper-proof administrator storage.

RPC input contains only confirmation and the versions/revision actually displayed. No caller-selected user, Shop, accepted role or timestamp is accepted. Server identity/name/role and server clock create evidence. The record has no Auth cascade so account deletion cannot erase it. No new IP, user agent or fingerprint is collected for acceptance. No useful application release identifier existed (package version is 0.0.0), so app version was omitted rather than fabricated.

Unique (shop_id, required_revision) makes retries/double submissions idempotent and stores one business acceptance per mandatory cohort. Staff cannot insert, edit or remove it. Legal read failure or frontend/server version mismatch blocks Owner entry with a neutral service/configuration state and Retry/Sign out, without agreement wording or an acceptance form; it never infers acceptance from localStorage. Normal business routes are installed only after the gate passes. This is an application-entry gate with server-backed evidence, not a new legal-condition predicate on every pre-existing business RPC; deliberately tampered clients remain subject to existing business authorization, not a new universal legal-use embargo.

## Version release procedure

1. Review all copy/placeholders with the business and counsel before first publication. Resolve required fields, conditional appointments and provider register, mark the reviewed schedule in metadata, and deploy matching finalized content before a reviewed forward migration/configuration sets legal_policy.published=true. Keep it false until ready. Preserve the exact published Markdown, metadata, resolved company details and provider list in source control/release archives. Acceptance stores exact document versions, not a copy of the whole document.
2. For any published copy change, increment affected document version/effective date in metadata.json and add a forward migration updating the corresponding legal_policy versions. Do not rewrite already-applied migrations or republish different text under an identical version.
3. Non-material update: keep requiredRevision/required_revision unchanged. Existing acceptance remains sufficient; status still reports its original exact versions.
4. Material update: increment requiredRevision and server required_revision too; notify affected Owners as legally required. A new receipt is required; previous receipts remain.
5. Ship matching frontend and database policy in a controlled release window. Mismatch is intentionally fail-closed for Owner; cached old clients must reload. Preserve public document access.
6. Confirm migration on the intended Shop project. Do not copy acceptance records to another client's project. No automated announcement or consent withdrawal/rights-request workflow is implied.

## Actual data inventory

| Store / feature | Information present | Purpose / access / retention |
| --- | --- | --- |
| shop_config | Business identity/address/phone/logo, owner email, tax/receipt settings, module flags, legacy Platform configuration/rate fields | Shop configuration and service administration; no formal retention schedule found |
| auth.users / app_users / employees | Auth identity, email, display name, role/status, employee linkage | Individual authentication and canonical authorization; staff lifecycle is deactivation, not general erasure |
| legacy_auth_credentials / shop_security / step_up_authorizations | Migration password hashes, hashed override PIN, actor/purpose/expiry authorizations | Server-only credential transition and protected actions; old plaintext credentials are nulled by Phase 2 migrations, not exposed as current login data |
| active_sessions | Historical employee/session-key records | Legacy schema artifact; not treated as the current canonical Supabase session design |
| tickets / additional_work_proposals | Customer name/phone, device brand/model/IMEI, components, notes, statuses, prices/advances, actor and decision history, parent/child references | Repair operations and approval history; free text may contain sensitive data supplied by users |
| sales / sale_lines | Customer name, sold items/variants, quantities, price/discount/tax/total, invoice, employee/actor | Retail invoicing; no card PAN/CVV integration identified |
| payments / payment_allocations | Amount/method/cash/change, sources/notes, timestamps, actor, sale/family allocations | Financial ledger and reconciliation; records may be legally retained |
| udhar / credit_approvals | Customer identity/phone, outstanding amounts/history, actor/approval | Shop customer credit |
| returns / return_lines / refunds / invoice_adjustments | Items/amounts/reasons, request identifiers, actor, PIN authorization reference | Auditable correction rather than destructive invoice edits |
| inventory / inventory_movements / quick_items / repair_components | Stock/catalogue names, SKU/category, quantities, costs/prices, movements and actors | Stock and item/work catalogue management |
| attendance / leaves / salary_config / salary_slips | Employee work times, leave reason/decision, pay configuration/slip amounts | EMS/payroll workflows; organizational/employee notices need legal review |
| password_reset_requests | Eligible email, status/time | Administrator-assisted recovery; no SMS/email reset provider found in this workflow |
| support_access_log | Real Platform user ID/email, dedicated client Auth ID, support_login, user-agent/time | Client-side audit of privileged support entry; no automatic upload of audit row found |
| app_private.bridge_config/events/outbox | Source identity/binding, usage/thermal/resupply events, delivery/retry/acknowledgement metadata | Durable operational usage delivery; no purge/retention schedule found |
| app_private.billing_projection / paper_resupply_requests | Service billing projection; requester Auth ID, request time/status/version | Owner billing view/resupply orchestration; full client fulfilment history UI is absent |
| New legal_policy / legal_acceptances | Project Shop UUID, accepting Owner UUID/name/role, exact versions/revision/time | Evidence of business agreement; needs an explicit lawful retention schedule |

Schema evidence: baseline schema plus Phase 2 foundation/vault/cutover, Phase 3 ledger/atomic workflows and Phase 4 bridge migrations. Baseline permissive policies/password columns are historical, not the final security design.

## Narrow Shop → Platform data-flow audit

| Flow | Exact application payload | Personal/financial content and direction | Retention |
| --- | --- | --- | --- |
| Legacy usage adapter src/platform/legacy.js | client_id, module_type, token_count=1, rate_at_log (BILL 5, otherwise 1 in compatibility code) | Shop binding/count and legacy service rate; no customer, invoice contents, repair notes or Shop revenue | Platform unknown; best-effort compatibility, not the new durable transport |
| Bridge envelope and each event | Envelope schema_version, source_id, client_binding, events; event_id, source_id, source_sequence, kind, operation, operation_id, body, occurred_at, schema_version | Linkable Shop/event metadata, not anonymous | No automatic expiry established |
| usage body | metric (BILL/INVENTORY), quantity=1, unit=event | Counts only; operation names distinguish canonical activity | Same |
| thermal body | document_type, document_id, copies, estimated_mm, paper_width_mm=80, template_version, measurement_version, calibration_version, measurement_status, is_reprint, original_event_id, intent_hash | Linkable document IDs and hash (input plus Auth identity); no plaintext actor/customer name, phone, repair notes or raw sale/payment totals | Local queue and server events; acknowledged local intents removed, rejected/pending remain |
| resupply body | request_id, requested_at, schema_version | Shop/source envelope identifies requester business; requesting Auth UUID is stored locally but not included in this body | Lifecycle retention unspecified |
| billing projection (Platform → Shop) | schema_version, currency, platform_updated_at, paper_resupply_enabled, usage.BILL/INVENTORY, invoices (id/reference/period/status/total/paid/outstanding), outstanding_total, estimated_current_charges, recent_billing, billed_through, settled_through, estimate_through, pricing_version | Returned Orbito service-account amounts and accounting boundaries; not outbound Shop customer invoice values | Latest projection stored; backend Platform retention unknown |
| resupply update (Platform → Shop) | request_id, sync_version, status, platform_updated_at (source passed from configured batch) | Request lifecycle, not customer device records | Unspecified |
| Support authentication | email/password sent to configured Platform Supabase password-token endpoint; returned verified Platform identity used for client bootstrap | Actual support credentials are sent, unlike normal Shop login; local access log records both identities and user-agent | Platform Auth logging/retention not proven by client repo |

Source evidence: src/platform/legacy.js, src/platform/thermal.js, supabase/functions/platform-bridge/index.ts, supabase/functions/login/index.ts, 20260917174024_phase4_platform_bridge.sql and 20260919043803_phase4_invoice_creation_bill_semantics.sql. Delivery is configuration dependent; no claim that bridge delivery is enabled merely because code exists.

No customer-name/phone/device-note/raw Shop revenue fields were found in these Platform event bodies. This does not mean Orbito is unable to access Shop data: authorized Support role can access operational records, and Supabase hosts them. No business-wide no-sale/no-share claim can be established from this repo alone.

## Other disclosures / storage / export

- Cloudflare Turnstile receives challenge token and available remote IP from login/reset verification. Hosting/Auth/CDN services may receive request metadata under their own arrangements; do not claim this feature added no IP processing anywhere.
- Public tracking checks invoice/ticket reference plus phone and returns customer name, device brand/model, masked IMEI, status/date, quote/final total and components. That endpoint is Shop → customer browser, not Shop → Platform.
- jsDelivr serves the receipt barcode script and the public-tracking Supabase client module. esm.sh serves server dependencies. These verified network recipients were added to the provider register; exact legal roles/regions/contracts need confirmation.
- sessionStorage holds Supabase session credentials and navigation/repair handoff; localStorage holds theme and pending resupply retry ID keyed by actor; IndexedDB holds pending/rejected actor-bound thermal intents. Sign-out is not full persistent-storage erasure.
- Support console capture is gated to verified support and keeps up to 600 entries in memory. Normal browser console output can contain diagnostics, identifiers/emails and operational details; no remote analytics sink was found in debuglog.js. Provider/server logs and retention need operational review.
- Printing exposes selected customer/financial content in a browser print window, including salary slips where allowed. Browser PDF/physical copies are controlled by the operator. No complete Shop export or automatic data-subject erase workflow was found; do not confuse prints with backups.
- No SMS/email vendor integration was found for the reset-request workflow. Supabase Auth infrastructure/any separately configured SMTP or business support channels need deployment confirmation.
- No verified backup plan, recovery SLA, retention schedule, encryption-at-rest configuration, personnel controls or incident-response runbook was established by this source audit. No certification claim was added.

## Regulatory references reviewed

Access dates: 2026-09-27 to 2026-09-28. Primary sources; no claim of exhaustive jurisdictional advice.

- Pakistan enacted/current framework: [MoITT legislation register](https://www.moitt.gov.pk/Legislations) lists Electronic Transactions Ordinance 2002 and PECA 2016 as approved. [Pakistan Code ETO entry](https://pakistancode.gov.pk/english/UY2FqaJw2-apaUY2Fqa-apaUY2Fta5Y%3D-con-10070-sg-jjjjjjjjjjjjj) was located. Electronic assent design must still be reviewed for evidence/authority and contractual validity.
- Pakistan amendment: [National Assembly Acts register](https://na.gov.pk/en/print_act.php) lists PECA Amendment Act 2025, dated 29 January 2025. [NCCIA laws listing](https://nccia.gov.pk/laws.php) also identifies it (search listing available; full fetch denied). Avoid unreviewed criminal-law summaries in customer terms.
- Pakistan DRAFT: MoITT still explicitly labels Personal Data Protection Bill May 2023 as Draft. No assertion that it is enacted was made; recheck the current gazette/status before release.
- Provincial consumer law: official [Punjab Consumer Protection Act 2005 publication](https://pccmdpunjab.gov.pk/custom/mateen/pdf/ruleregulation/20-Punjab%20Consumer%20Protection%20Act%202005.pdf) located via official search; full PDF retrieval timed out. Do not claim complete section-by-section review/current consolidation. Counsel must confirm provincial amendments/applicability and whether a particular B2B customer is covered. Terms preserve mandatory rights rather than waive them.
- EU enacted regulation: [GDPR official text](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), focusing on principles, transparency, rights, security, processor contracts (Article 28), breach assistance and Chapter V/Articles 44–49. These informed separate role explanations and DPA schedules, not a compliance certification.
- EU transfer instruments: [European Commission SCC publication](https://commission.europa.eu/publications/standard-contractual-clauses-international-transfers_en) and [EDPB SCC overview](https://www.edpb.europa.eu/topics/international-transfers-and-international-cooperation/standard-contractual-clauses_en). Listing an instrument is not executing it; correct modules/annexes and assessment remain unresolved.
- UK guidance/current law: [ICO controllers/processors guide](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/controllers-and-processors/controllers-and-processors-a-guide/) and [international-transfer guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/) (IDTA/Addendum and transfer risk/data-protection test). [Government DUAA changes](https://www.gov.uk/guidance/data-use-and-access-act-2025-data-protection-and-privacy-changes) explain amendments to the existing UK framework, not its wholesale replacement.
- UK current commencement: [ICO February 2026 statement](https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2026/02/statement-on-the-commencement-of-the-data-use-and-access-act-duaa/) and [June 2026 complaint requirements](https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2026/06/new-data-protection-complaints-law-now-in-force/). Complaint handling is now an operational requirement where applicable, not merely future work under a proposed bill. Appoint a handler and implement timely acknowledgment/investigation/outcome.
- California: [CPPA current law/regulations](https://cppa.ca.gov/regulations/), [2026-effective updates](https://cppa.ca.gov/regulations/ccpa_updates.html), and [CPPA FAQ](https://cppa.ca.gov/faq). Draft addresses role-specific restrictions/rights conditionally, not universal US coverage. Assess thresholds, contracts, applicable rights/opt-outs and operational fulfilment. Do not confuse proposed later rulemaking with effective rules.
- Other markets: Canada, Australia, Singapore, UAE and other jurisdictions require local applicability/addendum review before launch; not researched to compliance-completion in this implementation. There is no claimed universal US federal GDPR equivalent.

Re-review legal status, regulator guidance, provider list/regions and transfer instruments periodically and before a new-market launch. Regulatory duties differ by activity and territory.

## Validation and deployment boundary

Earlier implementation validation (2026-09-28): production build PASS (both app and public legal entry); 38/38 automated tests PASS, including five new focused legal tests; git diff --check PASS. No browser marathon, production data mutation, commit, push or deployment.

Final narrow hardening validation (2026-09-28): `node --test tests/legal.test.mjs tests/legal-sql.test.mjs tests/login-background.test.mjs` PASS, 8/8 with no skips; production build PASS; git diff --check PASS. This checked unpublished Owner entry and acceptance rejection, blank-name rejection, server-derived evidence, material/minor revisions, unfinished public document suppression, optional contact rendering and the existing login-background contract. The SQL test used isolated PGlite only; the migration remains unapplied to Supabase. Auth, GhostFibers, Turnstile and Platform integration source files were unchanged by this cleanup. The earlier broad suite was not repeated.

Focused tests execute the new migration against isolated PGlite PostgreSQL with canonical role/access helper bodies from the repo and minimal dependency tables. They cover Owner persistence/re-read, checkbox/version validation, idempotent retry, server-derived Shop/user/time, staff/Support/anonymous denial, private-table write denial, suspension and material/non-material revisions. Frontend tests cover version payload, duplicate submission, staff bypass, safe document rendering and public/login entry contracts.

This is not a live Supabase JWT or PostgREST deployment test. No migration was applied remotely. Production rollout must verify actual RPC exposure/ACLs and project identity, deploy the matching policy/frontend, and review Supabase advisors. The isolated runtime is a test-only install under ignored node_modules/.legal-test-runtime, not an application dependency. To reproduce: npm install --prefix node_modules/.legal-test-runtime --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.3.14, then node --test tests/legal*.test.mjs. Without it the SQL test explicitly skips.

Future manual smoke: login has no document links and retains attribution/Turnstile/GhostFibers; unpublished Owner entry and staff entry proceed; Settings has no draft links; direct draft URLs redirect to Help; Profile / Account Help and quick start work on mobile. In a separately approved disposable published-policy fixture, unchecked authority blocks acceptance, Owner acceptance survives refresh, a material revision prompts again, a minor update preserves acceptance and Settings shows exact versions/name/time. Do not activate a production policy for this test.

## Pakistan finalization validation — 2026-09-29

Focused legal/frontend, isolated PostgreSQL and existing login-background tests: 10/10 PASS, no skips. Production build and git diff --check PASS (app and separate reader). Legal SQL ran only in disposable PGlite, not Supabase. Tests cover staff bypass, explicit unpublished Owner bypass, published acceptance, server-derived exact versions/revision, material/minor changes, blank-name refusal, hidden unpublished links/routes, guide access and contact/version readiness. No broad browser suite or live legal acceptance was run. See finalization guide for remaining publication blockers and professional review. No commit, merge, push, deploy or live migration was performed.

## Current developmentv2 integration — 2026-10-02

Current main.js, auth.js, shared.js, admin/admin.js, onboarding.js, onboarding-state.js, router.js and Vite config were compared with the donor; older versions were not restored. Reserved-owner activation, confirmed identity, six saved steps, invite handling, fail-closed config/suspension and role routing remain authoritative. enterApplication checks needsOnboarding first, then clears stale routes and evaluates legal status before the existing clock-in/routing continuation. Canonical staff bypass the agreement gate. Onboarding edits are branding substitutions only.

New forward migration: 20261002015159_legal_acceptance.sql, after 20261001120000_onboarding_runtime_preflight.sql. It ports the private policy/evidence and restricted RPC design with published=false; it needs only the current private schema/auth helpers, not demo data or prior donor migration history. A full-chain replay was intentionally not run. No existing migration was rewritten or hosted migration applied.

Current validation: node --test tests/legal.test.mjs tests/legal-sql.test.mjs tests/branding.test.mjs — 13/13 PASS, no skips. Isolated SQL uses PGlite; targeted entry-flow test confirms onboarding precedes legal and routes stay blocked when status is unavailable. git diff --check PASS. No production build or broad onboarding/billing/browser suite was run in this integration. Earlier build/test counts above are historical donor results. No commit, push, merge, deploy or live project changes.

## Current RetraSell finalization — 2026-10-02

Confirmed contracting/contact/version metadata replaces the previous unresolved business values. Shared email is intentional; registration/NTN are not customer-facing or readiness requirements. Terms, Privacy and DPA consistently limit the 30-day return request to available data and promise neither a separate backup-retention period nor recovery of nonexistent data. Customer-managed infrastructure duties and qualified exclusions preserve applicable RetraSell responsibility. Only source-evidenced infrastructure remains in the register; provider locations, roles and agreements still require review. Published remains false and subprocessorScheduleReviewed remains false.

The owner reports the original legal migration already applied; it is left byte-for-byte unchanged. New local 20261002071259_legal_policy_metadata.sql is metadata-only and unapplied to hosted projects. No schema/RLS/RPC/grant changes. Login already has plain-text A project of ABCD Ventures without a link; login/auth/Onboarding V2/routing/suspension/billing/bridge source is unchanged by this finalization.

Validation: node --test tests/legal.test.mjs tests/legal-sql.test.mjs tests/branding.test.mjs — 14/14 PASS, zero skips; git diff --check PASS. SQL executes both migrations only in isolated PGlite and verifies matching unpublished metadata, denied unpublished acceptance, Owner name/authority guards, immutable server-derived evidence, staff/anonymous denial, suspension, and material/minor revision behavior. Frontend checks include shared-mailbox readiness, hidden unfinished/unpublished documents, unchanged plain-text login attribution, and onboarding-before-legal entry. No build, broad suite, commit, push, merge, deployment or hosted migration was run. Publication requires professional legal/provider review and a separately approved coordinated release.
