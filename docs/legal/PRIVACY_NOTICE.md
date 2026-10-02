# Privacy Notice

## Short notice

The Service processes Shop business records to run sales, repairs and staff workflows. Shops generally decide why customer and employee records are collected. The provider also processes account, security, support and usage information for its own service operations. Shop storage is not the same thing as the information sent to the Platform.

Provider: {{ENTITY}}, {{ADDRESS}}. Privacy enquiries: {{PRIVACY_EMAIL}}. Legal enquiries: {{LEGAL_EMAIL}}. This unpublished draft is intended initially for business customers in Pakistan. Business details and document versions are supplied; professional legal and provider confirmations remain pending. It has not been reviewed by a lawyer and is not a certification of compliance.

## Who is responsible

For Shop-entered customer, transaction, repair and employee information, the Shop generally acts as controller/business and the provider as processor/service provider on its instructions. Actual responsibilities depend on the activity and applicable law.

For independently determined account administration, service billing, abuse prevention, security, compliance and limited operational diagnostics, the provider may act as controller/business. Support can involve both roles depending on the request. Contract acceptance acknowledges these documents; it is not blanket consent for every processing purpose or a waiver of privacy rights.

## What is processed and why

- Business identity: Shop name, address, phone, logo, owner contact and configuration support identification, account management and service configuration. The Shop supplies them; the provider may use business contact information for its own administration.
- Authorized users: names, email/login identities, roles, account status and authentication/session records enable access control and account recovery. Employee operational records are generally processed for the Shop; service-security records may serve the provider's independent purposes.
- Customers and repairs: names, phone numbers, device brand/model/IMEI, requested work, notes, quotations, repair statuses, approvals and related invoices support repair and customer-service workflows on the Shop's behalf.
- Sales and finance: line items, discounts, taxes, amounts, payment methods, payment allocations, returns, adjustments, outstanding balances and credit history support the Shop's records. Recording a payment method is not proof of payment-provider processing or a certification for storing card data.
- Employees and inventory: stock items, quantities, prices/costs and movements; where EMS is enabled, attendance, leave reasons and salary records. These support Shop operations, not an advertising profile.
- Support/security: password-reset requests, verified Support access records, platform identity, client support identity, browser user-agent and diagnostics support assistance and abuse investigation. Login verification sends a challenge token and, when available, connection IP to Cloudflare. Infrastructure providers may process their own connection logs.
- Legal evidence: business-scoped identifier, accepting Owner identity/name, role, document versions, required revision and server time record authority and agreement. This feature does not add IP collection or fingerprinting.

Collect only what is needed. Shop users should not paste passwords, device contents or unrelated sensitive information into notes. Employee leave or repair notes can contain sensitive information even though the service is not designed to collect it.

## What goes to the Platform

The bridge's usage messages contain Shop/source binding, event identifiers, sequence, operation, timestamps and a metric count. They do not contain customer names, repair notes, transaction line items or sale/payment totals. The legacy usage path instead sends client identifier, metric, one-event count and a legacy rate value. That rate is service-metering metadata, not the Shop's revenue.

Thermal records identify the document type and internal document ID, copy count, estimated millimetres, paper width, template/measurement/calibration versions, measurement status, reprint indicator, original-event reference and an integrity hash. They carry event/source metadata too. Identifiers and hashes can be linkable information; they are not claimed to be anonymous.

Thermal records represent a request to print and estimated paper use, not proof that a physical printer completed a job. Reprints can generate thermal activity but not another BILL event. Thermal analytics may continue when Paper Resupply is disabled; printing remains available.

Paper resupply messages contain request identity and request time with Shop/source metadata. Requesting-user identity is retained in the Shop record; it is not part of the current resupply message body. The Platform returns billing/usage summaries, charges/balances, platform invoice information, and resupply lifecycle updates to the Shop. These returned amounts concern the service account, not transmission of Shop customer invoices.

Support sign-in sends the entered Platform master credentials to Platform authentication for verification. Normal Shop passwords are not sent through that Support-only path. Authorized support personnel may access Shop/account information where reasonably required for troubleshooting, support, security, abuse investigation, recovery or maintenance. Access is limited to what is reasonably necessary, restricted to authorized personnel and logged where supported by the system, without promising that every action is logged. The narrow telemetry contract does not mean Support can never view Shop data.

Delivery depends on configured services and bridge mode. We do not imply that all Shop records are copied to Platform simply because they exist in the Shop database.

## Recipients and technology

Supabase supplies database/authentication/function infrastructure; Cloudflare Pages supplies frontend hosting and Cloudflare Turnstile supplies anti-abuse verification. Printing currently loads a barcode script from jsDelivr, and server modules use esm.sh distribution. These services may receive network metadata; scripts execute within their page context. Provider roles, contracts and processing locations require confirmation in the current subprocessor schedule.

The Service is not currently marketed as providing SMS or email services. The present {{SUPPORT_EMAIL}} Gmail mailbox is a business communication channel for support, legal and privacy enquiries, not an application email feature or automatic Shop-data feed. Information voluntarily included in those enquiries is handled through that mailbox. Analytics provider: {{ANALYTICS_PROVIDER_OR_NONE}}. Error-monitoring provider: {{ERROR_MONITORING_PROVIDER_OR_NONE}}. Other unrelated subprocessors: {{OTHER_SUBPROCESSORS_OR_NONE}}. GitHub source/deployment hosting alone does not make it a Shop-data subprocessor.

Provider-managed infrastructure is distinct from an environment owned or controlled by the customer. Where you elect to use your own Supabase project, database, hosting/cloud account, credentials or similar infrastructure, RetraSell may assist with initial setup or integration for RetraSell POS. You control that environment and are responsible for its provider account, billing, credentials, availability, backups, recovery arrangements and administration. RetraSell does not guarantee that independent infrastructure. To the maximum extent permitted by applicable law, RetraSell is not responsible for data loss, database failure, provider outage, suspension, deletion, corruption, credential loss or backup/recovery failure to the extent caused by the customer's infrastructure, actions or omissions, or its provider. This does not exclude RetraSell's responsibility for its own actions, breach or negligence where legally applicable, or non-excludable liability; privacy duties applicable to its actual processing remain.

Access may also be given to authorized support personnel, suppliers needed to perform the agreement, professional advisers, and authorities where lawfully required. No advertising integration was found in this client code. That observation is not a company-wide representation about sale/sharing practices; the business must confirm any legally required no-sale/no-sharing statement before publication.

Where Live Tracking is enabled, a person who provides a matching ticket/invoice reference and customer phone number can receive the ticket/invoice number, customer name, device brand/model, masked IMEI, status, creation date, quote/final total and noted components. This is customer-facing access from the Shop, not the Platform telemetry feed. Keep tracking references private.

## Browser storage

The app uses sessionStorage for Supabase session credentials and navigation/handoff state, localStorage for theme and a retry identifier for resupply, and IndexedDB for pending thermal print-intent records associated with the signed-in user. Queued or rejected intents can remain until delivered or resolved; signing out is not a complete purge of device storage. Protect shared devices and use individual sessions.

Authentication and anti-abuse providers may use their own browser technologies. No optional advertising cookie category or consent banner is invented here. Receipt windows expose the selected receipt to the user's browser/printer; protect printed and downloaded copies.

## Legal bases and retention

Where a legal-basis requirement applies, the Shop determines the basis for its operational records. For the provider's independent processing, relevant bases may include performance of a contract with an individual, legitimate interests in administering and securing the service (subject to balancing and rights), legal obligations, or consent where required. A business contract does not automatically supply a basis for every employee/customer record. Request details from {{PRIVACY_EMAIL}}.

Information is retained as reasonably necessary for service delivery, contractual records, legal obligations, operational requirements, fraud/security, dispute resolution and documented instructions. Former customers may request export or return of available service data for up to {{EXPORT_WINDOW}}. After that window data may be deleted, subject to those obligations and applicable backup/retention requirements; this is not a promise of automatic deletion exactly on day 30. Deletion from active systems may occur before all residual backup copies naturally expire. {{BACKUP_RETENTION_POLICY}}. No guaranteed residual-backup deletion period, universal self-service backup/export/restore system or recovery of data that no longer exists is promised. Financial records may need preservation rather than destructive editing. Deactivation is not erasure. Export/deletion requests require assistance; customer-managed backup and recovery remain the customer's responsibility as explained above.

## International processing

The initial customer market is Pakistan, but hosting, provider support and remote access may involve other countries. Actual regions and recipients must be confirmed for the deployment and any applicable requirements addressed. This notice does not claim that data stays only in Pakistan or that an international transfer mechanism has already been completed. Expansion to international customers requires separate legal and operational review.

## Your choices and rights

Depending on applicable law and circumstances, rights may include information, access, correction, deletion, restriction, portability, objection, withdrawal of consent, and complaint to a competent regulator. Exceptions and identity verification may apply; we will not treat a legitimate rights request as misconduct.

For Shop-controlled information, contact the Shop first. The provider assists the Shop where required and will explain when it must refer a request. For information controlled by the provider contact {{PRIVACY_EMAIL}}; identify the Shop and request without sending unnecessary identity documents. Applicable statutory deadlines take precedence over internal processes.

You can also raise a privacy complaint at that contact. Complaints will be acknowledged, investigated and answered within timeframes required by applicable law. You retain the right to complain to the competent regulator.

This business service is not directed to children, but Shops may enter information involving minors. Shops must assess applicable safeguards; we do not claim such information can never be present.

## Contacts and updates

Privacy/data requests: {{PRIVACY_EMAIL}}. Legal notices: {{LEGAL_EMAIL}}. General support: {{SUPPORT_EMAIL}}. Phone / WhatsApp: {{SUPPORT_PHONE}}. The same current business contact address handles support, legal and privacy enquiries. No DPO or overseas representative is claimed to have been appointed; any required appointments will be confirmed before applicable expansion.

Material changes will be communicated appropriately. Versions and effective dates are displayed with this notice. Additional country-specific terms may be added after local review; no claim is made that one notice satisfies every jurisdiction.
