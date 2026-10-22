# Existing Shop: additive backend upgrade

This is a reviewed procedure, not deployment authorization. Fresh installations use
`setup-byo.mjs` or Managed setup. An initialized v1/v2 Shop uses this separate tool;
the normal existing-mode installer deliberately stops before SQL-only upgrading.
Never run owner bootstrap again. Keep the old checkout, package, setup/enrollment
journals and customer private inputs. Never delete history, reset or rotate secrets.

## Review and authorize

Use the final reviewed Shop checkout and Node 24. Read
`scripts/byo-release-manifest.json` for the exact target fingerprint and
`scripts/backend-release-catalog.json` for the installed source fingerprint.
Inventory the actual migration ledger before declaring the source. Unrecognized,
adopted or mismatched historical SQL requires a manual provenance review; do not
substitute a guessed source fingerprint. Save the new upgrade journal in an
existing private directory outside both repositories, separate from setup journals.

```powershell
# Customer-authorized BYO: prepare native CLI, then sign in to the customer's account.
npx --yes supabase@2.120.0 --version
node scripts/setup-byo.mjs --login
node scripts/upgrade-backend.mjs --mode byo --project-ref EXACT_SHOP_REF --client-id CLIENT_ID --from-sha INSTALLED_SHA256 --journal C:/Private/RetraSell/upgrade.json --review
# Only after review and separate customer authorization:
node scripts/upgrade-backend.mjs --mode byo --project-ref EXACT_SHOP_REF --client-id CLIENT_ID --from-sha INSTALLED_SHA256 --journal C:/Private/RetraSell/upgrade.json --apply
```

Managed upgrades use the identical arguments with `--mode managed`, in a trusted
operator terminal. Supply `PLATFORM_URL`, `PLATFORM_ANON`, a current
`PLATFORM_OPERATOR_JWT` and `PLATFORM_MANAGEMENT_TOKEN` through the operator's
approved secret mechanism. They are never VITE values, command arguments or files
in Git. The tool rechecks canonical live Master identity and exact managed client,
infrastructure and project before each provider call. BYO uses only the customer's
own native CLI authorization; never collect their PAT/password in Platform.

Review is read-only at the provider. Apply additionally requires typing
`UPGRADE EXACT_SHOP_REF TARGET_SHA256`. It checks completed active onboarding,
existing owner reservation and source/binding; validates the exact migration prefix;
applies only missing approved SQL with transactional ledger checks; deploys every
required function with its approved JWT setting; and compares the owner/binding
snapshot again. Existing gateway differences stop for manual review. Unrelated
functions, secrets, Auth users and owner bootstrap are not rewritten. Suspended,
incomplete, legacy owner mappings and unsupported ledgers stop with a recoverable
reason rather than being silently adopted. Review these states separately.

## Interrupted operation

Reuse the same command, source/target and journal. The journal preserves the UUID,
source and target fingerprints and original binding. A SQL commit with a lost reply
is reconciled by exact ledger/checksum read-back. A running/unknown function step
stops; neither elapsed time nor a function's presence proves the intended source.
Review provider deployment logs, exact source and gateway settings before recording:

```powershell
# Add to the original --apply command only after authoritative source/gateway review:
# --confirm-provider-complete function:login --provider-reference PUBLIC_RECEIPT_ID
```

The tool requires a separate `CONFIRM EXACT_SHOP_REF function:login`. This is
explicitly an operator-reported attestation, not automatic source verification.
Never use it to conceal failure. Remove a stale journal lock only after confirming
its original process stopped. If source cannot be established, stop for a separately
authorized repair, retain all journals and never invent a different operation.

Existing custom PostgREST hooks require reviewed composition; the consent migration
refuses to replace them. After upgrading, verify the effective Data API hook and
actual revoked/expired Support requests, all seven function deployments, owner login,
ticket reads/creation, Paper, billing and POS. Completion is backend installation,
not hosted customer acceptance. Resume optional enrollment only after backend
upgrade; use original enrollment identity and private state.
