# Customer-operated BYO setup — authoritative procedure, 2026-10-22

Current milestone: both fresh provisioning paths select the final shared release
recorded in `scripts/byo-release-manifest.json` (approved-shared). Earlier v2/v3
references below describe their checkpoints. Existing Shops must use
[controlled backend upgrades](CONTROLLED_BACKEND_UPGRADES.md), which apply only
missing SQL and changed approved function packages. Existing-mode installation now
stops rather than applying SQL without the matching functions. Preserve interrupted
jobs' original release checkout and journals; never repin them to this release.

Use the reviewed Shop checkout and Platform Client Detail → **Resume BYO Setup**.
The Platform presents the original twelve stages one at a time. Its saved
acknowledgments are not installation receipts. The customer-side journal remains
authoritative for local operations; Platform cannot read it. This document replaces
the older branch/manual deployment sequence in `BYO_SETUP.md`.

The current source-approved fresh release is support-v7 (39 migrations, seven
functions), fingerprint c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada.
Hosted activation and customer installation are separate owner operations. Support-v6
remains a supported historical source. Never repin an unresolved operation or use
a database reset as recovery.

## Prepare customer-side files and tooling

Use Node.js 22.12+ (or Node.js 24) and a native Supabase CLI v2 with the checked capabilities. The
reviewed CLI is 2.120.0. These checks contain no credentials:

```powershell
node --version
npm --version
npx --yes supabase@2.120.0 --version
node scripts/setup-byo.mjs --login
```

The last command starts interactive login to the authorized customer account only.
The coordinator discovers native executables in PATH/npm cache and checks version,
db query, API function deployment and env-file capabilities. Project visibility is
checked before installation; visibility alone does not prove write authority.
An explicit native executable can be supplied using `--cli`.

Create an existing private folder outside both repositories. On Windows, use folder
Properties → Security → Advanced to restrict inherited access to the authorized
operator (and required system administrators). Check the resulting ACL before
saving secrets; POSIX mode 0600 is not a Windows ACL guarantee. Avoid shared/synced
folders and remove redundant Downloads copies. Keep original files throughout
recovery and optional Support enrollment; do not delete pairing early.

Download the exact client's pairing file. It contains generated project/client
metadata and bridge credentials. Match it to the independent intended target in
Platform; never edit or regenerate it to bypass a mismatch. Positive Client IDs,
including a legitimate new Client 1 after Platform reset, are supported. The old
protected project `kxmovywgshyltwusghhj` remains blocked by exact project identity.
Platform and Shop must be different Supabase projects.

In Notepad, create `runtime.env` in that private folder. Use Save as type **All
files** so it is not saved as `runtime.env.txt`. Paste the one-line template and
replace the placeholder locally with the customer's own server-side widget secret:

```env
TURNSTILE_SECRET=REPLACE_WITH_CUSTOMER_PRIVATE_TURNSTILE_SECRET
```

Use unquoted `NAME=value`, no prose. Never upload the real file or secret to
Platform, GitHub or public Cloudflare/Vite configuration. Do not echo values into
commands. Never use a site key, CLI token, service key or testing secret instead.

Separately create `public-shop.json` with exactly these three public fields:

```json
{
  "VITE_SUPABASE_URL": "https://NEW_SHOP_REF.supabase.co",
  "VITE_SUPABASE_ANON": "REPLACE_WITH_TARGET_PUBLIC_ANON_JWT",
  "VITE_TURNSTILE_SITE_KEY": "REPLACE_WITH_CUSTOMER_PUBLIC_SITE_KEY"
}
```

The anon JWT must be unexpired, role anon and bound to that ref. The installer
checks target, public/private separation and common credential mistakes. Static
checks do not prove the widget key pair or successful browser CAPTCHA.

## Install and resume

Replace the example Client ID/ref with the independently reviewed Platform target:

```powershell
node scripts/setup-byo.mjs --journal "PRIVATE_FOLDER\journal.json" --client-id 1 --project-ref NEW_SHOP_REF --pairing-file "PRIVATE_FOLDER\orbito-shop-pairing.env" --runtime-file "PRIVATE_FOLDER\runtime.env" --public-config "PRIVATE_FOLDER\public-shop.json" --mode fresh
```

Explicitly review **fresh** versus **existing**. Fresh requires an empty eligible
project or the exact resumable installation prefix. Existing mode is not an upgrade path: an older initialized Shop is stopped and
redirected to the controlled-upgrade procedure. Original pairing/binding and
provenance remain required; do not select fresh to bypass this protection.
Existing-Shop Paper sender updates require separate targeted rollout approval.

Preflight checks pairing/client/project, manifest fingerprint, CLI/account and
exact migration provenance. Installation writes require the full named
`INSTALL <project-ref>` prompt. Declining performs no installation writes. Pairing,
runtime paths, mode, release and request identities stay bound to the journal.

```powershell
node scripts/setup-byo.mjs --journal "PRIVATE_FOLDER\journal.json" --status
node scripts/setup-byo.mjs --journal "PRIVATE_FOLDER\journal.json"
```

Status is local-only, value-free and makes no provider call. Resume retains the
original files and completed steps. Migration SQL/history commit atomically under
an advisory lock; exact replay observes original provenance rather than adopting
unrelated schema. Backend runtime success is separate from frontend deployment.

Failures emit `retrasell-byo-diagnostic-v1`: fixed phase/category, completed checks,
provider writes none/possible/confirmed, journal existence and safe next action.
Categories distinguish configuration, identity, release, mode, CLI availability/
authorization, history, provider, unknown writes, interruption, lock and journal.
No raw provider errors, tokens or private file values are printed.

Before journal creation, fix the identified input/tooling/path problem and retry
with the original pairing and exact target. When a journal exists, inspect status
and resume it. Do not replace a journal, rotate stable credentials or reset a Shop.
A leftover `.lock` may be removed manually only after confirming the earlier
process stopped; another running process's lock must remain intact.

Unknown function/secret writes are fenced before dispatch and never auto-replayed.
Review authoritative provider completion for the exact project/artifact/settings.
Only with confirmed completion, retain a non-secret public receipt identifier and:

```powershell
node scripts/setup-byo.mjs --journal "PRIVATE_FOLDER\journal.json" --confirm-provider-complete "STEP_FROM_STATUS" --provider-reference PUBLIC_RECEIPT_ID
```

The ID is 5–100 letters/numbers/hyphens, never a credential, URL or file content.
Named project/step confirmation records an operator attestation, not automatic
provider proof. If completion cannot be established, remain Needs intervention.
Elapsed time is not proof. Do not forge a receipt to unlock a step.

## Independent frontend and core acceptance

Build using the same public JSON, then verify the exact dist receipt/digest:

```powershell
node scripts/build-verified.mjs --config "PRIVATE_FOLDER\public-shop.json" --project-ref NEW_SHOP_REF
node scripts/build-verified.mjs --config "PRIVATE_FOLDER\public-shop.json" --project-ref NEW_SHOP_REF --verify-dist
```

After separately authorized independent Pages deployment, check SPA `_redirects`,
login/onboarding/optional invite routes, domain/TLS, Supabase Site URL/redirects and
Turnstile allowed hostname. Never deploy private files as browser assets.

Reserve the exact owner through Platform. Create one confirmed Auth account in
the customer's Shop Dashboard with that reserved normalized email. Passwords stay
in Shop Auth. Check existing identities before retrying an uncertain creation.
Use Check Owner Account, then real CAPTCHA/login and all six onboarding steps.
Manual owner creation and optional invitation delivery are separate choices.

Core BYO readiness does **not** require Support. After those actual checks:

```powershell
node scripts/setup-byo.mjs --journal "PRIVATE_FOLDER\journal.json" --record-acceptance --acceptance core
```

The coordinator checks owner/onboarding/exact binding read-only and asks for
`CORE ACCEPT <project-ref>`. The receipt is explicitly owner-reported. It leaves
the journal resumable for optional Support and never claims machine CAPTCHA proof.

## Optional Support and Paper

```powershell
node scripts/setup-byo.mjs --journal "PRIVATE_FOLDER\journal.json" --enroll
```

Original owner/onboarding/binding must be ready. Retain the stable public target
UUID, private customer Support settings and hash-only handoff. Give only the
public target and hash handoff to Platform Master; never private Support settings.
Master Prepare → verify → enable remains separately authorized. BYO ticket
enrollment does not grant managed-only Open Shop as Support permission.
After real Shop ticket → Platform resolution → Shop refresh acceptance:

```powershell
node scripts/setup-byo.mjs --journal "PRIVATE_FOLDER\journal.json" --record-acceptance --acceptance support
```

This requires the public ticket UUID and named acceptance. Completed is an
owner-reported Support receipt, not automated hosted acceptance. Paper acceptance
is separate: request, customer-visible decision/expectation, dispatch, delivery and
refresh; printing/thermal accounting remains independent of Paper enablement.

Historical Oct20–21 evidence remains preserved outside Git. Former Client4 success
was owner-reported; it does not prove installation in the new Client1 project.
No customer checkout/private file is modified by this development pass.
