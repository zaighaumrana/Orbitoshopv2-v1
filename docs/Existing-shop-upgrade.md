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

Support-v7 is source-approved (39 migrations/seven functions); v6 remains a supported
historical source. Hosted activation and actual upgrades need separate owner action.
Preserve original pins, pairing, owner, credentials, journals and checkpoint history.

The former ungated terminal Managed path and BYO apply without separate Master
clearance are superseded and refused. Do not use those commands or setup-tool
recovery flags. The primary guide includes exact-source assessment, approval,
customer apply and original-job recovery. New empty-project provisioning uses
[BYO_GUIDED_SETUP.md](BYO_GUIDED_SETUP.md).
