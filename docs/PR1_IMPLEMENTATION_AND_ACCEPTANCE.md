# RetraSell Shop PR #1: implementation and acceptance

## A. Executive summary and scope

This is the authoritative reconciliation for [Shop PR #1](https://github.com/zaighaumrana/Orbitoshopv2-v1/pull/1), as of 2026-10-25 (Asia/Karachi). It consolidates this Shop PR's implementation, observed rollout and acceptance provenance; it adds no application or backend changes.

Implementation snapshot: `feature/verified-customer-support-shop` at `94b438a032790719f8f38f7613513b4702bd143b`, based on `development` (`f91f02819a9f2909062e36140f1775a870009115`). GitHub is OPEN, DRAFT and UNMERGED. Documentation commits follow this snapshot and are not new deployed frontend revisions.

The PR began with authenticated Owner/Manager Help & Support. It grew through standalone/guided BYO setup, stable retry/routes, Paper communication, owner consent, durable delivery, release requirements/diagnostics and customer-owned controlled upgrades; final changes permanently fix clearance public-key compatibility and Support-only punctuation/layout.

Shop owns its Auth/roles, business data, durable sender/receipts, consent enforcement, customer CLI and packaged backend. Platform owns registered client/source/pairing, central tickets/credentials, live Master authority, orchestration, plan approval/clearance and release policy. The [Platform PR5 summary](https://github.com/zaighaumrana/orbito/blob/feature/verified-customer-support-platform/docs/PR5_IMPLEMENTATION_AND_ACCEPTANCE.md) and [register](https://github.com/zaighaumrana/orbito/blob/feature/verified-customer-support-platform/docs/PR5_ACCEPTANCE_CASES.csv) are authoritative for that side.

The [PR1 register](PR1_ACCEPTANCE_CASES.csv) preserves the original 17 Shop scenarios and distinct evidenced security/recovery/install/presentation/deployment cases. OWNER_PASS is owner-only, LOCAL_PASS is scoped automation, READ_PASS is an observation, PARTIAL is not a complete oracle, and DEFERRED/UNTESTED are never silently passed. Original 0/17 and current row totals are not a progress percentage. The two owner aggregate rows represent 7 reported categories per Shop (14 checks), not 14 invented granular case IDs.

### Register counts and interpretation

| Latest recorded classification | Distinct cases |
| --- | --- |
| DEFERRED | 5 |
| LOCAL_PASS | 30 |
| OWNER_PASS | 2 |
| PARTIAL | 2 |
| READ_PASS | 2 |
| UNTESTED | 1 |
| TOTAL | 42 |

These primary classifications sum to distinct stable case IDs, not to independent test runs. Hosted status is a separate dimension; a LOCAL_PASS never automatically closes its pending/deferred hosted oracle.

| Historical classification retained | Cases |
| --- | --- |
| HISTORICAL_FINDING_OR_GATE | 18 |
| HISTORICAL_FRESH_TARGETS_PENDING | 1 |
| HISTORICAL_FUTURE_MILESTONE | 1 |
| HISTORICAL_HOSTED_DEPLOYMENTS_PENDING | 2 |
| HISTORICAL_HOSTED_PENDING | 2 |
| HISTORICAL_LOCAL_CHECKS_HOSTED_PENDING | 3 |
| HISTORICAL_SOURCE_LIMITATION | 1 |
| PENDING_AT_ORIGINAL_0_OF_17_TRACKER | 14 |

| Orthogonal hosted status (not added to total) | Cases |
| --- | --- |
| FULL_ATTESTATION_UNAVAILABLE | 1 |
| OWNER_AGGREGATE_PASS | 2 |
| OWNER_DEFERRED | 5 |
| PENDING_OWNER_FINAL_VISUAL_REVIEW | 2 |
| PER_CASE_HOSTED_NOT_RECORDED | 30 |
| READ_OBSERVED_PRODUCTION | 2 |

## B. Chronological implementation history

The order follows Git ancestry from this PR's verified development base. Grouped deployment-only commits remain explicit; author-date anomalies do not rewrite the implementation order. All 19 original source commits are represented once. No tests in this chronology were run again for documentation.

| Order | Date (Asia/Karachi/source date) | Source commit(s) | Capability/correction | Primary files/migrations | Documents | Recorded tests/evidence | Current outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-18 | [`7e22ba1`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/7e22ba199f11dcbef87b9b1710a67699ab5b2e0c) | Owner/Manager Support UI/client/proxy and live actor; optional seventh function and customer-local enrollment. | 20261018000617_customer_support_actor.sql;support-tickets;src/platform/support.js | [CUSTOMER_SUPPORT_CONTRACT.md](CUSTOMER_SUPPORT_CONTRACT.md); [CUSTOMER_SUPPORT_VALIDATION.md](CUSTOMER_SUPPORT_VALIDATION.md) | Initial99/100; 7 new groups; historical frozen artifact and fixture limitations explicit. | Current sender/UI contract; initial frozen gate retained historically. |
| 2 | 2026-10-18 | [`3a1589d`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/3a1589d632f94e768277fd25f795125abcf96a55) | Standalone checkout portability preserves private/symlink exclusions without Platform sibling. | scripts/support-setup.mjs | [CUSTOMER_SUPPORT_VALIDATION.md](CUSTOMER_SUPPORT_VALIDATION.md) | 100/101; 8 new Support groups; historical frozen byte gate remains. | Standalone portability fixed; no Platform sibling required. |
| 3 | 2026-10-19 | [`a2ca847`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/a2ca8472ae304ab66c5495a9803873580e3bf900) | Long JWT compatibility and final generation check after async error parsing. | support-tickets protocol;src/platform/support.js | [CUSTOMER_SUPPORT_CONTRACT.md](CUSTOMER_SUPPORT_CONTRACT.md) | 101/102; native/handler groups pass; accepted artifact drift is newline-only, not rewritten. | Auth/stale retry corrections integrated. |
| 4 | 2026-10-19 | [`5becfae`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/5becfae73ff6ba9a94cfd143aa731ab4db11ea6f) | Semantic login, authorized Support route/history, attempted-request tab recovery, readiness and full/additive setup. | 20261019000028_support_installation_readiness.sql;main/router;byo-support-release | [SUPPORT_AUTOMATION.md](SUPPORT_AUTOMATION.md) | 105/106 then-frozen gate; real entry/Support browsers and Deno/provider bundle checks. v2 inactive 34/7. | Durable database journal now supersedes tab recovery as authority. |
| 5 | 2026-10-20 | [`9ebb712`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/9ebb712d62f547a490b938cb7496be55e7910edb) | Guided customer-local coordinator, exact source/owner diagnostics and durable Paper communication. | 20261020135016_fresh_initialization_guard.sql; 20261020135251_paper_customer_communication.sql | [BYO_GUIDED_SETUP.md](BYO_GUIDED_SETUP.md) | 110/111 then-frozen gate; 6 guided/new native+13 existing groups. v3 candidate 36/7 inactive. | Guided/source guards retained; original Client3 cause unproven. |
| 6 | 2026-10-21 | [`3ddf5d5`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/3ddf5d5f9b3e00ec53bfa952e3e84ff7469e2d7b) | Public/runtime Turnstile separation, CLI discovery and recoverable Paper status. | byo-public-config;paper history/client | [BYO_GUIDED_SETUP.md](BYO_GUIDED_SETUP.md); [BYO_SETUP.md](BYO_SETUP.md) | 116/117 then corrected frozen-identity 5-case subset; local Paper/offline/account checks, no hosted CAPTCHA proof. | Static/public/private and Paper recovery corrected; real challenge remains deferred. |
| 7 | 2026-10-21 | [`dba4e09`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/dba4e09216a0076139af17e8e137b51b6d9a7791) | Client1 identity fix; redacted recoverable installer diagnostics; guarded current handoff and compatible dependency patches. | byo-identity;setup-byo;support-setup | [BYO_GUIDED_SETUP.md](BYO_GUIDED_SETUP.md) | Final committed 122/122 and audit 0; 8 native+13 Support groups/browser/build. Original protected project stays excluded. | Identity/recovery fixed; current snapshot is later than this broad-suite checkpoint. |
| 8 | 2026-10-22 | [`089fd78`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/089fd7870f9f0665e35674bf7b8db9fd190f1509) | Owner consent, single-session/expiry/revoke enforcement; no widget fallback; additive existing-Shop upgrade safety. | 20261022155952_support_session_consent.sql;login/account-admin/verify-pin/support-tickets | [Existing-shop-upgrade.md](Existing-shop-upgrade.md) | 4 focused/native existing-v2 preservation/typechecks/build; backend source completed before packaging. | Consent/upgrade baseline preserved; trusted enforcement remains required. |
| 9 | 2026-10-22 | [`60659ed`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/60659ed60e493c8a12a96c87bbfb10412419db7a) | Immutable v4 metadata from 089fd78; selectors/manifests preserve prior packages/pins. | scripts/byo-release-manifest.json;backend release catalog | [CONTROLLED_BACKEND_UPGRADES.md](CONTROLLED_BACKEND_UPGRADES.md) | 37/7 historical v4 fingerprint; source/package parity, no installation inferred. | Historical supported v4; original package/pins never rewritten. |
| 10 | 2026-10-23 | [`1c80b1c`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/1c80b1ce99380a6c74e806d35da37f593e98033d); [`c7b192a`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/c7b192a62a12e8ebcd4e57efab64bc36e6bd25e8); [`a5917bc`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/a5917bcc814ea81b1dc4338cf4c6ba8195bc28a4); [`7b6c600`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/7b6c60098438465a3be9e08d40e81b1f3b758ad5) | Deployment/rebuild checkpoints with updated authorized BYO public build configuration. | Git-connected frontend builds | [CUSTOMER_SUPPORT_DEPLOYMENT.md](CUSTOMER_SUPPORT_DEPLOYMENT.md) | Historical production canonical at 7b6c600; these commits do not prove backend upgrade or every acceptance case. | Dated frontend deployment history only; later commits supersede its canonical state. |
| 11 | 2026-10-23 | [`f9df8eb`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/f9df8eb0ac4055378a77fdfc11503cc9007882ca) | Eight-group requirements, read-only diagnostics and private durable Support journal/leases/ACK/review. | 20261023012311_durable_support_and_backend_capabilities.sql;platform-bridge;support-tickets | [BACKEND_DIAGNOSTICS_AND_DELIVERY.md](BACKEND_DIAGNOSTICS_AND_DELIVERY.md) | Native queue/actor/continuity and9 contract cases; initial v5 candidate then superseded. | Durable Support and restricted evidence integrated; no offline-first claim. |
| 12 | 2026-10-23 | [`95448d7`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/95448d75b7c78fbe5e7cf0e9a02f87e7d919650d) | Legacy receipt correction: uncertain old clients get retryable503; pending202 requires explicit existing-header opt-in. | supabase/functions/support-tickets/index.ts | [BACKEND_DIAGNOSTICS_AND_DELIVERY.md](BACKEND_DIAGNOSTICS_AND_DELIVERY.md) | Legacy/modern compatibility fixture passes; requires NEW immutable release rather than rewriting v5. | Fixed in final committed backend before v6; v5 remains unchanged. |
| 13 | 2026-10-23 | [`fb99cbb`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/fb99cbb2e555956c16911ea835ecd5475ceacb64) | Final immutable v6 metadata only after completed backend95448d7. | byo-release manifest/catalog/requirements | [CONTROLLED_BACKEND_UPGRADES.md](CONTROLLED_BACKEND_UPGRADES.md) | 38 migrations/7 functions/8 requirement groups, canonical SHA64fcec36...; exact committed-source parity/CI pass. | Current fresh v6 selected by both paths; exact source parity recorded. |
| 14 | 2026-10-23 | [`c2039e3`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/c2039e369320053013a556b5c6144f07361bd52b) | Customer-owned controlled upgrade with expiring exact Platform clearance, serial checkpoints and original journal. | scripts/upgrade-backend.mjs;upgrade-contract/engine | [CONTROLLED_BACKEND_UPGRADES.md](CONTROLLED_BACKEND_UPGRADES.md) | 5 shared focused+3 continuity cases/native v4->v6 path; legacy Managed terminal execution denied. | Customer dual-authorization workflow current; completed job must not be replayed. |
| 15 | 2026-10-25 | [`5eb65f8`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/5eb65f862307677ec022de2a00db91506d28ce3f) | Permanent project-verified publishable/legacy key clearance; complete claimed plan/identity checks. | scripts/upgrade-backend.mjs;tests/upgrade-clearance.test.mjs | [CONTROLLED_BACKEND_UPGRADES.md](CONTROLLED_BACKEND_UPGRADES.md) | 5 focused groups+1 Platform case; no new backend package/clearance/customer operation. Both production builds succeed. | Permanent CLI format/binding fix locally verified; no new real clearance issued. |
| 16 | 2026-10-25 | [`94b438a`](https://github.com/zaighaumrana/Orbitoshopv2-v1/commit/94b438a032790719f8f38f7613513b4702bd143b) | Final Support-only Unicode, compact history/forms/notices/disclosure/owner-history presentation. | src/admin/pages/support.js;src/style.css;customer-support-browser | [CUSTOMER_SUPPORT_VALIDATION.md](CUSTOMER_SUPPORT_VALIDATION.md) | 2 targeted cases, actual synthetic browser four widths/both themes/six states/CSS isolation, 118-module build and both production deployments pass. | Final Support-only correction deployed; owner visual review still pending. |

## C. Technical implementation inventory

| Shop surface | Implementation / responsibility |
| --- | --- |
| Frontend and routing | `src/main.js`, `src/admin/admin.js`, `src/admin/pages/support.js`: authorized Owner/Manager navigation, semantic login/route restoration after real gates, escaped history/detail/resolution, exact 50-row pagination and stale-response ownership. Current Support CSS is scoped under `.support-page`; wider modernization is not included. |
| Support client/recovery | `src/platform/support.js`, `src/platform/support-recovery.js`: stable attempted UUID/payload, current actor/session/source proof, uncertain and pending versus received distinction. Unsent drafts remain memory-only; earlier six-hour verified tab recovery is supplementary to the later database journal. |
| Trusted sender | `support-tickets` verifies real Auth plus live `support_ticket_actor_context`, never trusts JWT metadata to assign roles, and forwards only transient user access JWT plus independent Support credential to the exact configured central HTTPS endpoint. Redirects/body/response/time are bounded. No customer PAT/password/service key is forwarded. |
| Durable Support | Private `support_submissions`/events persist sealed actor/source/binding/fields before network. Original user reauthorizes retry in a new session; server-only ACK, 90s lease, bounded backoff/eight-attempt review and stale-lease fencing preserve uncertainty. No background sender impersonates a revoked user and no global/offline exactly-once guarantee is claimed. |
| Owner consent | Owner-only verified case/purpose approval, 30-minute one-session binding, append-only history/revoke. Data API hook plus restrictive RLS and privileged Edge checks reject expired/revoked/unbound Support. Ticket submission is separate from this authority. Managed Master handoff depends on Platform consent verification; BYO Open Shop as Support stays prohibited. |
| BYO installation | `scripts/setup-byo.mjs`, `byo-setup.mjs`, `byo-support-release.mjs`, `support-setup.mjs`: exact account/project/client/source/mode, native CLI capabilities, private files/journal/lock and explicit customer confirmation. Auth/manual owner/six steps and optional Support acceptance remain separate observations. |
| Diagnostics | `scripts/inspect-backend.mjs`, restricted paired Bridge operation and owner-only capability RPC return fixed nonsecret metadata. No SQL definitions, Auth users, records or administrative credentials reach Platform/browser; old supported Shops lacking the probe stay operational. |
| Controlled upgrades | `scripts/upgrade-backend.mjs`, `upgrade-contract.mjs`, `upgrade-engine.mjs`: immutable approved source/target, exact Platform clearance/plan/binding, explicit customer approval, live pending-operation claim, ordered bounded steps and original private recovery. Terminal Managed mode refuses in favor of live Master workflow. |
| Existing continuity | Usage/BILL/INVENTORY/THERMAL/Paper retain immutable outbox UUID/source sequences and exact ACK; config journals retain original payload/generation; increasing source-bound billing revisions and existing financial/repair/inventory rules are preserved. The Platform receipt recovery belongs in its register. |

Important Shop forward migrations added through this PR:

- `20261018000617_customer_support_actor.sql`: canonical live customer Support actor.
- `20261019000028_support_installation_readiness.sql`: confirmed active owner/onboarding readiness.
- `20261020135016_fresh_initialization_guard.sql`: conservative existing owner/reservation precondition.
- `20261020135251_paper_customer_communication.sql`: customer Paper status/message projection.
- `20261022155952_support_session_consent.sql`: separate owner consent, session binding, trusted expiry/revoke.
- `20261023012311_durable_support_and_backend_capabilities.sql`: private durable submissions and restricted evidence.

Browser public configuration is exact Shop `VITE_SUPABASE_URL`, public `VITE_SUPABASE_ANON` and `VITE_TURNSTILE_SITE_KEY`; the current public build validator requires an unexpired matching **legacy anon JWT**. `TURNSTILE_SECRET`, bridge credentials and built-in service runtime authority stay server/private. Static key/hostname checks are not real Turnstile acceptance.
Separately, the customer upgrade clearance's `platform_public_key` supports **modern publishable or legacy anon keys** after exact-project read-only Auth gateway verification. That CLI correction does not convert all browser/install public-key validators to opaque keys. No customer edits/substitutes keys in clearance JSON; no privileged key becomes valid because of its prefix.

## D. Backend release and deployment order

Current approved fresh source is immutable **support-v6**, canonical SHA-256 `64fcec36fa7a5e2565db2a6d3aa6ddbd8e6c1170eefd4a07a57ae6ba0c066a31`: **38 migrations, 7 functions, 8 requirement groups**. `scripts/backend-requirements.json` and both executable installer plans carry the capability/dependency contract; numerical equality alone is not parity.
The eight groups cover core runtime, usage outbox, billing projection, config journal, Support identity, owner consent, owner bootstrap and durable Support submission. Shop's manifest/catalog must match Platform's exact artifact/registry/catalog/active pointer. Use the [Platform release/control-plane record](https://github.com/zaighaumrana/orbito/blob/feature/verified-customer-support-platform/docs/PR5_IMPLEMENTATION_AND_ACCEPTANCE.md#d-backend-release-and-deployment-order) for its SQL/functions/pin responsibilities.

| Packaged Shop function | verify_jwt |
| --- | --- |
| account-admin |true|
| login |true|
| password-reset-request |true|
| public-track |true|
| verify-pin |true|
| platform-bridge |false; its own exact paired credential/operation gate remains|
| support-tickets |true; real user Auth and live actor checks remain|

Chronology: baseline accepted-v1 remains frozen 32/6; Support-v1 staged 33/7; v2 at 34/7 added readiness; v3 at36/7 added fresh guard/Paper; v4 at 37/7 added consent after committed backend `089fd7870f9f0665e35674bf7b8db9fd190f1509`, fingerprint `f5295937f06e45177190bedebf19a54c86fd067d03785365a393e3de269e062f`. Durable submission introduced an uninstalled v5 candidate. The final legacy-receipt correction was committed as `95448d75b7c78fbe5e7cf0e9a02f87e7d919650d` before NEW v6 packaging/metadata `fb99cbb2e555956c16911ea835ecd5475ceacb64`. V5 stays immutable/superseded/never installed at `7953927660473aeaafcc62b3b8d45e382f5189d1536f7e0100b890d938ff5fdd`; old packages/pins never move.
Fresh BYO uses the approved customer-local complete SQL/functions/dependencies/gateways; Managed installs the same package's SQL/six core functions plus its optional seventh Support package after owner readiness. A base POS success with optional Support pending is not complete Support acceptance. Customer privileged authority/passwords remain local; manual owner activation/six steps are not bypassed.
Existing v4 Shops use only the reviewed additive v4→v6 plan: missing `20261023012311` migration, then changed `platform-bridge` and `support-tickets`, then matching UI. Never repeat baseline/onboarding, rotate credentials, recreate owner or silently repin. The original provisioning pin records history; it is not the current installed-release attestation.
Platform schema/upgrade function must support the exact job before CLI use. The Master reviews compatibility/source limitations and exact plan; customer separately confirms and claims the two-hour request/plan-scoped clearance. Current CLI first validates the public key at the exact explicitly supplied Platform URL, then validates the authoritative original claim. Expired/revoked/refused or uncertain outcomes retain the same journal and stop writes; no new UUID clears uncertainty.
Both original hosted upgrades are recorded `completed_reviewed` with3/3 checkpoints: Managed `2428e25d-ab5e-4589-aa36-fb0ca3f9c5b5` at `yqiefgcdvnfmdhuhitdq`, BYO `623e0750-ea80-4281-bbd8-40c8ece23db4` at `ampwuqwokkbhkizcetsd`. Prior read-only before/after projection is in clearance-compatibility evidence. Both retain `full_source_verified=false`; Managed checkpoints are provider-acknowledged and BYO customer-reported. Reviewed component evidence does not become independent deployed-source proof.
Do not rerun these jobs or regenerate their clearances. A subsequent change affecting packaged backend needs another immutable release/fingerprint after completed source; the later CLI, Support UI and current documentation changes do not affect the v6 package. No backend deployment is needed or performed in this documentation pass.

## E. Benchmarks, tests and evidence

All results below are recorded executions; no application tests/builds/SQL/native/browser runs are repeated by this documentation checkpoint. Counts overlap across campaigns and are not a new distinct test total.

| Checkpoint | Actual result | Scope / qualification |
| --- | --- | --- |
| Initial Support |99/100→100/101, 7→8 new groups|Standalone copied-script regression fixed the missing sibling assumption; accepted artifact raw-byte gate remained. |
| Stabilized Auth/recovery |101/102 then105/106|Configured long JWT, stale async/session, route/tab recovery; frozen artifact newline drift not rewritten. |
| Guided/identity pair |110/111, then116/117 plus corrected subset, finally122/122 at dba4e09|Immutable artifact-integrity/source-candidate assertions replaced invalid comparison of old frozen bytes to newer source; exact original failures retained. |
| Oct21 final committed evidence |122/122 Shop, paired326/326 Platform, 8 native+13 Support groups and named browser/build/digest checks|Historical checkpoint, not a fresh full suite on later source. Audit 0 at that dependency snapshot is not a perpetual security guarantee. |
| Consent/final v4 |4 focused cases; native old-v2 preservation/consent/revoke/source/catalog; Deno and build|Synthetic SQL Auth/Vault and local handlers are not hosted provider/real CAPTCHA proof. |
| Durable v6/continuity |9 shared contract cases/7 negative divergence fixtures, 4 engine cases; native queue/actor/lease/ACK/usage/financial/inventory checks|Shared canonical gate validates actual final source and both installer consumers; v5 remains superseded. |
| Customer controlled upgrade |5 shared focused+3 affected cases, native authorization/concurrency and one idempotent v4→v6 SQL path|Actual CLI fixture uses two serial invocations under the same UUID; all provider transport is synthetic. |
| Clearance compatibility |5 Shop groups plus1 existing Platform CLI case|Both public formats, wrong/privileged/malformed/project keys, binding/plan/request tamper and expired/revoked/refused responses; no real upgrade repeated. |
| Final Support UI |2 renderer/role cases; actual local browser four widths/both themes/six message states, 50-row pagination, keyboard/detail/retry and CSS isolation|No page errors/external requests; existing unrelated Checkout/Inventory/Workshop component computed styles match before/after the Support-only block. |

Actual build artifacts: controlled-upgrade checkpoint 118 modules/admin 109.11 kB/gzip28.56; final Support UI 118 modules/global CSS 24.87 kB/gzip5.54 and admin 110.62 kB/gzip28.87. These are bundle sizes, not measured user speed or hosted throughput. Wider Shop performance profiling is deferred.
Recorded parity CI: Shop39889772457 (final v6), 39976210765 (controlled), 40123997759 (clearance), 40132656462 (Support UI) all succeeded. The sister summary records Platform results. New documentation-only check/skip metadata is external, not another application validation campaign.
Evidence prefix `E:` means `C:\Users\ranaz\Desktop\Development\Support ticket\implementation-evidence`. Key reports: `coordinated-wizards-2026-10-21/04_FINAL_TEST_RESULTS.md`, `release-parity-fleet-continuity-2026-10-23/REPORT.md`/`CHECKPOINT.md`, `controlled-upgrades-stabilization-2026-10-23/REPORT.md`/`CURRENT.md`, `clearance-compatibility-2026-10-25/REPORT.md`/`TESTS.md`/preservation JSON, and `shop-support-ui-2026-10-25/REPORT.md`/logs/`final/` screenshots. These are local-only artifacts, not GitHub-hosted source. Availability is checked; missing exact raw per-case timestamps/builds remain gaps.

### Evidence availability and gaps

All named external report/metadata references existed locally at validation. This does not guarantee a granular raw log/timestamp for every scenario; history-only records are labelled explicitly.

Additional recorded gaps: exact per-case hosted timestamps/builds and the seven owner category names/mapping are unavailable; old runner interruptions/raw reports are not replaced with fabricated passes. Exact original Master-confirmation incident and provider bundler-warning receipts are not fully reconstructed. Data/API observation and local/current-source facts remain separate.

## F. Hosted deployment and acceptance

The named hosted Shops are the authorized Managed/BYO test environments from this conversation. Cloudflare's production deployment label describes their existing frontend pipeline; it is not a universal customer-release approval.

The two intended Shop Pages projects use `feature/verified-customer-support-shop` as **production branch** with `npm run build` → `dist`. No production branch/settings change is made here.

| Historical/final checkpoint | retrasellshop | retrabyo | Provenance |
| --- | --- | --- | --- |
| Earlier normal production source 7b6c600 |e13c1f89-824b-44ed-9d8d-0f312b9bbb17|518f0905-da3c-4138-aeed-d99f5a699a8f|Prior read-only Pages baseline; source rebuild is not backend acceptance. |
| Clearance commit 5eb65f862307677ec022de2a00db91506d28ce3f |a324abbb-712b-4449-8311-3c333e2b46f7|3dc629b2-1b5c-43ea-837d-e5f239b17da3|Both production success; public live/deployment asset references matched. CLI-only change itself did not change frontend source. |
| Final Support UI 94b438a032790719f8f38f7613513b4702bd143b |607f376a-2016-463d-bdbb-d447bc206afa|eeaa682e-d3d5-4192-918a-15450763c2d2|Both production success; canonical exact commit, live HTTP 200/matching assets and new Support CSS verified. |

Current links: [Managed Shop](https://retrasellshop.ahwad.com/), [BYO Shop](https://retrabyo.ahwad.com/), [Managed deployment](https://607f376a.retrasellshop.pages.dev), [BYO deployment](https://eeaa682e.retrabyo.pages.dev). Both serve `/assets/style-BMA2EDCk.css` with the new scoped rows/clamping. Existing legacy Pages project also produced automatic previews under its unchanged rules; none was manually promoted.
Owner-reported acceptance: **7/7 functional categories per Shop, 14/14 total**. This is an owner report from the final consolidation instruction, not an independently executed Codex hosted campaign. The exact seven category names, individual timestamps/build identifiers and mapping to all 17 original scenarios are not provided; the two OWNER_PASS aggregate cases preserve that limitation. The owner also reports Help & Support functional acceptance already passed in both Shops.
The final Help & Support punctuation/layout correction is locally browser-verified and deployed, with **owner final visual review still pending**. Additional staff/password/real Turnstile, Paper/thermal/billing hosted checks and final privileged-browser exposure inspection remain explicitly deferred, not included by inference in 14/14.
Earlier initial source-only delivery/skip and later production histories remain in dated evidence; source commits alone are not a deployment oracle. This documentation-only commit uses `[CF-Pages-Skip]` for **both** Shop production-connected projects, and Platform's documentation commit also skips. Exact new skip records and unchanged production IDs are verified after push in the external documentation report.

## G. Security, compatibility and limitations

- Central Support credential, bridge call/source credentials, user JWT and one-time privileged handoff grant are independent authorities. Roles come from canonical live data, not user metadata or UI flags. Managers read only own tickets; Cashier/Technician/Orbito Support cannot impersonate a customer requester. Platform never receives a customer password, service key, PAT or database password.
- Cross-project actor verification is not a globally atomic transaction; retain the Platform's 15-second freshly verified snapshot/clock allowance limitation. Trusted runtime/issuer compromise is not solved by a stolen-Support-key-only defense.
- Durable persistence and a verified Platform receipt are different facts. A queue row can be pending or review; ACK loss preserves its original UUID. Legacy pages receive503 rather than falsely clearing that UUID on pending202. No saved JWT/service worker sends as an expired user; deleted/revoked actors need explicit review.
- Owner consent remains separate from tickets and Master clearance. Trusted expiry/revoke blocks later server operations; already displayed/cache data is not erased and GoTrue logout/Realtime disconnection is not falsely claimed. Existing custom Data API hooks require reviewed composition and privileged Edge checks remain necessary.
- BYO infrastructure409 is a Platform guard correction, documented in the [Platform eligibility runbook](https://github.com/zaighaumrana/orbito/blob/feature/verified-customer-support-platform/docs/BYO_CONTROLLED_UPGRADE_409.md). It allows Active BYO unknown/present without allowing unresolved operation outcomes or changing client status. Exact Master confirmation/plan/maintenance gates also belong to Platform; no client-side format workaround bypasses them.
- The historical publishable-key clearance failure was temporarily worked around by the owner using a legacy public anon key. The permanent 5eb65f8 correction verifies both formats at the exact Platform gateway before sending clearance authority and checks the complete live claim/plan. Customers must use the corrected CLI, not manually alter JSON. Tests use synthetic responses; no new real clearance/upgrade was generated to prove the fix.
- Initial frozen-package raw-byte failures, Client3's unconfirmed original trigger, old manual setup instructions and reported provider bundler warning provenance remain dated history. The old numeric Client1 exclusion was corrected by exact project identity; the protected historical installation is not a new first client.
- Independent full installed-source attestation remains unavailable. A provisioning pin, verified ledger, current function presence/revision, provider digest and reviewed component completion are distinct. Both upgrades retain full_source_verified=false; BYO evidence remains customer-reported. No v6 fresh-install acceptance is inferred from those upgrades.
- Explicit owner-deferred additional staff/password recovery/real Turnstile, Paper/thermal/billing and final privileged-credential browser check remain DEFERRED. Independent fresh Managed/BYO v6 destinations were previously kept pending. Historical Client4/Core/Paper or inherited Phase2/3/4 local results do not silently close these current hosted obligations.
- Wider Shop UI/UX stabilization, performance and dual-branding modernization remain a **separate future milestone**. This PR's final Support-only consistency correction is not that redesign. Financial, metering, POS/repair and publication/legal baseline rules are preserved, not re-audited wholesale.

## H. Documentation directory

**23 existing local source documents indexed**, plus the two new authoritative artifacts in this repository. The sister set has its own inventory; shared dependencies are linked below rather than duplicating its documentation set.

| Existing source document | Purpose/conclusions used | Phase | Authority/status at this checkpoint | Incorporated sections |
| --- | --- | --- | --- | --- |
| [../ENGINEERING_HISTORY.md](../ENGINEERING_HISTORY.md) | Complete Shop implementation and validation chronology | All | Primary dated source | B–G |
| [../AGENTS.md](../AGENTS.md) | Cost, privacy, migration and shared parity rules | Governance | Current rules; old developmentv2 labels are historical | A,I |
| [../NEW_CLIENT_ONBOARDING_V2.md](../NEW_CLIENT_ONBOARDING_V2.md) | Manual owner, six steps and stable local identity | Inherited onboarding | Current invariants; guided setup controls current procedure | C,D |
| [../BYO_SUPABASE_ONBOARDING.md](../BYO_SUPABASE_ONBOARDING.md) | Customer-owned project, private/public configuration separation | Baseline BYO | Supplementary historical reference | C,D |
| [../LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md](../LEGACY_PRIVILEGED_CREDENTIAL_CLEANUP.md) | Retired credential mapping and prohibited browser privileges | Security baseline | Historical/supplementary; not routine migration instructions | G |
| [CUSTOMER_SUPPORT_CONTRACT.md](CUSTOMER_SUPPORT_CONTRACT.md) | Ticket wire protocol and customer identity/privacy requirements | S1/S2 | Current wire contract; later journal extension applies | C,G |
| [CUSTOMER_SUPPORT_VALIDATION.md](CUSTOMER_SUPPORT_VALIDATION.md) | Initial regression failures, native/local distinctions and limitations | S1/S2 | Historical evidence; no new run implied | B,E |
| [CUSTOMER_SUPPORT_DEPLOYMENT.md](CUSTOMER_SUPPORT_DEPLOYMENT.md) | Initial Support deployment and separate administrator authority | S1 | Historical additive procedure; no completed-install replay | D |
| [SUPPORT_AUTOMATION.md](SUPPORT_AUTOMATION.md) | Route/session recovery and staged customer-local installation | S3 | Mechanisms current; v2 candidate/rollout state is historical | B,C,D |
| [BYO_GUIDED_SETUP.md](BYO_GUIDED_SETUP.md) | Current Node/native CLI guided installation and recovery | S4/S5 | Current primary customer guide; v6 selector is authoritative | C,D |
| [BYO_SETUP.md](BYO_SETUP.md) | Earlier manual BYO steps and legacy inputs | Baseline | Explicitly historical/superseded procedure | B,G |
| [BACKEND_DIAGNOSTICS_AND_DELIVERY.md](BACKEND_DIAGNOSTICS_AND_DELIVERY.md) | Owner/restricted evidence and durable pending/ACK semantics | S9 | Current contract; no-hosted-rollout checkpoint wording is historical | C,D,G |
| [CONTROLLED_BACKEND_UPGRADES.md](CONTROLLED_BACKEND_UPGRADES.md) | Exact customer-owned review/clearance/serial upgrade procedure | S11/S12 | Current primary upgrade/clearance guide | C,D,G |
| [Existing-shop-upgrade.md](Existing-shop-upgrade.md) | Earlier all-function additive upgrade review | S6 | Historical; controlled clearance workflow takes precedence | B,D |
| [SUPPORT_CONSOLE_VISIBILITY.md](SUPPORT_CONSOLE_VISIBILITY.md) | Canonical support-only debug console and denied customer roles | Inherited Support | Current boundary/supplementary validation | C,G |
| [PHASE4_PLATFORM_BRIDGE_BILLING_PAPER.md](PHASE4_PLATFORM_BRIDGE_BILLING_PAPER.md) | Transactional outbox, billing/thermal/Paper baseline | Phase4 | Inherited contract; not newly reaccepted wholesale | C,G |
| [../MODULE_ENTITLEMENTS.md](../MODULE_ENTITLEMENTS.md) | Plan/module and BILL/INVENTORY/THERMAL boundaries | Baseline | Inherited contract | C,G |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | Earlier merged phase/live-smoke status | 2026-10-04 | Historical; obsolete branch/status statements are not current PR authority | B,G |
| [PLATFORM_OVERHAUL_V1.md](PLATFORM_OVERHAUL_V1.md) | Separation of Shop operations and Platform control plane | Baseline | Supplementary design/historical rollout | A,C |
| [BLOCKING_VALIDATION_DIALOG_AUDIT.md](BLOCKING_VALIDATION_DIALOG_AUDIT.md) | Existing blocking/inline validation conventions | Frontend baseline | Supplementary, not a new redesign acceptance | C,G |
| [internal/BRANDING_AND_RENAME_GUIDE.md](internal/BRANDING_AND_RENAME_GUIDE.md) | Branding migration context and future naming work | Future work | Historical/future reference; modernization is deferred | G |
| [PHASE2_AUTH_RLS_FORENSIC.md](PHASE2_AUTH_RLS_FORENSIC.md) | Canonical roles/RLS inherited security baseline | Phase2 | Historical audit; not final privileged-browser credential check | G |
| [PHASE3_TRANSACTION_LEDGER_FORENSIC.md](PHASE3_TRANSACTION_LEDGER_FORENSIC.md) | Existing financial/idempotency/repair ledger semantics | Phase3 | Historical inherited contract; specific new continuity tests are separate | C,G |

### Sister repository responsibility and contract links

- [PR5_IMPLEMENTATION_AND_ACCEPTANCE.md](https://github.com/zaighaumrana/orbito/blob/feature/verified-customer-support-platform/docs/PR5_IMPLEMENTATION_AND_ACCEPTANCE.md)
- [PR5_ACCEPTANCE_CASES.csv](https://github.com/zaighaumrana/orbito/blob/feature/verified-customer-support-platform/docs/PR5_ACCEPTANCE_CASES.csv)
- [CUSTOMER_SUPPORT_CONTRACT.md](https://github.com/zaighaumrana/orbito/blob/feature/verified-customer-support-platform/docs/CUSTOMER_SUPPORT_CONTRACT.md)
- [RELEASE_INVENTORY_CONTINUITY.md](https://github.com/zaighaumrana/orbito/blob/feature/verified-customer-support-platform/docs/RELEASE_INVENTORY_CONTINUITY.md)
- [CONTROLLED_BACKEND_UPGRADES.md](https://github.com/zaighaumrana/orbito/blob/feature/verified-customer-support-platform/docs/CONTROLLED_BACKEND_UPGRADES.md)
- [BYO_CONTROLLED_UPGRADE_409.md](https://github.com/zaighaumrana/orbito/blob/feature/verified-customer-support-platform/docs/BYO_CONTROLLED_UPGRADE_409.md)

Historical documents are preserved unchanged. This summary reconciles their dated findings; an older developmentv2 label, inactive candidate, unapplied closure or pending upgrade sentence must not override the newer scoped observations above. Current operational procedures still require exact target/history/authority inspection before any separately authorized action.

### CSV schema and use

The UTF-8 RFC4180 register has 27 nonempty text columns: `case_id`, `journey`, `implementation_phase`, `title`, `priority`, `preconditions`, `procedure`, `expected_pass_condition`, `source_files`, `related_commits`, `documents`, `test_environment`, `evidence_location`, `evidence_date`, `historical_status`, `historical_finding`, `latest_verified_status`, `latest_evidence`, `provenance`, `execution_distinction`, `hosted_status`, `remaining_limitations`, `risk_if_untested`, `future_verification_procedure`, `acceptance_disposition`, `sister_reference`, `evidence_availability`. IDs are namespaced to this PR; original checklist cases keep their sequence. Source paths are repository-relative; documents are relative to docs/; E: is the external evidence root. Related commits resolve to real ancestors. Case evidence dates describe prior executions/observations, not this task's validation time.

Keep historical finding/status, latest recorded result, hosted status, provenance, execution distinction and final disposition together. Future verification text is a plan requiring separate authorization, not an action taken here. Aggregate owner acceptance and overlapping local suites must not inflate the CSV's distinct-case total.

## I. Final PR disposition

Implemented/source-complete: the Shop features and permanent narrow corrections above. Deployed/observed: final Shop production frontends and original reviewed upgrades. Owner-accepted: the specifically reported aggregate functional acceptance. Deferred/limited: explicit hosted categories, independent fresh destinations, final visual approval and full-source attestation.

PR #1 remains OPEN, DRAFT, UNMERGED to `development`; Platform PR #5 also remains Draft/Open/unmerged under the latest owner instruction. The owner's earlier Platform review approval is recorded in its summary, not treated as merge permission.

Only this repository's two requested artifacts are added. Existing histories/documents, runtime/tests/SQL/functions/config/releases, both completed jobs/pins/audits, protected Master/Vault and the excluded separate BYO checkout remain untouched. No full suite, new backend rollout/customer upgrade, credential collection or Cloudflare configuration change belongs to this checkpoint.

Read CSV latest status together with hosted status/provenance/limitations. Retain original failures and exact future procedures; no deferred row becomes PASS through documentation. Final documentation SHAs, counts/inventory/link/commit validation and actual skip proof are in `E:pr5-pr1-documentation-2026-10-25/REPORT.md`/`CURRENT.md`. The owner retains final visual/acceptance and merge disposition.
