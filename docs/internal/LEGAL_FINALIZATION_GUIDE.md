# Legal finalization guide — INTERNAL ONLY

Updated 2026-10-02. Branch: `feature/legal-finalization-v2`; legal donor: `feature/legal-privacy-help`. Initial market: small business customers in Pakistan. These are business-directed drafts, **not lawyer-reviewed documents**. Never link this guide in customer navigation. No publication, deployment, merge, live DB update or production acceptance requirement is authorized by this work.

## Confirmed business decisions

- Contracting entity: RetraSell; structure: Sole Proprietor (business supplied, not independently verified). Registration/NTN are deliberately absent from customer documents, metadata and publication-readiness fields; no replacement identifiers are invented.
- Address: Ground Zero, Hospital Road, Gujranwala, Punjab, Pakistan.
- Preserve verbatim: **ABCD Ventures is the Parent Company (Holding Company) that owns this sole proprietorship.** This requested relationship statement is not an independently verified legal conclusion. ABCD Ventures is not assigned as the direct contracting party.
- Preserve attribution: **A project of ABCD Ventures**, plain text, without a website/link. Login already has this attribution and no document links or legal placeholders. Public product names come solely from src/config/brand.js: RetraSell POS / RetraSell. Merchant names remain tenant-configured; LEGAL_ENTITY_NAME is RetraSell, matching legal metadata, not ABCD Ventures.
- Support, legal and privacy enquiries intentionally share `ranazaighaum@gmail.com`; phone: `+92-552139051`. Gmail is the current business communication channel, not an application email service. Monitor and appropriately handle each enquiry type; distinct mailboxes are not a publication requirement.
- Client-specific commercial documents govern pricing, billing basis, modules, rates, limits and special arrangements; no individual prices in general Terms.
- Payment due immediately upon invoice unless written client terms differ. Three Working Days grace before overdue suspension. Ordinary cancellation/termination uses three Working Days notice unless agreed otherwise; serious/material breach may justify immediate termination. Refunds depend on client agreement and mandatory law, not a universal entitlement.
- Confirmed Working Days: Monday–Friday excluding public holidays observed in Punjab, Pakistan, unless client terms define otherwise.
- Former customers may request export/return of available service data for up to 30 days after cancellation/termination. Afterwards data may be deleted subject to legal, operational, backup, fraud/security and retention requirements. Active deletion may precede backup expiry. RetraSell does not currently guarantee a separate backup-retention period, residual-backup deletion duration, recovery of nonexistent data or universal self-service backup/export/restore.
- Customer-managed/BYO Supabase projects, databases, hosting/cloud accounts and credentials remain customer-controlled. RetraSell may assist initial integration; customer account/billing/credentials/availability/backups/recovery/admin responsibilities are explicit. Qualified infrastructure exclusions preserve RetraSell's own breach/negligence responsibility where applicable and non-excludable liability in Terms, Privacy and DPA.
- Terms/Privacy/DPA versions: 1.0; effective date: 2026-10-03; required revision: 2026-10-03.1. These supplied metadata values do not authorize publication or acceptance.
- Analytics: None. Error monitoring: None. Other unrelated subprocessors: None apart from the evidenced infrastructure register.
- Online infrastructure dependencies, maintenance, upgrades, emergency/security work and outside-control outages are explained. Shop backend dependency remains distinct from Platform availability. No numeric SLA/uptime or monetary liability cap.
- Indirect-loss exclusions are qualified by applicable law; no absolute exemption from all liability. Non-excludable-rights/fraud/deliberate-misconduct carve-outs need professional review.
- Pakistan law; preferred courts in Gujranwala, Punjab, subject to mandatory jurisdiction. Good-faith informal resolution precedes proceedings without mandatory arbitration or restricting urgent relief/mandatory deadlines.
- General subprocessor authorization, not separate consent each time. Notice through app, website, legal page or another reasonable electronic method; no invented fixed notice period. Assign an operational notice owner/process.
- Support access is limited to authorized personnel where reasonably necessary for troubleshooting, support, security, abuse investigation, recovery or maintenance. Logging is promised only where supported, not for every action.

## Every unresolved placeholder

Examples below describe format only, **not production values**. M = `src/legal/metadata.json`; T = `docs/legal/TERMS_OF_SERVICE.md`; P = `docs/legal/PRIVACY_NOTICE.md`; D = `docs/legal/DATA_PROCESSING_ADDENDUM.md`; S = `src/legal/subprocessors.json`.

| Current placeholder | Information / example format | Exact fields and sections affected | Blocks publication |
| --- | --- | --- | --- |
| `[CONFIRM PROJECT REGIONS AND SUPPORT LOCATIONS]` | Actual Supabase hosting/support locations, plain-language list | S Supabase `location`; D Annex C | Yes |
| `[CONFIRM CONTRACT AND PROCESSING LOCATIONS]` | Verified Cloudflare Pages/Turnstile processing/support locations | S Cloudflare row `location`; D Annex C | Yes |
| `[CONFIRM CDN PROCESSING LOCATIONS]` | Verified jsDelivr network processing arrangement | S jsDelivr `location`; D Annex C | Yes |
| `[CONFIRM DISTRIBUTION LOCATIONS]` | Verified esm.sh distribution/metadata arrangement | S esm.sh `location`; D Annex C | Yes |

Optional/conditional: M `company.DPO`, `EU_REP`, `UK_REP` remain `null`, not appointed contacts. They do not render literal placeholders. Review applicability before expansion; do not invent appointments.

Business identity/contact, backup statement, monitoring decisions, versions and effective-date placeholders have been replaced with the confirmed values above. Template substitution tokens are not unresolved business decisions. The already-applied initial migration retains its historical placeholders; only the forward metadata migration replaces them in the policy row. Do not edit migration history.

M `subprocessorScheduleReviewed` remains **false**. Non-placeholder text is not proof of review. Resolve contracting entities, data categories, purposes, regions, roles and agreements, then explicitly approve the schedule. `requiredRevision=2026-10-03.1` is the confirmed revision, not publication approval. Review support-mailbox processing and privacy-request handling operationally without describing an application email service.

## Provider evidence and operational follow-up

Supabase, Cloudflare Pages/Turnstile, jsDelivr barcode delivery and esm.sh dependency delivery are evidenced in source. Only those four infrastructure entries remain. Resend, SpaceMail, the legacy application-email Gmail row and SMS placeholders are removed. The software is not currently marketed as providing email/SMS services. The current Gmail business mailbox handles enquiries voluntarily submitted to it; assess those communications separately. GitHub source/deployment hosting alone is not evidence of Shop-data processing. No company-wide no-sale/compliance/encryption/backup/transfer assurance is inferred from a code search.

Keep provider rows conditional until actual recipients are confirmed. Script distribution does not make a vendor a processor for every Shop record. Platform telemetry remains distinct from Shop database contents; BILL/INVENTORY/THERMAL and reprint/resupply semantics are unchanged.

Assign people/processes for privacy requests, notices, incidents, export delivery, retention/deletion, backups and legal holds. The 30-day request window is contractual copy, not a newly implemented scheduler or automatic purge.

## Publication, acceptance and customer UX

- The already-applied 20261002015159_legal_acceptance.sql is unchanged. New local forward migration 20261002071259_legal_policy_metadata.sql updates only revision/versions and explicitly retains `published=false`; it is not applied to a hosted database in this task. No schema, RLS, RPC, grant or evidence change.
- Only a separately reviewed server action may publish. Frontend/server versions and revision must match. Readiness rejects unfinished mandatory fields, versions/dates and an unreviewed provider schedule, but allows the intentionally shared support/legal/privacy mailbox. Browser readiness is not publication authority.
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
