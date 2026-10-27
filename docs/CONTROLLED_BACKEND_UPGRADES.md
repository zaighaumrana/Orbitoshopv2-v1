# Controlled backend upgrades — support-v7

27 October 2026, Asia/Karachi. This is the primary procedure for existing Shops.
Source approves support-v7: **39 migrations, seven functions**, fingerprint
`c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada`, backend source
`50b94931ecf743166136b2c562cbb6d2fbaebdc7`. V6 remains supported; v5 is unsupported.
Source promotion does not activate the hosted catalog or upgrade any Shop. The
owner must deploy pending Platform migrations/functions before using this procedure;
each actual upgrade needs separate authorization.

New empty-project BYO provisioning uses [BYO_GUIDED_SETUP.md](BYO_GUIDED_SETUP.md).
Existing Shops use this controlled procedure: never repeat fresh setup, owner
bootstrap, pairing or credential creation to upgrade. Managed upgrades use the
live Master Platform review/approval/bounded executor. The old terminal
`--mode managed` path is refused. Do not give customer scripts Platform PATs or
administrative credentials.

## 1. Customer authentication and exact target

Use Node 24, the reviewed checkouts and a compatible native Supabase CLI (reviewed
version 2.120.0). Replace placeholders locally. Create a private non-synced folder
outside both repositories first; restrict its Windows ACL to the customer admin
and required system administrators. Check the ACL; file mode 0600 is insufficient.

```powershell
Set-Location 'C:\Users\CUSTOMER\Source\Orbitoshopv2-v1'
$Cli = 'C:\Tools\supabase.exe'
$ShopRef = 'REPLACE_WITH_EXACT_20_LETTER_SHOP_REF'
$ClientId = 123 # Replace with the actual Platform client ID
$PlatformRef = 'ukbhyerxshteyetwomqy'
$Private = 'C:\Private\RetraSell'
$Journal = Join-Path $Private 'support-v7-upgrade.json'
$Assessment = Join-Path $Private 'support-v7-assessment.json'
node --version
& $Cli --version
node scripts/setup-byo.mjs --login --cli $Cli
& $Cli projects list --output json
npm run release:check
```

Expected: customer-owned account login, exact Shop project visibility and PASS
release parity. Parity needs the matching reviewed Platform sibling `orbito`
checkout (or `RETRASELL_PLATFORM_SOURCE`). Independently check the Dashboard and
Platform client/project/source UUID/binding. Platform must never be the Shop.
Owner context only: existing BYO client #1 is `ampwuqwokkbhkizcetsd`, Managed client
#2 is `yqiefgcdvnfmdhuhitdq`. Do not reuse these for another customer. Wrong account,
inaccessible target or failed parity: stop. Platform never collects customer PATs,
service keys or database passwords.

## 2. Establish actual installed source

```powershell
$Inventory = Join-Path $Private 'backend-inventory.json'
node scripts/inspect-backend.mjs --project-ref $ShopRef --client-id $ClientId --cli $Cli --report $Inventory
```

Expected: `read_only: true`, exact identity, migration/function/gateway/capability
findings and explicit limitations. Do not guess from the original v4 provisioning
pin or a completed v6 upgrade receipt. Compare current ordered version/name/SHA256
provenance and all seven function packages/JWT gateways with the immutable release
using authorized provider/source evidence. V5/v6 SQL histories are identical: ledger
count/hashes alone cannot distinguish them. This CLI does not independently recover
package sources. Ambiguity or `verified_release: null` remains unverified; reconcile
with the Master and authoritative evidence before declaring `--from-sha`. Drift or
unknown provenance requires separately authorized repair/adoption. Runtime health
alone is insufficient.

Only for a **verified/reconciled v6 source**, use:

```powershell
$FromSha = '64fcec36fa7a5e2565db2a6d3aa6ddbd8e6c1170eefd4a07a57ae6ba0c066a31'
```

Do not use this value just because the example uses v6. Full Managed verification
also can remain pending: provider downloads may omit packaged files and historical
packages lack a complete canonical SQL/security baseline. Scoped and customer-
reviewed evidence retain separate trust classifications.

## 3. Read-only upgrade assessment

```powershell
node scripts/upgrade-backend.mjs --mode byo --project-ref $ShopRef --client-id $ClientId --from-sha $FromSha --journal $Journal --report $Assessment --cli $Cli --review
```

Expected JSON contract `retrasell-byo-upgrade-assessment-v1`, exact identity/source/
target, observation and plan. Output creation is exclusive; an existing report is
not overwritten. Review checks exact SQL provenance, owner readiness, binding,
gateways and protocol compatibility without provider writes. Review does not create
an execution journal. Preserve any original execution journal. For a new assessment
use a new report filename and retain earlier evidence. Rejected identity, ownership,
gateway, source or compatibility means stop and reconcile.

Verified v6 → v7 expects **one migration** `migration:20261025233743` and **zero
changed Edge Function packages**. It requires no fresh install, repeated owner
bootstrap, pairing or credential replacement. The approved plan and live evidence
remain authoritative; unexpected steps mean stop and reconcile before approval.
Older supported sources have different additive plans.

Send only the permitted assessment JSON to Master Admin through the agreed private
channel. It contains projected identity/evidence, not credentials. Do not upload
private journals, pairing/runtime files, CLI tokens or clearance files to Platform,
GitHub or public documentation. Assessment evidence is customer-reported, not
independently obtained deployed-source proof.

## 4. Master authorization and separate clearance

Master opens the exact BYO client upgrade panel and loads existing status first.
Select the evidenced supported source, import the assessment, explicitly acknowledge
fresh evidence, and reconcile original pending operations. Review plan/digest,
source limitations, customer acknowledgment and any actual maintenance/notification
conditions. Approval confirms the exact project and target; it does not install.

Use the panel's customer-clearance download. The real filename is
`retrasell-upgrade-<request-UUID>.json`; clearance expires after two hours, grants no
Supabase administrative access and is stored hash-only on Platform. Transfer it
securely to the authorized customer admin's restricted private folder; remove
redundant Downloads copies. Keep it separate from the journal.

```powershell
# Replace the placeholder with the actual downloaded request UUID.
$Approval = Join-Path $Private 'retrasell-upgrade-REPLACE_WITH_REQUEST_UUID.json'
```

Never edit clearance, substitute keys or put it in Git, browser storage, query
strings or logs. The tool accepts the original Platform publishable or legacy anon
public key and verifies it against that project's Auth settings before sending
clearance authority. Expired/revoked clearance needs Master status review and
reapproval of the **same original request and plan**.

## 5. Customer apply and verification

Only after separate authorization for the exact Shop:

```powershell
node scripts/upgrade-backend.mjs --mode byo --project-ref $ShopRef --client-id $ClientId --from-sha $FromSha --journal $Journal --approval-file $Approval --platform-project-ref $PlatformRef --cli $Cli --apply
```

Type the exact `UPGRADE <ShopRef> <target-SHA256>` confirmation displayed. Customer
CLI account access supplies Shop authority. The tool claims the same durable
Platform request, matches plan digest/client/project/source/target/source UUID/
binding, and checks live clearance plus pending-operation fences before writes.
The private exclusive lock/journal complements Platform's executor fence. SQL uses
atomic approved migration envelopes and exact ledger read-back; only changed
approved function sources deploy, preserving JWT gateways.

Expected final output includes `Original upgrade <UUID>: verification_required`
and `Components recorded; deployed-source review and hosted acceptance remain pending.`
The bounded executor may resume `paused` checkpoints internally. Final checks cover
exact ledger, function/gateway presence, owner/binding and SQL runtime.

```powershell
$After = Join-Path $Private 'backend-inventory-after-v7.json'
node scripts/inspect-backend.mjs --project-ref $ShopRef --client-id $ClientId --cli $Cli --report $After
```

Use a new output path. Expect 39 exact migrations, seven functions with matching
gateways and `bounded-operational-reads`. `platform-bridge` uses `verify_jwt=false`;
all other six use `true`. Compare actual deployed source separately when available;
missing source stays pending and provider bundle hashes do not prove package-source
hashes. Master reviews final original checkpoints and can explicitly accept reviewed
components with full-source limits still visible/audited. A receipt is not proof of
current independent verification. Hosted Auth/CAPTCHA/Support, billing/usage and POS
acceptance remain separate owner steps.

## 6. Failure and original-operation recovery

Keep original request, journal, clearance, source/target and checkout. Do not start
fresh setup or create another UUID/journal to bypass uncertainty. Load the original
Platform status. Master inspects the actual provider outcome and checkpoint, waits
any safety interval and records an audited reference/reason through the existing
reconcile/reapproval flow. Elapsed time or function presence never proves success.

After reconciliation and renewed clearance for the **same** request/plan, rerun the
same apply command with the original journal. Passed checkpoints remain passed;
unknown/running steps block blind replay. Lost claim replies, expiry or revoked
Master sessions need original-status review too. Remove a stale `.lock` only after
verifying the original process stopped. This upgrade CLI has no `--status`,
`--confirm-provider-complete` or `--provider-reference` option; recovery decisions
belong to the original Platform job. Setup-tool flags do not apply here.

Platform unavailability blocks upgrades without suspending a healthy Shop. Data,
queues, consent, owner, pairing and credentials remain intact. The BYO journal stays
customer-local; Platform retains the authorized receipt, original checkpoint/review
history and audit. Source promotion/frontend publication does not rewrite them.
