# Customer-controlled backend upgrade — 2026-10-23

Current fresh source is immutable support-v6, 38 migrations /7 functions, SHA-256
64fcec36fa7a5e2565db2a6d3aa6ddbd8e6c1170eefd4a07a57ae6ba0c066a31.
V4 remains supported; v5 is superseded and never installed. Historical pins do not
prove current deployed source. No new packaged Shop backend is needed for this
control-plane/tooling change; v6 bytes and fingerprints stay unchanged.

Use Node24, the final reviewed checkouts and a compatible native Supabase CLI.
Authenticate only to the customer's own account. No Platform form takes a customer
service key, PAT or database password. Run `npm run release:check` before approval.
Existing terminal Managed mode is refused; Managed uses the live Master Platform
review/approval/bounded executor. This replaces the historical ungated procedure.

## Read-only assessment

```powershell
node scripts/setup-byo.mjs --login
node scripts/upgrade-backend.mjs --mode byo --project-ref EXACT_SHOP_REF --client-id CLIENT_ID --from-sha ACTUAL_APPROVED_SOURCE_SHA --journal C:/Private/RetraSell/upgrade.json --report C:/Private/RetraSell/assessment.json --cli C:/Path/supabase.exe --review
```

Private parent directory must already exist outside both repositories. Assessment
report creation is exclusive: an existing report is not overwritten. Review reads
only fixed project/identity, migration hash, function gateway and runtime evidence;
no provider write is performed. It verifies exact ordered source SQL provenance,
owner readiness, source/binding and protocol compatibility, and computes only missing
SQL/changed packages. Missing/drifted gateways or unknown source require explicit
repair/adoption. Local assessment does not prove independent provider source bytes.

Give only the nonsecret projected assessment to the Master. They import it into
the exact BYO client upgrade panel, review source limitations, clear original pending
Platform operations, approve exact request/plan/hash and any actual maintenance/
notification requirements. Platform labels this customer-reported evidence.
Download the private two-hour clearance for the customer administrator. It is
hash-only on Platform and grants no Shop administrative authority. Preserve it in
a separate private file; never Git, browser storage, query strings or logs.

## Explicit customer application

```powershell
node scripts/upgrade-backend.mjs --mode byo --project-ref EXACT_SHOP_REF --client-id CLIENT_ID --from-sha ACTUAL_APPROVED_SOURCE_SHA --journal C:/Private/RetraSell/upgrade.json --approval-file C:/Private/RetraSell/approval.json --platform-project-ref EXACT_PLATFORM_REF --cli C:/Path/supabase.exe --apply
```

Type the exact UPGRADE project/target confirmation. The tool requires that separate
customer approval and actual customer CLI project access. It validates the clearance
contract/digest/public key and exact Platform/customer identities, then claims
the SAME durable Platform request. It cannot begin with only a self-reported local
"operations cleared" flag. Any unresolved Platform provisioning/configuration,
owner/bootstrap or unknown provider write blocks execution. A private original
journal/local exclusive process lock complements Platform's concurrent executor
fence. Each provider write is preceded by live clearance and exact Shop checks.

The customer CLI accepts both Supabase publishable keys and legacy anon JWTs in
the original clearance; no JSON editing or key substitution is needed. It rejects
privileged/malformed keys and checks the key against the exact explicitly supplied
Platform project's read-only Auth settings endpoint before sending any clearance
token. Publishable keys are opaque, not decoded JWTs. Redirects, network failures,
invalid keys and unexpected responses stop conservatively and preserve the original
clearance/journal. Successful key verification does not authorize an upgrade: the
original live claim must still pass expiry, revocation, session and pending-operation
gates and return the exact request/client/project/source/target/binding/plan digest.
No backend redeployment, new release or repeat of a completed upgrade is required.

SQL uses approved atomic migration envelopes and exact ledger read-back; functions
deploy only changed approved sources with original JWT settings. Unchanged packages,
owner, pairing, secrets, customer data and original provisioning pins remain intact.
Two-step serial checkpoints use the same shared Managed executor/requirements.

Preserve the original journal after any failure. Running/unknown outcomes are never
blindly repeated, even if a function exists. Master must inspect actual original
provider outcome, wait the safety interval and record an audited reference/decision
on the original Platform job. Lost claim reply, stopped process, expiry or revoked
Master session similarly require original status/reapproval. A refreshed clearance
must refer to the SAME plan/request. Verify a stale process stopped before removing
its local lock. No new UUID conceals uncertainty.

Final ledger/function/gateway/owner/SQL runtime checks record components installed,
with source review pending. Customer reports never automatically mark full deployed
source verified. Master can explicitly accept reviewed component evidence while the
full-source limitation remains visible/audited. Hosted browser/Auth/CAPTCHA/Support,
billing, usage and POS acceptance remain separate. Platform unavailable blocks an
upgrade without suspending a healthy Shop. Existing queues/consent/journals survive.

These new endpoints require the new Platform forward migration then platform-upgrade
deployment and compatible UI. Existing Platform v26/inventory v1 are not reinstalled.
No hosted customer upgrade or fresh installation was performed in this pass.
Fresh hosted Managed/BYO acceptance is pending by owner choice; inaccessible BYO
administrator/provider verification remains BLOCKED. Keep both existing PRs Draft,
Open, unmerged against development; no production promotion.
