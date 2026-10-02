# Legal finalization guide — INTERNAL ONLY

Updated 2026-10-02. Branch: `feature/legal-finalization-v2`; legal donor: `feature/legal-privacy-help`. Initial market: small business customers in Pakistan. These are business-directed drafts, **not lawyer-reviewed documents**. Never link this guide in customer navigation. No publication, deployment, merge, live DB update or production acceptance requirement is authorized by this work.

## Confirmed business decisions

- Contracting name remains unresolved; structure is Sole Proprietor. Registration and NTN are both `5842096` (business supplied, not independently registry-verified).
- Address: Ground Zero, Hospital Road, Gujranwala, Punjab, Pakistan.
- Preserve verbatim: **ABCD Ventures is the Parent Company (Holding Company) that owns this sole proprietorship.** This requested relationship statement is not an independently verified legal conclusion. ABCD Ventures is not assigned as the direct contracting party.
- Preserve attribution: **A project of ABCD Ventures**. Login has no document links or legal placeholders. Public product names now come solely from src/config/brand.js: RetraSell POS / RetraSell. Merchant names remain tenant-configured; LEGAL_ENTITY_NAME stays null. No separate legal product-name placeholders remain.
- Client-specific commercial documents govern pricing, billing basis, modules, rates, limits and special arrangements; no individual prices in general Terms.
- Payment due immediately upon invoice unless written client terms differ. Three Working Days grace before overdue suspension. Ordinary cancellation/termination uses three Working Days notice unless agreed otherwise; serious/material breach may justify immediate termination. Refunds depend on client agreement and mandatory law, not a universal entitlement.
- Draft Working Days definition: Monday–Friday excluding Punjab public holidays unless the client agreement says otherwise. This calendar definition is an assumption for clarity, not an additional supplied decision; confirm before publication.
- Former customers have 30 days after cancellation/termination to request export/return. Afterwards data may be deleted subject to legal, operational, backup, fraud/security and retention requirements. Active deletion may precede backup expiry. No invented backup duration or automated export/erase capability.
- Online infrastructure dependencies, maintenance, upgrades, emergency/security work and outside-control outages are explained. Shop backend dependency remains distinct from Platform availability. No numeric SLA/uptime or monetary liability cap.
- Indirect-loss exclusions are qualified by applicable law; no absolute exemption from all liability. Non-excludable-rights/fraud/deliberate-misconduct carve-outs need professional review.
- Pakistan law; preferred courts in Gujranwala, Punjab, subject to mandatory jurisdiction. Good-faith informal resolution precedes proceedings without mandatory arbitration or restricting urgent relief/mandatory deadlines.
- General subprocessor authorization, not separate consent each time. Notice through app, website, legal page or another reasonable electronic method; no invented fixed notice period. Assign an operational notice owner/process.
- Support access is limited to authorized personnel where reasonably necessary for troubleshooting, support, security, abuse investigation, recovery or maintenance. Logging is promised only where supported, not for every action.

## Every unresolved placeholder

Examples below describe format only, **not production values**. M = `src/legal/metadata.json`; T = `docs/legal/TERMS_OF_SERVICE.md`; P = `docs/legal/PRIVACY_NOTICE.md`; D = `docs/legal/DATA_PROCESSING_ADDENDUM.md`; S = `src/legal/subprocessors.json`.

| Current placeholder | Information / example format | Exact fields and sections affected | Blocks publication |
| --- | --- | --- | --- |
| `[PLACEHOLDER: OFFICIAL_LEGAL_BUSINESS_NAME]` | Verified contracting proprietor/business name matching official records | M `company.ENTITY`; T §1, P Short notice, D §1 via `{{ENTITY}}` | Yes |
| `[PLACEHOLDER: GENERAL_SUPPORT_EMAIL]` | Monitored support mailbox, `local-part@approved-domain` | M `company.SUPPORT_EMAIL`; T §1, P Contacts | Yes |
| `[PLACEHOLDER: LEGAL_NOTICES_EMAIL]` | Monitored legal mailbox, `legal-local-part@approved-domain` | M `company.LEGAL_EMAIL`; T §1/§10, P Short notice/Contacts | Yes; distinct from privacy |
| `[PLACEHOLDER: PRIVACY_REQUEST_EMAIL]` | Monitored privacy mailbox, `privacy-local-part@approved-domain` | M `company.PRIVACY_EMAIL`; P Short notice/Legal bases/Rights/Contacts, D Annex D | Yes; distinct from legal |
| `[PLACEHOLDER: SUPPORT_PHONE]` | Approved phone/WhatsApp including country code, `+92 …` | M `company.SUPPORT_PHONE`; T §1, P Contacts | Yes |
| `[PLACEHOLDER: BACKUP_RETENTION_POLICY]` | Verified copy/expiry/exception policy, not a guessed duration | M `company.BACKUP_RETENTION_POLICY`; T §9, P Retention, D §7 | Yes |
| `[PLACEHOLDER: ANALYTICS_PROVIDER_OR_NONE]` | Actual provider/purpose or confirmed `None` | M matching company key; P Recipients; add applicable S rows | Yes |
| `[PLACEHOLDER: ERROR_MONITORING_PROVIDER_OR_NONE]` | Actual provider/purpose or confirmed `None` | M matching company key; P Recipients; add applicable S rows | Yes |
| `[PLACEHOLDER: OTHER_SUBPROCESSORS_OR_NONE]` | Additional recipients/purposes or confirmed `None` | M matching company key; P Recipients; D Annex C via S | Yes |
| `[PLACEHOLDER: TERMS_VERSION]` | Approved first version; suggested future `1.0` | M `documents.terms.version`; legal migration seed `terms_version`; reader/gate/evidence | Yes |
| `[PLACEHOLDER: PRIVACY_VERSION]` | Approved first version; suggested future `1.0` | M `documents.privacy.version`; legal migration seed `privacy_version`; reader/gate/evidence | Yes |
| `[PLACEHOLDER: DPA_VERSION]` | Approved first version; suggested future `1.0` | M `documents.dpa.version`; legal migration seed `dpa_version`; reader/gate/evidence | Yes |
| `[PLACEHOLDER: EFFECTIVE_DATE]` | Approved date, `YYYY-MM-DD` | M `documents.terms/privacy/dpa.effectiveDate`; reader version line | Yes |
| `[CONFIRM PROJECT REGIONS AND SUPPORT LOCATIONS]` | Actual Supabase hosting/support locations, plain-language list | S Supabase `location`; D Annex C | Yes |
| `[CONFIRM CONTRACT AND PROCESSING LOCATIONS]` | Verified Cloudflare Pages/Turnstile processing/support locations | S Cloudflare row `location`; D Annex C | Yes |
| `[CONFIRM CDN PROCESSING LOCATIONS]` | Verified jsDelivr network processing arrangement | S jsDelivr `location`; D Annex C | Yes |
| `[CONFIRM DISTRIBUTION LOCATIONS]` | Verified esm.sh distribution/metadata arrangement | S esm.sh `location`; D Annex C | Yes |
| `[PLACEHOLDER: EMAIL_PROCESSING_LOCATIONS]` | Actual locations/roles for each used email service | S Resend/Gmail/SpaceMail `location`; D Annex C; P Recipients | Yes; remove rows if confirmed unused |
| `[PLACEHOLDER: SMS_PROVIDER_OR_NONE]` | Carrier/provider or explicit unused determination | S SMS `provider`; D Annex C; P Recipients | Yes; remove row if confirmed unused |
| `[PLACEHOLDER: SMS_PROCESSING_LOCATIONS_OR_NOT_APPLICABLE]` | Actual SMS location or justified inapplicability | S SMS `location`; D Annex C | Yes unless unused row removed |

Optional/conditional: M `company.DPO`, `EU_REP`, `UK_REP` remain `null`, not appointed contacts. They do not render literal placeholders. Review applicability before expansion; do not invent appointments.

M `subprocessorScheduleReviewed` remains **false**. Non-placeholder text is not proof of review. Resolve contracting entities, data categories, purposes, regions, roles and agreements, then explicitly approve the schedule. `requiredRevision=2026-09-27.1` is an existing draft cohort, not production approval; approve its production value in the coordinated release process.

## Provider evidence and operational follow-up

Supabase, Cloudflare Pages/Turnstile, jsDelivr barcode delivery and esm.sh dependency delivery are evidenced in source. Resend, Gmail and SpaceMail were identified by the business; no direct Shop-data feed to each was found in this client repository. Confirm project SMTP, mailboxes, support processes and any separate Platform use without assuming identical flows. SMS depends on carrier/client configuration. No company-wide no-sale/compliance/encryption/backup/transfer assurance is inferred from a code search.

Keep provider rows conditional until actual recipients are confirmed. Script distribution does not make a vendor a processor for every Shop record. Platform telemetry remains distinct from Shop database contents; BILL/INVENTORY/THERMAL and reprint/resupply semantics are unchanged.

Assign people/processes for privacy requests, notices, incidents, export delivery, retention/deletion, backups and legal holds. The 30-day request window is contractual copy, not a newly implemented scheduler or automatic purge.

## Publication, acceptance and customer UX

- The new forward migration 20261002015159_legal_acceptance.sql ports the reviewed donor schema after the onboarding migrations. Its private policy retains `published boolean NOT NULL DEFAULT false`. Draft versions remain placeholders; donor RLS, RPC restrictions, name guard and evidence semantics are preserved. No migration is applied. Never rewrite an already-applied migration in deployment; use a reviewed forward migration if an installation already has this legal schema.
- Only a reviewed server action may publish. Final frontend/server versions and revision must match. Readiness rejects unfinished mandatory fields, versions/dates, unreviewed provider schedule and identical legal/privacy contacts. Browser readiness is not publication authority.
- Onboarding V2 completes before any legal evaluation. Explicit unpublished status bypasses the Owner gate; staff/Manager/Support bypass it regardless. Unknown/error status remains fail-closed with a neutral Agreement status unavailable state and Retry/Sign out only. Version/readiness mismatch similarly shows a neutral configuration state. Neither state requests acceptance or renders an agreement checkbox.
- Canonical Business Owner represents the authorized business administrator; this task does not grant contracting authority to Manager. Material Terms revisions need a new required revision and renewed Owner acceptance. Minor version changes retain the cohort and do not force reacceptance after the matching frontend loads.
- Evidence remains server-derived identity, Shop, name, role, timestamp and exact policy versions/revision. Blank names are rejected. Archive each finalized text/metadata/provider schedule with its version before publication.
- Login has no Terms/Privacy/DPA/Help links. Owner Settings retains compact Legal & Privacy status without unpublished links. Direct unpublished/unfinished contract routes redirect to Help before rendering text. Help and legal navigation are separate.
- Shared Profile / Account → Help & User Guide covers the current Admin/POS/Workshop shells. Guide templates resolve PRODUCT_NAME/SHORT_BRAND_NAME from the central branding module, including the unchanged meaning of the feature-availability disclaimer. Canonical `Orbito Support` authorization values stay unchanged.
- Internal notes are never imported by customer pages. Frontend visibility is not a confidential document vault: publication governs normal customer reading and acceptance, not secrecy of source/bundled assets.

## Before International or Enterprise Expansion

- [ ] Pakistani commercial lawyer: review exact Parent Company / Holding Company wording for a sole proprietorship; retain requested wording pending review.
- [ ] Review liability limitations and a potential monetary liability cap.
- [ ] Review mandatory liability carve-outs, enforceability and statutory rights.
- [ ] Assess international privacy laws and controller/processor allocation.
- [ ] Identify cross-border transfers and complete required agreements/assessments; do not claim they already exist.
- [ ] Review subprocessors, data flows, contracts and change notices.
- [ ] Review tax requirements and actual government/FBR integrations.
- [ ] Review governing law, jurisdiction and dispute procedure.
- [ ] Verify retention, backup expiry, deletion, export and legal holds.
- [ ] Review future SLA/uptime commitments; none are supplied here.
- [ ] Verify security obligations against real deployment/operations.
- [ ] Review DPA assistance, audit, incident and market-specific terms.

Reference starting points, not legal review: [Pakistan Code — Contract Act, 1872](https://www.pakistancode.gov.pk/english/UY2FqaJw2-apaUY2Fqa-a50%3D-con-128-sg-jjjjjjjjjjjjj) and [official Punjab Consumer Protection Act publication](https://pccmdpunjab.gov.pk/custom/mateen/pdf/ruleregulation/20-Punjab%20Consumer%20Protection%20Act%202005.pdf), located 2026-09-29. Current amendments, applicability and enforceability require counsel; business-only wording is not asserted to waive mandatory protections. Historical international research in implementation notes is background, not a promise in this Pakistan-focused draft.
