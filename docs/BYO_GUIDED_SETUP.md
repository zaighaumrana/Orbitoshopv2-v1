# Customer-operated guided BYO setup — 2026-10-20

This is a local, uncommitted implementation awaiting owner review. The active
Platform package remains Support-v2. Support-v3 is an **inactive 36-migration,
7-function candidate**, fingerprint
`f3fb64e51f1d07c536c626acd33b0e05b98b4fe5a22c3a7c3ff1a02a6a9e5bfd`.
Approval of this candidate and the exact hosted target must precede installation.
No promotion or deployment was performed during this pass.

## Customer journey

1. Use the reviewed Shop checkout, Node.js 22 or newer, and an installed native
   Supabase CLI v2 signed in to the **customer's** account. CLI 2.120.0 was inspected.
   Discovery checks PATH and npm's configured cache, including arbitrary `_npx`
   entries. Nothing is downloaded or installed automatically.
2. Download the exact client's pairing file from Platform. Keep it outside both
   repositories, along with a separate private runtime file containing only the
   supported entries, including `TURNSTILE_SECRET`. Use a folder accessible only
   to the authorized operator. Windows inherits the folder's ACL; POSIX writes
   request mode 0600. Never put secrets in command arguments or VITE variables.
3. From the Shop folder run:

   ```powershell
   node scripts/setup-byo.mjs
   ```

   Choose a journal filename in that existing private folder, the pairing and
   runtime files, and `fresh` or `existing`. The exact Client ID/project comes
   from pairing metadata. The wizard checks CLI capabilities, account project
   visibility, package/source fingerprint and exact migration history. It prints
   the target, mode, release and missing migration count. It does not install
   anything unless the operator enters the complete named-target authorization
   shown at the prompt. Declining stops after preflight.
4. The customer CLI installs migrations, secrets and functions. Migration SQL and
   its original history source commit atomically under a transaction advisory
   lock. Existing installations must have at least the exact approved 32-entry
   prefix and the same client/binding. Existing mode leaves ownership, pairing,
   base runtime secrets and base functions intact; it installs forward SQL and
   the optional Support function. The new paper bridge sender needs a separately
   approved targeted `platform-bridge` update for existing Shops.
5. In Platform, reserve the owner with the existing Provision Shop action. Create
   their confirmed Auth account directly in the Shop Dashboard, check activation,
   and let the owner complete the existing six-step setup. No owner password is
   collected by Platform or this wizard.
6. Resume with the same journal after owner setup:

   ```powershell
   node scripts/setup-byo.mjs --journal "PRIVATE_FOLDER\setup.json" --enroll
   ```

   Read-only observation distinguishes waiting for owner, waiting for onboarding
   and Support enrollment pending. The wizard creates the exact **public** Support
   target automatically from the Shop source/binding and pairing destination. It
   retains one UUID, one private Support settings file, and one hash-only handoff.
   An optional existing public target can be supplied with `--config`.
7. Give only `support-PROJECT-handoff.json` and `support-target-PROJECT.json` to
   the Platform Master. The Master uses Customer Support → Prepare & verify
   Support with the hash file and the Shop's public anon JWT. Keep the `.env`
   settings, customer CLI authority, DB password and service keys customer-side.
   Master capability proof/enabling stays in the existing authenticated Platform
   flow; customer Management authority is never sent to Platform.
8. Perform the real Shop ticket → Platform resolution → Shop refresh acceptance.
   Optionally record that **owner-reported** result locally:

   ```powershell
   node scripts/setup-byo.mjs --journal "PRIVATE_FOLDER\setup.json" --record-acceptance
   ```

   This asks for the public test-ticket UUID and a named-project confirmation.
   `Completed` is explicitly an owner-reported receipt, not an automated hosted
   verification claim. Support pending alone never means accepted.

## Status, interruption and recovery

```powershell
node scripts/setup-byo.mjs --journal "PRIVATE_FOLDER\setup.json" --status
```

Status reads only the local journal and makes no CLI/network calls. Ordinary
re-entry repeats preflight, verifies the same target/package/files and retains
completed provider steps. The journal contains public identifiers, package hash,
private-file paths, state and step outcomes; no file contents, tokens, credential
hashes or passwords. Never edit it to bypass a conflict. Keep the original private
files unchanged while an operation is unresolved.

Migration interruption is reconciled through the exact source ledger. A timeout
does not justify a replacement identity or a reset. Replaying the same atomic
envelope waits for the original transaction lock, then checks the recorded source.

Function and secret writes are fenced **before** dispatch. A running/unknown step
blocks automatic replay even after process restart. Review the exact provider
operation and confirm it has finished with the intended artifact/settings. Only
then use:

```powershell
node scripts/setup-byo.mjs --journal "PRIVATE_FOLDER\setup.json" --confirm-provider-complete "STEP_FROM_STATUS"
```

The wizard requires a named project/step confirmation. This records an operator
attestation, then retains that step without sending it again. If the provider
cannot prove completion, keep Needs intervention; do not acknowledge speculatively
or generate replacement secrets. Runtime verification still follows reconciliation.
A leftover `.lock` is removed manually only after confirming the earlier process
has stopped. A second process cannot remove another process's lock.

## Fresh initialization uncertainty

The frozen 34-entry package produced a neutral pending Shop in native PG17 using
both actual migration envelopes. A pre-existing Auth identity before onboarding-v2
reproduces the timestamp/owner-reservation error by deliberately failing the strict
pristine predicate. There is no retained pre-correction Client #3 snapshot proving
which predicate failed there. No automatic timestamp reset is implemented.

The new forward migration is a service-only diagnostic guard and does not mutate
configuration, ownership, users or timestamps. The installer stops before runtime
credentials if fresh initialization is ambiguous. The managed path now also checks
the timestamp before preparing pairing/secrets and revalidates source history even
when an aggregate migration stage was previously passed.

## Client #4 approval checkpoint

Target is Client 4, project `mincersddxuaqojczcih`, binding `orbito-client-4`,
intended UI `https://retrabyo.ahwad.com`. It belongs to a separate customer account.
No new hosted read/write was performed. Before installation approve the exact
candidate, preserved package checksums, local changes and this named target.
The command above is the entry point; a native npm-cache executable path or a
manually constructed migration command is no longer required.

Paper rollout is separate: review/apply the additive Shop SQL and compatible
Shop bridge sender before the Platform SQL/UI begins sending communication.
New candidate installation includes the sender. Existing-Shop additive Support
setup deliberately does not redeploy base functions. Promotion into managed jobs
requires a separate registry/pin/automation compatibility review: this candidate
is not registered as active and the existing promotion utility must not be used
to infer authorization for it.
