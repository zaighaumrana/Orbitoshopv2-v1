# RetraSell Platform Overhaul V1 — Shop contract

This checkpoint is on `feature/platform-overhaul-v1`, based on `developmentv2` including Onboarding V2 and legal finalization. No hosted changes were made.

The new forward migration `20261003121000_config_request_journal.sql` journals the UUID and boolean changes already supplied by Platform to `config-write`. One transaction applies the write and records its response. Exact replay returns that response without reapplying an old write after a newer request. A changed payload for an existing ID is rejected. Legacy callers without a request ID retain their existing behavior; Platform always sends one. The journal and bridge RPC remain service-only. BILL, INVENTORY, THERMAL, payment/repair ledgers, support identity and suspension rules are unchanged.

Runtime probes now return individual known configuration/function booleans. They never return secret values. The existing runtime contract and its readiness predicates remain unchanged. Turnstile configuration does not prove key/site pairing, hostname acceptance or browser CAPTCHA success.

Owner reservation, manual-first Auth/password activation and `employee_id = null` remain unchanged. Onboarding remains before legal evaluation. The legal package remains unpublished with Terms/Privacy/DPA 1.0 and required revision `2026-10-03.1`.

The Shop browser still requires only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON` and `VITE_TURNSTILE_SITE_KEY`. Server credentials must never be placed in Vite values.

## Approved server release

From this Shop checkout, run `node scripts/build-platform-release.mjs`. The optional output argument is the absolute path of Platform's `supabase/functions/_shared/shop-release.json`. The default assumes the two sibling repositories named in the task. Review the generated source-only artifact with the code checkpoint. It contains the complete approved SQL chain and ZIP archives of the six Edge Functions and their shared TypeScript dependencies, including gateway verification settings. It reads no environment files and performs no hosted operations. Its deterministic SHA-256 hashes identify migrations/functions across stage retries. Rebuild after any Shop migration/function change; do not change the artifact during an unresolved managed operation.

Managed provisioning only targets an existing, explicitly selected separate Shop project. It rejects Platform, retired infrastructure, unapproved migration history, an existing schema without migration history, initialized legacy Shops and differently bound V2 Shops before replacing secrets/functions. It retains original CLI-compatible migration versions atomically. Existing business projects needing adoption must use a separately reviewed manual migration/binding workflow; never reset them. Project creation and Cloudflare automation remain deferred. BYO customers continue to install pairing/runtime files locally using the existing setup tool. No customer PAT, database password or service key is submitted to Platform.

See Platform `PLATFORM_OVERHAUL_V1.md` for stages, recovery, exact test counts and hosted smoke tests. Local tests execute SQL inside an existing PGlite 0.3.14 runtime at `node_modules/.legal-test-runtime`; the Platform SQL test uses this sibling runtime. Crypto/Vault substitutes test transactions, ACLs and state transitions, not hosted encryption. A clean test checkout must provision that test-only runtime explicitly (with scripts disabled) before running these local database checks. It is outside both release bundles and ignored by Git.
