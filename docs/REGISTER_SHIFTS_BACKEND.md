# Register shifts — server-side backend, current 17 November 2026

> Checkpoint — 17 November 2026: `development` at `bff63c451ea11950b2dd7d17ccb7cbe73d742cc1`, confirmed matching `origin/development` and independently reproduced from a fresh clone of GitHub at that exact commit. This is a disposable-dev-shop-only backend addition, built under the owner's explicit **Option A**: the existing Managed/BYO upgrade path is deliberately not extended for this release, and Shop's own non-candidate release-parity check is expected to keep failing on `development` until the Platform-side promotion in `SUPPORT_V11_ACTIVATION_PREP.md` (sister repo, `orbito`) is applied. That failure is not a regression. This document covers the Shop side only; see the sister document for the Platform candidate/promotion.

## Purpose

Shift Stats (`docs/ACCOUNT_MENU_AND_SECURITY.md`) was a browser-local, browser-midnight report with no real start/stop and no connection to EMS. This backend replaces that with a real, server-held register shift: an Owner or Cashier opens a register with an opening cash count, the server computes the day's figures as money actually moves, and closing counts the cash and records the result permanently.

## What's new

One additive migration, `supabase/migrations/20261108120000_register_shifts.sql`, plus one line added to the existing `verify-pin` Edge Function. No existing table, function, or grant was altered beyond the three re-created dispatch functions below, and each of those keeps every prior line intact.

**Table `public.register_shifts`**
- One open register per operator, enforced by a partial unique index (`where ended_at is null`).
- RLS: Business Owner, Manager and Orbito Support read every row; a Cashier reads only their own. No browser role can insert, update or delete directly — every write goes through the RPCs below.
- A trigger (`register_shifts_protect`) makes a closed shift immutable: no field on a closed row can change, and rows are never deleted.

**Five RPCs** (`security definer`, each re-checks the caller's own `app_users` role rather than trusting the session):
- `open_register_shift(request_id, opening_cash)` — idempotent by request id; converges to the same open shift if called again from another device.
- `get_my_open_register_shift()` — the caller's own open shift, or null.
- `get_register_shift_summary(shift_id)` — a live, computed-on-the-fly summary for an open shift, or the frozen stored summary for a closed one.
- `close_register_shift(request_id, shift_id, counted_cash, note)` — computes the final summary, compares counted cash to expected, and requires a fresh `shift-close` PIN authorization (see below) only when a **Cashier** closes short. An Owner closing short needs no PIN; it's recorded as `owner-adjustment`.
- `force_close_register_shift(request_id, shift_id, note)` — Owner or Manager only; a Manager cannot force-close the Owner's own register. No count is taken; the close reason is recorded as `manager_forced`.
- `list_register_shifts(operator, limit, cursor...)` — bounded, keyset-paged history; a Cashier only ever sees their own.

**The summary** (`app_private.register_shift_summary`, not callable from the browser) reads only your existing tables — `payments`, `credit_approvals`, `returns`, `refunds`, `sales`, `sale_lines`, `tickets` — and classifies every payment into exactly one bucket:
- **Register cash**: cash sales, cash repair payments, cash paid at credit creation, cash repaid on existing credit, minus cash refunds. This sum is `expectedCash`.
- **Online channels** (Raast, JazzCash, EasyPaisa, Bank Transfer, and any other method in use): reported separately and explicitly excluded from `expectedCash`.
- **Credit (udhar)**: amount given, split by how much was paid at creation vs. repaid later, each split again by cash vs. online.
- **Returns**: count and total, with the cash portion already folded into the register-cash deduction above.
- **Sales and repairs**: invoiced totals, items sold, discounts, tickets created, phones handed back, and tickets currently open.

**New PIN purpose `shift-close`**: added to the existing `step_up_authorizations` check constraint and to `verify-pin`'s accepted purposes, alongside `admin`, `settle`, `return`, `discount`, `udhar`, `remove-component`, `repair-refund`, `inventory`. A `shift-close` authorization is claimed (`app_private.claim_step_up`) bound to the exact shift id and counted amount, so it can authorize only that one close and is consumed on use — a second short close needs a fresh PIN.

**Capability and config surface**: `shop_backend_capabilities()` gained one entry, `register-shifts`, computed from the table's RLS policies, grants, trigger and the five RPCs' existence — the same self-checking pattern as every prior capability. `get_app_config()`'s `read_contracts` gained `register_shifts: 1`. Both functions were re-created with every prior line preserved.

## Invariants

- The front-end's Stage 1 browser-local preview (`src/shift/shift-store.js` and friends) is untouched by this commit and still drives the UI; Stage 4 will switch the callers over to these RPCs. No UI currently depends on this backend yet.
- Online payments and unpaid credit never count toward register cash, in either direction.
- A shortfall by a Cashier always needs a reason and a fresh PIN; a shortfall by the Owner never does. An overage never needs either.
- A closed shift's stored summary never changes, even if later activity is recorded against the same time window.

## Candidate registration (Platform)

`scripts/backend-release-catalog.json` gained one entry, keyed by the release's sha256 (`caa5a5d5af74fd97fee263330582fe5eefc5a5a35f4b66252cf736eb018b1e5c`), mirroring the same manifest shape as every prior entry, with `approved_for_new: false` / `supported: false` / `review_status: candidate-local` — matching the Platform-side candidate it pairs with. `scripts/backend-requirements.json` and `scripts/backend-inventory.ts` were updated in the backend's own commit to declare the `register-shifts` requirement and recognize it as an optional capability. See `docs/SUPPORT_V11_ACTIVATION_PREP.md` in the `orbito` repository for the paired candidate registration and the (prepared, not yet applied) promotion plan.

## Validation

- **SQL behaviour test** (`tests/register-shifts-sql.mjs`): a disposable native PostgreSQL 16 instance with the real synthetic Auth/pgcrypto bootstrap used by this repo's other SQL tests, applying all 43 real migrations in order. **67/67 checks pass**: capability and `read_contracts` surfacing; opening (idempotency, convergence across devices, role restriction to Owner/Cashier, negative-amount and request-id-reuse rejection, the one-open-register-per-operator database constraint); a genuine two-connection concurrent-open race (confirmed to converge to exactly one open shift); row security (Cashier sees only their own, Manager/Owner see all, Technician sees none, no direct browser writes, anonymous callers refused, the summary helper unreachable from the browser); the summary's money maths against seeded fixture data across every bucket; closing (short/exact/over, PIN claim and consumption, wrong PIN, server-unavailable distinguished from wrong-PIN, a second short close requiring a fresh PIN, a PIN approved for a different purpose not transferring); force-close authorization and idempotency; and keyset paging (non-overlapping pages, full coverage, operator filtering, page-size cap).
- **Lint**: 0 errors on every touched file.
- **Production build**: 145 modules, succeeds.
- **Owner's Node-only unit suite**: no test newly fails relative to the pre-change baseline. The only failures present are the same 8 release-fingerprint-gate failures that exist by design under Option A, and are expected to persist until the Platform-side promotion is applied.

## Limits

- Not run against any live Supabase project — not Shop's, not Platform's. The SQL test's disposable PostgreSQL is a synthetic environment, not a hosted database.
- No UI currently calls any of these RPCs (see Invariants above).
- No existing shop's installed backend is affected; this exists only as an unapproved Platform candidate as of this writing.
