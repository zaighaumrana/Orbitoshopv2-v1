# Existing Shop backend upgrades

28 October 2026. Start in Platform → Controlled Backend Upgrade → Customer CLI
instructions for the ten guided stages, then use the authoritative
[controlled backend upgrade procedure](CONTROLLED_BACKEND_UPGRADES.md) for BYO and
the live Master Platform approval/executor for Managed Shops.

Customer preflight is `node scripts/release-preflight.mjs --expected-sha APPROVED_SHA256`;
it uses approved Shop metadata without private Platform source. Internal paired
`npm run release:check` still needs compatible reviewed Shop/Platform checkouts.
Use native `supabase` from PATH, installed through the official Scoop bucket on
Windows; no package runner or mandatory executable path is required.

Support-v8 is source-approved (40 migrations/seven functions/ten requirements);
v7 and v6 remain supported historical sources. The Platform approval migration
20261030141736 and the three metadata-consuming Platform bundles await activation. Hosted activation and actual upgrades need separate owner action.
Preserve original pins, pairing, owner, credentials, journals and checkpoint history.

The former ungated terminal Managed path and BYO apply without separate Master
clearance are superseded and refused. Do not use those commands or setup-tool
recovery flags. The primary guide includes exact-source assessment, approval,
customer apply and original-job recovery. New empty-project provisioning uses
[BYO_GUIDED_SETUP.md](BYO_GUIDED_SETUP.md).

The current in-app guide uses the original fresh wizard’s Where/prerequisite/task/
success/recovery model. Copy each complete PowerShell block: it restores context in
new terminals, checks exit status and validates the actual report before PASS.
STOP means failed or blocked, never successful assessment. The stage selector and
Back/Next only browse instructions; they do not record backend verification.

For older clean M2 checkouts with a missing script, use the guide’s guarded fetch +
--ff-only recovery. Dirty, wrong-branch or divergent work must stop for owner review.
Restore original private folders/journals; reports use new unique names. Developer
paired parity stays separate from customer preflight.
