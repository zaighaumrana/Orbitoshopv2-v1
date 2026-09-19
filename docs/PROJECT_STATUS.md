# OrbitoShop integrated client status

## Current baseline

`development` is the current integrated OrbitoShop client baseline. The following status is based on the project owner's confirmation, not a new deployment inspection or regression run performed during this documentation update.

| Phase | Current status |
| --- | --- |
| Phase 1 — login / Turnstile / support entry | Completed and merged |
| Phase 2 — authentication / RLS | Completed and merged |
| Phase 3 — transactions / repair-family stabilization | Completed and merged |
| Phase 4 — client security / Platform bridge / billing / paper service | Client-side work completed, merged, migrated, deployed and live-smoke tested |

The latest migrations have been applied to Supabase. Required Edge Functions have been deployed. The latest frontend has been pushed and deployed through Cloudflare. Phase 4 live smoke testing passed.

The two post-deployment fixes are also committed, pushed and deployed:

- Numeric-input document keydown handling now ignores missing/non-string keys before reading their length.
- Retail checkout now guards duplicate submission through the RPC and post-success reload, preserving request-ID retries and preventing an empty-cart follow-up RPC.

## Next work and boundaries

- **Next client task:** final repo-wide regression/cleanup. It has not been performed by this documentation update.
- **Separate future work:** Orbito Platform modernization, including its authenticated ingest, billing projections, resupply lifecycle publication and agreed legacy-to-bridge billing cutover. Client deployment does not establish that these Platform counterparts or scheduling are implemented or enabled.
- Historical test counts, migration snapshots and audit findings remain historical evidence. Overall live-smoke approval must not be expanded into unrecorded per-case, hardware-printer, multi-tab or Platform end-to-end results.
- Existing explicitly documented residual risks are not silently closed by the merge/deployment status.

Phase reports retain their implementation history. Current status in this document supersedes old branch-hold and deployment-pending checkpoint wording.
