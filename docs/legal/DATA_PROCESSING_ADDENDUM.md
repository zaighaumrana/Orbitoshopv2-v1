# Data Processing Terms

## 1. Scope, parties and precedence

These terms supplement the Shop's agreement with {{ENTITY}}, {{ADDRESS}}. They apply to personal information the provider processes on the Shop's behalf through the Service. The Shop generally determines purposes and means as controller/business; the provider acts as processor/service provider for those activities. Where the Shop is itself a processor, it must have authority to appoint the provider.

The provider's independent account administration, service billing, security and compliance processing is described separately in the Privacy Notice. These terms do not label all processing as being on the Shop's behalf. Applicable mandatory transfer terms prevail, then these Data Processing Terms on processing matters, then the commercial agreement.

Unpublished draft for business customers initially in Pakistan. Business details and document versions are supplied; provider schedules and operational commitments still require professional review. This draft has not been reviewed by a lawyer. Mentioning a legal instrument does not execute it.

## 2. Instructions and permitted processing

The agreement, enabled service functions, authorized use and lawful written requests constitute documented instructions. The provider will process Shop personal information only to provide and support the contracted service or as otherwise instructed, unless legally required. Where permitted, the provider will notify the Shop of a conflicting legal requirement and promptly flag an instruction it believes infringes applicable data-protection law. The parties will resolve unlawful instructions before carrying them out.

The provider will not use covered Shop personal information for unrelated advertising or other purposes outside the documented instructions and lawful service purposes. This restriction concerns covered processing, not an unverified representation about every company activity. International or enterprise use requires separately reviewed terms where necessary.

## 3. People, confidentiality and security

The provider will restrict access to authorized personnel who reasonably need it for troubleshooting, support, security, abuse investigation, recovery or maintenance and are subject to confidentiality obligations, including after access ends. Access is limited to what is reasonably necessary and logged where supported by the system; not every action is guaranteed to be logged. It will maintain risk-appropriate technical and organizational measures and not materially reduce agreed protection without an appropriate replacement. Annex B separates code-supported controls from measures requiring operational confirmation. No certification is implied.

The Shop is responsible for lawful instructions, appropriate account permissions, endpoint security, notices and collecting only needed information. These responsibilities do not relieve the provider of its own duties.

Provider-managed infrastructure is distinct from customer-owned or customer-controlled infrastructure. If the Shop elects to use its own Supabase project, database, hosting/cloud account, credentials or similar environment, the Shop owns or controls it. RetraSell may assist with initial setup or integration for RetraSell POS. The Shop remains responsible for that provider account, billing, credentials, availability, backups, recovery arrangements and infrastructure administration. RetraSell does not guarantee that independent infrastructure. To the maximum extent permitted by applicable law, RetraSell is not responsible for data loss, database failure, provider outage, suspension, deletion, corruption, credential loss or backup/recovery failure to the extent arising from the customer's infrastructure, actions or omissions, or its provider. This does not exclude responsibility for RetraSell's own actions, breach or negligence where legally applicable, or liability that cannot legally be excluded, and does not remove its duties for processing it actually performs.

## 4. Subprocessors

The Shop gives general authorization for the confirmed subprocessors in Annex C for the listed purposes, subject to applicable law and the agreed notice mechanism. The provider will impose materially equivalent applicable processing obligations and remain responsible for its subprocessors' performance of those obligations.

Individual consent is not required for every subprocessor change. The provider may notify customers of additions or replacements through the application, website, legal page or another reasonable electronic method, identifying the relevant provider and processing purpose. Notice will be provided before a change where reasonably practicable; urgent protective changes may require later notice, subject to applicable law and any agreed client-specific requirements. The Shop may raise reasonable data-protection concerns. The parties will seek a practical resolution; any termination or refund remains governed by the client agreement and mandatory law. No universal fixed notice period is promised here.

## 5. Rights, compliance and incidents

Taking account of the processing and information available, the provider will reasonably assist the Shop with access, correction, deletion, portability, restriction, objection and other applicable requests. It will refer requests concerning Shop-controlled data to the Shop unless authorized or legally required to respond directly, and will not impede mandatory deadlines.

The provider will provide reasonable assistance with security duties, impact assessments and regulatory consultation where applicable. It will notify the Shop without undue delay after becoming aware of a personal-data breach affecting covered data, with available facts about its nature, likely impact, mitigation and a contact. Further information may follow in stages. The Shop determines notices to individuals/regulators unless law requires otherwise. No universal 72-hour processor notification promise is substituted for the applicable legal duties.

The parties will cooperate in investigation and mitigation, preserve relevant evidence and limit disclosure to those who need it. Security contact and escalation procedures must be confirmed before launch.

## 6. Accountability, audits and legal requests

The provider will maintain records where legally required and make available information reasonably necessary to demonstrate compliance. It will allow and contribute to proportionate audits by the Shop or a qualified independent auditor, with safeguards for other customers' data, confidentiality and service availability. Routine requests may be answered by relevant documentation first; that does not remove mandatory inspection rights. Frequency, notice and reasonable costs may be agreed but must not frustrate rights or urgent investigation.

The provider will assess government/legal requests, disclose only what is legally required and notify the Shop unless prohibited. It will challenge requests where reasonably warranted and legally available. This is not a promise to disregard binding law.

## 7. Duration, return and deletion

Processing lasts for the service term and necessary agreed wind-down. Former customers may request export or return of available service data, including covered personal information, for up to {{EXPORT_WINDOW}}. Return/deletion requests and formats are arranged with support; no universal self-service backup, export, restore or erasure system, or recovery of data that no longer exists, is promised. After the window, data may be deleted subject to legal obligations, operational requirements, backups, fraud/security requirements and applicable retention obligations; deletion is not automatic exactly on day 30. Deletion from active systems may occur before residual backup copies naturally expire. {{BACKUP_RETENTION_POLICY}}. No guaranteed residual-backup deletion period is promised. Retained data remains protected and processing is limited to the applicable retention purpose; this does not authorize unrelated reuse. Customer-managed infrastructure responsibilities in section 3 do not remove applicable provider processing duties.

The commercial agreement governs liability only so far as permitted by applicable law and mandatory transfer instruments. Nothing limits individuals' non-excludable rights.

## Annex A - Processing details

- Subject matter: hosted Shop retail/repair records and authorized operational support.
- Duration: service term, agreed return/deletion period and lawful retention exceptions.
- Nature: collection from authorized users, storage, organization, retrieval, calculation, display, printing, access control, support and instructed deletion/return.
- Purposes: sales, repairs, payments/credit, stock management, staff workflows, reports and receipts.
- Individuals: Shop owners, authorized employees, Shop customers and people identified in authorized notes/support requests.
- Data: identity/contact details, account identifiers/roles, device identifiers, work notes, transaction/payment/credit records, stock-linked activity, attendance/leave/salary information, audit references and relevant support records.
- Sensitive information: not requested as a general product function; free-text notes may contain sensitive material. The Shop must identify any permitted special-category or regulated processing and agree safeguards before use.
- Frequency: ongoing during use; support and exports as required.

## Annex B - Security measures and confirmation boundary

Implemented in client/server code: Supabase-backed authentication, canonical account-role authorization, database row-level policies, server-controlled privileged account operations, hashed override-PIN verification, role/module checks, suspension controls, dedicated Support identity with access logging, server-side bridge transport and scoped secrets outside browser code.

These controls are not a guarantee against every incident. Deployment configuration, patching, access reviews, workforce confidentiality, incident response, backup/restore testing, disaster recovery, provider encryption settings and deletion verification require operational confirmation. No SOC 2, PCI-DSS, blanket GDPR compliance, at-rest encryption or recovery-time certification is asserted by this annex. Agree a verified security schedule for the deployed service before relying on these terms in regulated processing.

## Annex C - Provider/subprocessor register

{{SUBPROCESSORS}}

This register lists infrastructure providers evidenced by the repository, not completed vendor due diligence or a claim that every provider receives Shop contents. Confirm contracting entities, roles, processing regions, vendor terms and change notices; customer-controlled provider accounts must be distinguished from provider-managed services. A code-distribution vendor is not automatically a processor for all Shop data. GitHub source/deployment hosting alone does not make it a Shop-data subprocessor. The current Gmail business mailbox is a communication channel for enquiries, not an application email feature. The Service is not currently marketed as providing SMS or email services. Support communications and any actual additional recipients must be assessed during provider review.

## Annex D - International transfers

The initial market is Pakistan. Identify actual processing/support countries, recipients, purposes and any applicable transfer requirements for each deployment. No country-specific transfer instrument or guarantee of local-only hosting is created by this annex. International customers or enterprise requirements need separate professional review and, where required, appropriate additional agreements before expansion. Contact {{PRIVACY_EMAIL}} for confirmed processing arrangements.
