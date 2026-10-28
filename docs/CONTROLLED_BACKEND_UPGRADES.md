# Controlled backend upgrades — support-v7

28 October 2026: the primary operator experience is now Platform → existing BYO
client → Controlled Backend Upgrade → Customer CLI instructions. Its ten inline
stages supply current client commands, expected results and recovery. This document
is the technical fallback; private Platform source is not a customer prerequisite.

Release reference, updated 28 October 2026, Asia/Karachi. This is the technical fallback.
Source approves support-v7: **39 migrations, seven functions**, fingerprint
`c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada`, backend source
`50b94931ecf743166136b2c562cbb6d2fbaebdc7`. V6 remains supported; v5 is unsupported.
Source promotion does not activate the hosted catalog or upgrade any Shop. The
owner must confirm compatible Platform migrations/functions before using this procedure;
each actual upgrade needs separate authorization.

New empty-project BYO provisioning uses [BYO_GUIDED_SETUP.md](BYO_GUIDED_SETUP.md).
Existing Shops use this controlled procedure: never repeat fresh setup, owner
bootstrap, pairing or credential creation to upgrade. Managed upgrades use the
live Master Platform review/approval/bounded executor. The old terminal
`--mode managed` path is refused. Do not give customer scripts Platform PATs or
administrative credentials.

## 1. Customer authentication and exact target

Use Node 24, the reviewed Shop checkout and a compatible native Supabase CLI (reviewed
version 2.120.0). Replace placeholders locally. Create a private non-synced folder
outside both repositories first; restrict its Windows ACL to the customer admin
and required system administrators. Check the ACL; file mode 0600 is insufficient.

```powershell
Set-Location 'C:\Users\CUSTOMER\Source\Orbitoshopv2-v1'
$ShopRef = 'REPLACE_WITH_EXACT_20_LETTER_SHOP_REF'
$ClientId = 123 # Replace with the actual Platform client ID
$PlatformRef = 'ukbhyerxshteyetwomqy'
$Private = 'C:\Private\RetraSell'
$Journal = Join-Path $Private 'support-v7-upgrade.json'
$Assessment = Join-Path $Private 'support-v7-assessment.json'
node --version
supabase --version
supabase login
supabase projects list --output json
node scripts/release-preflight.mjs --expected-sha c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada
```

Expected: customer-owned account login, exact Shop project visibility and PASS
customer release preflight. It validates approved customer metadata, exact source
fingerprint/manifests and committed backend ancestry without private Platform source. Independently check the Dashboard and
Platform client/project/source UUID/binding. Platform must never be the Shop.
Owner context only: existing BYO client #1 is `ampwuqwokkbhkizcetsd`, Managed client
#2 is `yqiefgcdvnfmdhuhitdq`. Do not reuse these for another customer. Wrong account,
inaccessible target or failed preflight: stop. Platform never collects customer PATs,
service keys or database passwords.

### Windows native tooling and internal parity

Check git --version, node --version, scoop --version and supabase --version first.
Use Node 24+. Do not reinstall working tools. In non-admin PowerShell, only if Scoop
is missing and organizational policy permits:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
scoop install git
scoop install nodejs-lts
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
supabase --version
```

Install only missing packages. Reopen PowerShell after installation; Get-Command
supabase diagnoses PATH. The scripts discover compatible native executables from
PATH (including Scoop shims); an explicit native --cli override remains optional.
Capability checks fail closed for incompatible CLI versions; update with Scoop.
No package runner or hardcoded executable path is required.

INTERNAL OPERATORS ONLY: npm run release:check imports the authoritative checker
from a matching sibling orbito checkout or RETRASELL_PLATFORM_SOURCE override. Use
reviewed compatible development checkouts (or the explicitly reviewed immutable
Shop/Platform commits recorded in the paired CI workflows). Inspect both
remotes, branches, revisions and overrides first. The old verified-customer-support
Platform branch selects v6/38 migrations against M2 Shop's 39 and must be blocked.
Restore the compatible pairing while preserving local changes; never remove SQL,
edit metadata, regenerate v7 or force-reset to bypass parity. Ordinary customers
use release-preflight.mjs above and do not need Platform repository access.

## 2. Establish actual installed source

```powershell
$Inventory = Join-Path $Private 'backend-inventory.json'
node scripts/inspect-backend.mjs --project-ref $ShopRef --client-id $ClientId  --report $Inventory
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
node scripts/upgrade-backend.mjs --mode byo --project-ref $ShopRef --client-id $ClientId --from-sha $FromSha --journal $Journal --report $Assessment  --review
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
node scripts/upgrade-backend.mjs --mode byo --project-ref $ShopRef --client-id $ClientId --from-sha $FromSha --journal $Journal --approval-file $Approval --platform-project-ref $PlatformRef  --apply
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
node scripts/inspect-backend.mjs --project-ref $ShopRef --client-id $ClientId  --report $After
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

## 28 October 2026 — Complete copy blocks and original-wizard teaching structure

The in-app Customer CLI instructions now uses the fresh BYO wizard’s teaching
structure: objective, Where, Before you start, numbered tasks, command purpose,
success/failure checks, When to continue and recovery. Ten stages are browsed with
Back/Next or the stage selector. Browsing is local operator navigation, never
backend evidence or an automatic acknowledgment of command success.

Use Copy whole block. Every operational block runs in its own PowerShell scope
and restores the exact client/project/source/target and required paths. Inspection
and assessment check the native exit code, require the new report file, parse its
actual schema and compare its identities/binding before printing a final PASS.
Nonzero exit, missing report or mismatch throws STOP. Inventory PASS means report
collection/identity checked, not independently verified installed release. Assessment
PASS names the generated file and planned SQL/function counts. A reconciled v6→v7
plan expects one SQL/zero functions; unexpected changes require review before approval.

Optional browser-only Shop-folder and final private-folder inputs generate
noninteractive path assignments. Otherwise each block prompts independently. Paste
only a full directory path (spaces/parentheses allowed), without cd/Set-Location;
quotes are unnecessary. The default final folder is under the current user profile:
RetraSell-BYO-Private/client-<ID>-support-v7. Accept it only if it matches your original
work, or restore the exact original final folder. Windows permissions must restrict
access to the customer administrator and required system administrators. Reports get
unique names; the original journal is never created or overwritten by assessment.
A custom existing journal must be restored at its prompt, not replaced to bypass
uncertainty. Clearance remains a separate private file for the exact original request.

Missing preflight script in an older clean M2 checkout: stage 3 now checks the
remote, exact M2 branch and clean status, fetches origin, rejects divergent/local-
ahead history and fast-forwards with --ff-only, then checks the scripts again.
Dirty/wrong/divergent work stops for owner review. No reset, forced switch, deletion
or journal replacement is part of recovery. The owner’s separate real trial checkout
and private files were not changed by this implementation.

Customer stages contain only customer release-preflight. Internal sibling Platform
parity/override instructions remain in the separate developer section above; private
Platform source is not a customer prerequisite. Native Scoop/PATH tooling, exact
Master approval, original request/clearance/journal and provider fences are unchanged.

## Final M2 source and merge handoff — 28 October 2026

Customer checkout guidance uses reviewed development or an explicitly approved
immutable source revision; branch names alone never prove release integrity. The
lower-level fresh setup helper uses existing customerReleasePreflight rather than
an obsolete temporary-branch allowlist. Customer upgrade help links to development;
private Platform source remains required only for internal paired CI, not customers.

Paired workflows preserve existing immutable peer SHAs and run on PRs targeting
development and pushes to development. Merge Shop PR #3 before Platform PR #6 using
merge commits, retaining approved backend source ancestry; never squash away
50b94931ecf743166136b2c562cbb6d2fbaebdc7. Before that Shop merge, keep the reviewed
existing checkout/immutable tooling revision because development lacks M2 tools.
Owner approval to commit/push and later separate approval to merge remain mandatory.
No branch deletion is authorized. Existing support-v7 fingerprint and all historical
packages/records remain unchanged. See the milestone final cleanup report and
Platform docs/PR6_RELEASE_REPORTING_FIX.md for the complete transition handoff.