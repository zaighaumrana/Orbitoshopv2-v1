# Support release, BYO installation and refresh recovery

This is a staged owner-operated release. No hosted installation or enrollment
was performed by Codex. Client 1 remains excluded. Read the Platform repository's
`docs/SUPPORT_AUTOMATION.md` for promotion, managed automation and uncertainty
fences. Existing `scripts/byo-setup.mjs` remains a base-runtime compatibility tool;
it does NOT apply migrations. Use the coherent wrapper below for the new release.

## Approved source

New inactive package: `shop-release-support-v2.json`, 34 migrations / 7 functions,
internal SHA-256:
`144d918859db1007cccfbed724d1988a043ca1e5fef42ce694dee6df1a603414`.
The accepted 32/6 package and previous Support-v1 33/7 candidate are unchanged.
The new forward migration is
`20261019000028_support_installation_readiness.sql`. Never edit the already
applied `20261018000617_customer_support_actor.sql`.

The source release builder writes v2 by default in Support mode and refuses the
historical v1 candidate path. Candidate files are LF-canonical for reproducible
customer checkouts. Gateway flags remain explicit: Support and ordinary Auth
functions verify JWT; the existing platform-bridge setting remains false.
The new login type annotation binds the SDK's public schema and changes no
runtime authentication behavior.

## Customer phase 1: install using your own Supabase account

1. Obtain the reviewed Shop checkout, exact public target/client metadata, owner
   approved release fingerprint, and the explicit Platform pairing download.
   Save pairing and TURNSTILE_SECRET runtime files outside both repositories.
   Never send a customer PAT, database password or service key to Platform.
2. Authenticate the customer's local native Supabase CLI. Version 2.120.0 was
   inspected locally for `db query --project-ref --file --output json`, function
   `--use-api` deployment and secrets `--env-file`. CLI project visibility must
   contain the exact customer project. A public anon key is not Management
   authority. Keep Platform and Shop projects different.
3. Validate first by omitting `--apply`, then run the reviewed command with
   `--apply` only after the owner authorizes hosted installation:

```text
node scripts/byo-support-release.mjs --phase install --mode fresh --project-ref SHOP_REF --release-sha 144d918859db1007cccfbed724d1988a043ca1e5fef42ce694dee6df1a603414 --pairing-file PRIVATE_PAIRING_ENV --runtime-file PRIVATE_RUNTIME_ENV --cli ABSOLUTE_SUPABASE_EXE --apply
```

Use `--mode existing` for an initialized, exactly paired Shop. Fresh mode checks
for a blank schema or an exact partial release prefix; it will not reset an
initialized Shop. Existing mode requires the complete approved base history and
matching client/binding. It applies only missing Support migrations and deploys
only Support, preserving owner, pairing secrets and six base functions.

Each migration and its original CLI-compatible history row commit atomically
under an advisory lock. A timeout resumes the exact prefix. Gaps, unknown versions,
untracked schema or different statement fingerprints stop for separate reviewed
adoption. Existing CLI/Git histories with split/reformatted statements may need
such review; never fake history to pass this check.

Fresh installation reuses the existing guarded base secrets/functions/preflight
workflow, then deploys Support. Retain files if any outcome is uncertain. After
base success, use Platform Provision Shop / Reserve owner, create/confirm the
reserved Auth user directly in Shop, check owner status, and let the owner log
in and finish onboarding. Delete the sensitive pairing download after successful
installation/reservation and verify removal. Do not reset an existing business.

## Customer phase 2: install dedicated Support and export hash only

Prepare a public JSON target with these exact fields (no credentials):

```json
{
  "platform_ref":"PLATFORM_REF",
  "project_ref":"SHOP_REF",
  "client_id":42,
  "source_id":"SHOP_SOURCE_UUID",
  "client_binding":"orbito-client-42",
  "request_id":"ONE_STABLE_ENROLLMENT_UUID",
  "pairing_mode":"byo",
  "scopes":["ticket:create","ticket:read"],
  "shop_public_api_key":"PUBLIC_SHOP_ANON_JWT"
}
```

The examples are placeholders. Obtain exact source/binding from the installed
Shop and reviewed Platform pairing. Keep the same request UUID throughout.

```text
node scripts/byo-support-release.mjs --phase enroll --project-ref SHOP_REF --release-sha 144d918859db1007cccfbed724d1988a043ca1e5fef42ce694dee6df1a603414 --config PUBLIC_TARGET_JSON --support-file PRIVATE_SUPPORT_ENV --enrollment-file HASH_HANDOFF_JSON --cli ABSOLUTE_SUPABASE_EXE --apply
```

Without `--apply`, this only validates prerequisites. Enrollment requires a live
confirmed active owner, completed onboarding and exact pairing. It creates a
dedicated secret only if the private file does not already exist, installs that
same file using customer CLI authority, and exports a hash-only handoff. Private
paths are checked against both repositories and physical symlink targets.

Transfer ONLY the hash file and public target metadata to the Platform Master.
They use Client Detail → Customer Support → Prepare & verify Support with their
normal signed-in session. No JWT copying or customer Management access is needed
on Platform. The key remains disabled until a fresh exact installation proof
passes. If installation or verification is uncertain, reuse the same UUID/files;
do not generate another secret. Customer-side CLI writes cannot be ordered by
Platform: obtain provider completion before any manual rotation. Retain the
private Support file securely for recovery; never commit, email or upload it to
Platform. Privileged Support login is separate and remains managed-only.

## Refresh, roles and local state

The real entry point verifies live Auth/profile, configuration, suspension,
onboarding, legal acceptance and clock-in before resolving the current URL.
Valid authorized paths and queries survive refresh. Root/login/invalid or denied
paths use the role landing page. Query-only navigation participates in browser
Back/Forward, and asynchronous imports/loads are fenced against newer navigation
and authorization changes. Help & Support remains Owner/Manager only.

The login email/password container is a semantic form. Enter and click share one
submit path, with an independent in-flight guard and Turnstile verified/expired/
error handling. Auxiliary actions remain buttons. The Shop visual design and
PWA behavior are unchanged.

Safe history state includes validated settings/catalog tabs, receipt type/date
filters and bounded scroll for the same verified user/role/URL. Free-text search,
record IDs, modal state, carts, checkout/payment/credit drafts and transactional
actions are excluded. A refresh never replays a transaction.

Unsent Support drafts remain memory-only. An attempted uncertain request can
survive refresh in this tab's sessionStorage for at most six hours: original UUID,
canonical subject/category/message, scope and expiry only. No bearer token or
server credential is stored. Recovery requires live Auth plus canonical
`support_ticket_actor_context` proving the same user/session/role/employee and
client/source/binding/project scope. Logout, account/role/binding changes,
authorization denial, definitive validation failure, successful receipt or
expiry clear recovery. A verification outage cannot hydrate private content;
where identity cannot be established at boot, privacy takes precedence over
recovery. Server idempotency remains authoritative; storage is never authorization.

## Builds and acceptance

Use `scripts/build-verified.mjs --config PUBLIC_JSON --project-ref SHOP_REF`, then
repeat with `--verify-dist` before an owner-operated upload. Inputs are only
VITE_SUPABASE_URL, VITE_SUPABASE_ANON, VITE_TURNSTILE_SITE_KEY. The clean build
does not load `.env` or inherited Vite values. Its public manifest binds target,
configuration and asset digests. Wrangler uploads compiled `dist`; dashboard
variables do not rewrite an old bundle. This round built synthetic fixtures and
performed no upload.

The frozen accepted-release byte gate remains an intentional baseline failure;
do not normalize the accepted file to make it pass. Legacy anonymous closure
remains staged. Local SQL/Auth, real-router/browser, Deno and provider bundle
checks do not replace owner-run hosted gateway/CAPTCHA/DNS/managed/BYO acceptance.
Test fresh managed automatic enrollment first, then a genuinely different-account
BYO installation and complete Shop → Platform → Shop ticket/resolution cycle.
