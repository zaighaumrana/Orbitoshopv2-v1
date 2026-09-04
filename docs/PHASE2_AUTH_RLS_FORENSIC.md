# Phase 2 Auth/RLS Forensic Record

Date completed: 2026-09-04

Supabase DEV project: `kxmovywgshyltwusghhj`

Branch: `phase2-auth-rls`

Merge status: not merged into `development`

This record intentionally contains no passwords, PINs, hashes, service keys,
access tokens, refresh tokens, or authorization headers.

## Outcome

Phase 2 authentication and database-authorization stabilization is applied to
the linked DEV project. Supabase Auth plus `public.app_users` is now the
canonical identity/role boundary, broad anonymous access is removed, all 20
public tables have RLS enabled, and the complete executable anonymous/role/PIN/
suspension matrix passed.

The required Owner, existing Cashier, and Orbito Support real-session gate also
passed cleanly. The branch remains intentionally unmerged.

## Repository and deployment preflight

- Starting `development` HEAD: `fc6ab0bf354773069cef35cfd612ad7b263e01a6`
- Required tag `phase1-login-stabilized-2026-09-03`: present
- Historical baseline modified: no
- Phase 2 implementation branch: `phase2-auth-rls`
- Build before the RLS cutover: passed
- Migration list before the RLS cutover: only the staged RLS migration was local
- RLS dry-run: exactly `20260903181153_phase2_authenticated_rls.sql`
- RLS push: applied successfully
- Follow-up credential-sealing migration build/list/dry-run: passed
- Final local/remote migration history: equal through `20260904001510`
- Final `db push --dry-run`: `Remote database is up to date.`

## Canonical identities and support separation

The live support preflight verified one dedicated client-project Auth identity:

- email: `orbitosupport+kxmovywgshyltwusghhj@support.orbito.internal`
- `app_users.role = 'Orbito Support'`
- `app_users.employee_id IS NULL`
- `app_users.status = 'Active'`
- corresponding `auth.users` row: present
- corresponding `support_access_log` row: present
- log retains the real platform user identity and the separate client Auth user

The shop Owner remains a distinct Auth/app identity. No customer Auth user was
deleted, merged, relabelled, or hijacked. The login Edge Function verifies the
configured Orbito platform credentials first, then generates and verifies a
magic-link token for this deterministic client support identity. No persistent
support password is stored.

## Applied Phase 2 migrations

| Migration | Purpose | DEV status |
|---|---|---|
| `20260903165753_phase2_auth_foundation.sql` | Canonical identities, service-only credential stores, step-up table, role helpers and safe config RPCs | applied |
| `20260903170222_phase2_auth_bridge_helpers.sql` | Server-only legacy hash verification | applied |
| `20260903171448_phase2_security_helpers.sql` | Server-only override-PIN hashing and verification | applied |
| `20260903175518_phase2_legacy_credential_vault.sql` | Hash legacy credentials/PIN and null plaintext locations | applied |
| `20260903180703_phase2_neutralize_unused_employee_pin.sql` | Null the confirmed-unused employee PIN data | applied |
| `20260903181153_phase2_authenticated_rls.sql` | Revoke broad grants/policies, enable RLS everywhere, enforce role matrix and harden sequence RPCs | applied |
| `20260904001510_phase2_reseal_legacy_plaintext_credentials.sql` | Remove a detected plaintext regression and enforce null-only legacy credential columns | applied |

Every live migration was preceded by a successful build, migration-ledger check,
and linked dry-run.

## Database authorization state

Post-cutover structural checks confirmed:

- 20 of 20 `public` tables have RLS enabled
- no table remains without RLS
- no anonymous table privileges remain
- authenticated grants match the explicit Phase 2 migration
- 35 expected policies are present
- `anon` cannot execute `next_invoice_seq()` or `next_ticket_seq()`
- permitted active authenticated roles can execute the sequence helpers
- closed service tables deliberately have RLS with no browser policies

The canonical authorization helpers require an Active `app_users` row and
current client access. A suspended client blocks normal shop roles; only the
canonical Orbito Support role bypasses the suspension condition.

## Edge Functions deployed

| Function | Version | Gateway JWT | Security purpose |
|---|---:|---|---|
| `login` | 9 | required | Turnstile/Auth migration gateway and separated support bootstrap |
| `account-admin` | 2 | required | Server-managed employee/Auth/config/reset lifecycle |
| `verify-pin` | 1 | required | Server PIN verification and 75-second exact-purpose step-up |
| `password-reset-request` | 1 | not required | Turnstile-protected, enumeration-resistant reset request |
| `public-track` | 1 | not required | Exact ticket plus phone verification with fixed safe response |

The two functions without gateway JWTs implement their required public-facing
verification in the function body. No function exposes a service credential to
the browser.

## Real-session gate

User-operated live verification passed without identity collision, duplicate
login rendering, or Turnstile widget warnings:

| Identity | Login | Refresh/restore | Logout |
|---|---|---|---|
| Business Owner | pass | pass | pass |
| Existing Cashier | pass | pass | pass |
| Orbito Support | pass | pass | pass |

Support restored with the canonical `Orbito Support` role. Logout returns to one
login render and starts from a clean Turnstile widget lifecycle.

## Anonymous security matrix

Actual anonymous REST checks returned HTTP 401 for `shop_config`, `employees`,
`tickets`, `attendance`, `leaves`, `salary_config`, `salary_slips`, and
`password_reset_requests`.

Rollback-only SQL assertions additionally confirmed:

- anonymous reset-request inserts are denied
- anonymous invoice/ticket sequence calls are denied
- no anonymous access exists to EMS/salary or other application tables

Result: pass.

## Role read matrix

Role tests used live table data with rollback-only role impersonation; temporary
role/status changes were rolled back and verified absent afterward.

| Role | Result |
|---|---|
| Owner | Authorized business/EMS/financial reads; only own `app_users`; no raw `shop_config` access |
| Manager | Roster, catalog, financial, EMS and reset-request reads; no support log |
| Cashier | Own employee/attendance plus permitted catalog/ticket/financial reads; no salary/reset/support log |
| Technician | Own employee/attendance plus repair catalogs/tickets; no inventory/financial/salary/reset/support log |
| Orbito Support | Full intended support reads, including support log |
| Inactive app user | No client access and zero protected data; own identity row remains visible for fail-closed boot |

Result: pass.

## Role mutation matrix

All DML tests ran inside transactions and were rolled back.

- Cashier: ticket work, own attendance, pending leave and self-attributed plain
  cash sales passed. Catalog mutation, cross-employee sales, EMS administration,
  salary, returns and Udhar without step-up were denied. Exact step-up enabled
  only the requested return/Udhar/settlement/discount operation.
- Owner: catalog, tickets, plain sales, EMS administration, salary and sequence
  operations passed. Direct browser employee mutation was denied. PIN-sensitive
  financial paths required matching step-up.
- Manager: the same authorized operational/admin paths passed under a temporary
  canonical Manager role. Direct employee-table mutation remained server-only.
- Technician: ticket updates, own attendance and pending leave passed. Admin
  catalog, ticket creation, financial writes, salary and sequence operations
  were denied.
- Orbito Support: intended catalog/ticket/sale/EMS/salary/sequence operations
  passed. Direct employee mutation and browser-written support audit rows were
  denied; support has no employee attendance identity.

The `account-admin` source-level escalation matrix was also inspected: a Manager
can target only Cashier/Technician identities, cannot create or promote to
Manager/Owner, cannot edit the Owner, and cannot reset Owner/Manager credentials.
Owner/config/PIN changes remain Owner/Support-only.

Result: pass for database enforcement; see the live-account coverage gap below.

## PIN and step-up matrix

- safe public/app configuration excludes `override_pin`, `owner_password`, and
  `owner_email`
- legacy employee PIN data is absent
- legacy plaintext override PIN is absent
- a server-generated random numeric test candidate was accepted only when exact
- a wrong candidate was rejected
- a different-purpose authorization was rejected
- an expired authorization was rejected
- rollback cleanup left no test step-up rows

No reusable PIN, candidate, or hash was read into or written to this record.

Result: pass.

## Public tracking matrix

A synthetic negative-ID ticket was inserted with `OVERRIDING SYSTEM VALUE`,
tested over HTTP, and removed in a `finally` cleanup. Cleanup was verified.

| Request | Result |
|---|---|
| Exact ticket identifier + exact phone | HTTP 200, fixed safe shape |
| Partial identifier | HTTP 404 |
| Wrong phone | HTTP 404 |
| Ticket only | HTTP 400 |
| Phone only | HTTP 400 |

The valid response excluded technician notes, payment history and full IMEI; the
IMEI was masked.

Result: pass.

## Suspension matrix

Inside one rollback-only transaction the shop was marked suspended:

- Owner, Manager, Cashier and Technician lost client access and saw zero
  protected rows
- normal-role config and sequence calls were blocked
- Orbito Support retained canonical support access
- Support could read suspended configuration state and use intended sequence RPCs

The transaction rolled back. Cashier role/status, shop suspension state, test
tickets and step-up fixtures were all verified restored/absent.

Result: pass.

## Plaintext-credential regression and containment

The initial credential-vault migration correctly nulled legacy fields. A
post-matrix boolean/count check later detected one active, unmapped employee row
whose plaintext password column had become populated again while its hash-vault
row still existed. The value was never selected, logged, or displayed.

The repository contains no current server account path that writes this column.
It is therefore reasonable, but not proven, to infer that a stale legacy client
reintroduced it before the RLS cutover removed broad browser writes.

`20260904001510_phase2_reseal_legacy_plaintext_credentials.sql` remediated this
as a release blocker:

- all `employees.password` values were nulled
- `shop_config.owner_password` and `shop_config.override_pin` were re-nulled
- validated constraints now require all three legacy fields to remain null
- the existing employee hash-vault row was preserved for first-login migration

Final non-sensitive verification:

- plaintext employee-password rows: 0
- plaintext owner-password rows: 0
- plaintext override-PIN rows: 0
- validated employee null constraint: present
- validated shop-config null constraint: present
- direct non-secret write probes: rejected by both constraints
- remaining hash-only employee vault rows: 1

## Advisor results

Supabase security and performance advisors were rerun after the final DDL.

No critical authorization finding was reported. Known notices are:

- INFO: RLS/no-policy on `active_sessions`, `legacy_auth_credentials`,
  `shop_config`, `shop_security`, and `step_up_authorizations`; these tables are
  intentionally closed to browser roles
- WARN: callable `SECURITY DEFINER` functions for the deliberately public safe
  config and authenticated app-config/sequence APIs; their inputs/outputs,
  internal authorization and explicit grants were reviewed
- WARN: Supabase Auth leaked-password protection is disabled
- INFO: several existing foreign keys lack covering indexes; this is a
  performance backlog, not an authorization bypass

## Residual gaps and deferred work

- No persistent live Manager or Technician Auth accounts existed. Their RLS
  matrices were tested by rollback-only canonical-role substitution. The
  Manager account-admin escalation restrictions were source-inspected rather
  than exercised with a live Manager JWT.
- One employee remains hash-vault-only and will be migrated on a successful
  first login. Its plaintext compatibility field is now database-enforced null.
- Supabase Auth leaked-password protection should be enabled in the project Auth
  settings.
- Ticket updates are row-authorized but not yet column/transition-specific.
- Step-up rows are exact-purpose and short-lived but reusable during their
  approximately 75-second lifetime.
- Atomic retail/Udhar/inventory, repair payment allocation, returns accounting,
  repair workflow/financial state separation and billing reconciliation remain
  explicitly deferred to later stabilization phases.

## Rollback boundary

Rollback must never restore plaintext credentials or broad anonymous policies.
An Auth-migrated account can be recovered only through a controlled Auth reset,
not by repopulating legacy password columns. The final constraint migration is a
defense-in-depth invariant and should remain even if application code is rolled
back.

## Final gate and merge recommendation

The Phase 2 database cutover and available security matrix are complete, with no
critical authorization failure. Local and remote migration histories match and
the linked dry-run is up to date.

Recommendation: keep `phase2-auth-rls` unmerged as requested. Before approving a
production merge, provision disposable Manager and Technician Auth identities
and run the remaining live-JWT account-admin escalation smoke, then enable leaked
password protection (or explicitly accept that Auth configuration risk).
