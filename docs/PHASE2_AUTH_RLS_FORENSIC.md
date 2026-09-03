# Phase 2 Auth/RLS Forensic Record

Date: 2026-09-03  
Project: `kxmovywgshyltwusghhj` (Orbito shop dev db)  
Branch: `phase2-auth-rls`

This document intentionally contains no passwords, PINs, hashes, service keys,
access tokens, refresh tokens, or authorization headers.

## Safety and repository preflight

- Starting branch: `development`
- Starting HEAD: `fc6ab0bf354773069cef35cfd612ad7b263e01a6`
- Expected HEAD matched: yes
- Starting worktree clean: yes
- Required tag `phase1-login-stabilized-2026-09-03`: present
- Historical baseline modified: no
- Phase 2 branch created before implementation: yes
- Initial `npm run build`: passed
- Initial CLI migration ledger: local and remote matched
- Initial `db push --dry-run`: `Remote database is up to date.`

## Live identity preflight

| Check | Result |
|---|---|
| Active employees with null/blank/invalid email | none |
| Duplicate normalized employee emails | none |
| Owner email duplicated by employee | no |
| Employee roles | Cashier: 1 |
| Employee statuses | Active: 1 |
| Employees with Business Owner role | none |
| Nonblank legacy employee passwords | 1 row (employee ID 1) |
| Owner legacy password populated | yes (boolean check only) |
| Override PIN populated | yes (boolean check only) |
| Existing `auth.users` | none |
| Auth/owner/employee collisions | none |

No identity anomaly met a mandatory stop condition.

## Live authorization preflight

RLS enabled before Phase 2: `active_sessions`, `employees`, `inventory`,
`password_reset_requests`, `returns`, `sales`, `shop_config`,
`support_access_log`, `tickets`, and `udhar`.

RLS disabled before Phase 2: `attendance`, `leaves`, `quick_items`,
`repair_components`, `salary_config`, and `salary_slips`.

Legacy allow-all policies were present on `active_sessions`, `employees`,
`inventory`, `password_reset_requests`, `returns`, `sales`, `shop_config`,
`tickets`, and `udhar`. Both `anon` and `authenticated` held all table
privileges on the legacy application tables, including the six tables without
RLS. This confirmed that those six tables were reachable through the Data API.

`next_invoice_seq()` and `next_ticket_seq()` were `SECURITY DEFINER`, had no
hardened `search_path`, and were executable by `PUBLIC`, `anon`, and
`authenticated`.

`pgcrypto` is installed in the `extensions` schema. All Phase 2 calls to
`crypt`, `gen_salt`, and `gen_random_uuid` are schema-qualified.

## Migrations

| Migration | Purpose | DEV status |
|---|---|---|
| `20260903165753_phase2_auth_foundation.sql` | Canonical identities, hash-only vault, shop security, step-up table, hardened helpers, safe config RPCs | applied |
| `20260903170222_phase2_auth_bridge_helpers.sql` | Server-only hash verification RPC | applied |
| `20260903171448_phase2_security_helpers.sql` | Server-only PIN hashing/verification RPCs | applied |
| `20260903175518_phase2_legacy_credential_vault.sql` | Hash credentials/PIN and null legacy plaintext locations | applied |
| `20260903180703_phase2_neutralize_unused_employee_pin.sql` | Null confirmed-unused `employees.pin_code` data | applied |
| `20260903181153_phase2_authenticated_rls.sql` | Remove broad policies/grants, enable RLS everywhere, apply role matrix, harden sequence RPCs | local only; safety-gated |

Every applied migration was preceded by `npm run build`, `migration list`, and
`db push --dry-run`.

## New tables and functions

- `app_users`: canonical table-backed role/status authority linked to
  `auth.users`; authenticated users can select only their own row.
- `legacy_auth_credentials`: service-only one-time migration hashes.
- `shop_security`: service-only override PIN hash.
- `step_up_authorizations`: service-created, Auth-user-bound, exact-purpose,
  short-lived authorization records.
- `app_private.current_app_role()`
- `app_private.current_employee_id()`
- `app_private.current_app_user_active()`
- `app_private.current_client_access_allowed()`
- `app_private.has_step_up(text)`
- `get_public_shop_config()`
- `get_app_config()`
- `verify_legacy_credential(text, text)` (service only)
- `set_override_pin(text)` and `verify_override_pin(text)` (service only)

Privileged functions use `search_path = ''`, qualify application objects, and
have explicit revokes/grants. The anonymous safe-config function is the one
intentional public `SECURITY DEFINER` API and returns a fixed whitelist.

## Edge Functions

- `login`: Turnstile-protected Auth migration gateway. Existing `app_users`
  identities use Supabase Auth only. Matching orphan Auth users fail closed.
  Successful first login creates Auth + mapping with cleanup on partial failure.
  Support uses a dedicated client Auth identity and magic-link token-hash
  exchange; the platform token is never returned.
- `account-admin`: authenticates the caller JWT and reads canonical role/status;
  manages employee Auth/domain/mapping lifecycle, resets, owner email, safe
  configuration, and PIN changes.
- `verify-pin`: authenticates the caller, verifies the server-side PIN hash, and
  creates a 75-second exact-purpose authorization.
- `password-reset-request`: Turnstile-protected, enumeration-resistant, and
  server-written.
- `public-track`: exact identifier plus secondary phone verification, with a
  fixed response whitelist and masked IMEI.

## Legacy credential migration status

Post-migration verification (counts/booleans only):

- Hash-only vault rows: 2 (1 owner, 1 employee)
- Remaining nonblank `employees.password`: 0
- Remaining nonblank `shop_config.owner_password`: 0
- Remaining nonblank `shop_config.override_pin`: 0
- `shop_security.override_pin_hash` populated: yes
- Remaining unmigrated legacy accounts: 2

Each successful first login creates the user's Auth identity/mapping and consumes
that user's vault row. Once an `app_users` row exists, login never falls back to
legacy verification.

`employees.pin_code` had no application call site. Its data was neutralized in a
separate migration; the compatibility column remains.

## Planned RLS policy matrix

| Surface | Read | Browser mutation |
|---|---|---|
| `app_users` | own row | none |
| `employees` | Owner/Support/Manager roster; employee own row | none; `account-admin` only |
| `inventory` | Cashier/Manager/Owner/Support | Manager/Owner/Support |
| `quick_items` | all active application roles | Manager/Owner/Support |
| `repair_components` | all active application roles | Manager/Owner/Support; delete needs `remove-component` step-up |
| `tickets` | all active application roles | counter insert; staff update |
| `sales` | Cashier/Manager/Owner/Support | counter insert; discount/Udhar variants require matching step-up |
| `returns` | Cashier/Manager/Owner/Support | insert requires `return` step-up |
| `udhar` | Cashier/Manager/Owner/Support | insert requires `udhar`; update requires `settle` |
| `attendance` | own; Manager/Owner/Support all | own clocking; admin update |
| `leaves` | own; Manager/Owner/Support all | own pending request; admin review |
| salary tables | Manager/Owner/Support | Manager/Owner/Support |
| password resets | Manager/Owner/Support | server only |
| `shop_config` | safe RPCs only | server only |
| support log | Owner/Support | service only |
| `active_sessions` | none | none |

Every protected policy also requires an Active canonical app user and current
client access. Suspended clients deny normal roles; Orbito Support bypasses only
the suspension check.

## Tests completed

- Production Vite build: passed after Auth/frontend changes.
- Initial live identity/schema/grant/function preflight: passed.
- Local/remote migration ledger checks before every applied migration: passed.
- Dry-run before every applied migration: passed.
- Credential vault post-check: passed (no plaintext values queried/output).
- Public tracking invalid-input runtime smoke: HTTP 400, safe response.
- Password reset missing-Turnstile runtime smoke: HTTP 403.
- Login/account-admin/verify-pin without JWT: HTTP 401 at gateway.
- Browser source search: no direct `shop_config` query/update, no direct employee
  account mutation, no `CFG.owner_password`, and no `CFG.override_pin` use.
- Legacy forged-session defense: code path ignores and removes
  `retailos_session`; only verified Supabase user + own `app_users` row can boot.

## Tests still required before live RLS

The authoritative sequence forbids RLS cutover until real Auth sessions pass.
These require credential-holder interaction and must not be automated by reading
or exposing credentials:

- Owner first-login migration, refresh/token restoration, password change,
  logout, and old-password rejection.
- Cashier first-login migration and POS smoke.
- Orbito Support login/session bootstrap, audit record, and suspended-client
  access.
- Manager and Technician role sessions (after accounts exist).
- Full manager-escalation, anonymous, public-track valid-match, PIN purpose/expiry,
  and suspension matrices after RLS cutover.

## Residual known gaps

- Ticket updates remain row-authorized but not column/transition-specific because
  existing repair payment/status logic spans several direct updates. Tightening
  those invariants belongs with the repair/accounting stabilization phase.
- Step-up rows are reusable for their short lifetime rather than transaction-
  consumed. They are bound to Auth user and exact purpose and expire after about
  75 seconds.
- POS sale/Udhar atomicity, repair payment ledger, returns accounting, inventory
  movement ledger, and billing architecture are deliberately unchanged.
- The local RLS migration is not applied until the required real-session gate.

## Deployment order and rollback notes

Completed order: additive foundation -> bridge helper -> login v8 -> PIN helper
-> credential vault -> unused PIN neutralization -> remaining Edge Functions.

Remaining order: deploy application frontend -> perform real-session smoke tests
-> apply `20260903181153_phase2_authenticated_rls.sql` -> run anonymous/role/PIN/
suspension matrix -> advisors -> final migration/schema comparison.

Rollback must never restore plaintext credentials. Before RLS cutover, the old
UI remains wire-compatible with the login response, while the hash vault remains
the only legacy password authority. After an account is migrated and its vault
row consumed, rollback requires a controlled Auth password reset, not restoration
of the old plaintext column.

## Final gate status

Phase 2 is not yet safe to merge. The real-session gate and live RLS cutover are
still pending. The final migration ledger and final schema comparison must be
recorded after that cutover.

