# Customer diagnostics and durable Support — 2026-10-23

Shop backend requirements are in scripts/backend-requirements.json and embedded in
the new immutable package. Both installers consume the same approved installation
plans; Platform's mandatory committed-source gate is `npm run release:check` in either
checkout (default sibling layout). Both CI workflows run this small gate. Shared
source after fingerprinting requires another immutable version. V4 and old journals
are preserved. The equivalent full mandatory parity policy was appended to AGENTS.md.

## Read-only customer diagnostics

Use the reviewed checkout and Node24. Authenticate only through the customer's own
native Supabase CLI. No Platform form accepts service-role keys, PATs or passwords.

```powershell
node scripts/setup-byo.mjs --login
node scripts/inspect-backend.mjs --project-ref EXACT_SHOP_REF --client-id CLIENT_ID --cli C:/Path/supabase.exe
# Optional new report outside both repositories; existing reports are never overwritten:
node scripts/inspect-backend.mjs --project-ref EXACT_SHOP_REF --client-id CLIENT_ID --cli C:/Path/supabase.exe --report C:/Private/RetraSell/backend-observation.json
```

The tool checks project visibility and paired client/source, uses only fixed read
queries and function inventory, and prints no secrets or SQL definitions. It never
installs, deploys, rotates, suspends, repins or resets. Reports distinguish catalog
history/migration proof from actual capability/source verification. Function presence,
provider revision or bundle digest alone does not prove approved source. Current
SQL routine/policy definitions are not fully source-compared. Full-release compliance
therefore stays Unable to verify when evidence is partial; optional successor data
and runtime health are separate. Reports are customer-local evidence, not silently
trusted Platform attestations. No live BYO inspection was performed by Codex.

An active Business Owner can also use owner_backend_capabilities() for restricted
nonsecret structural evidence. Normal employees cannot call it. The existing paired
Bridge call credential authorizes a challenge-bound backend-capabilities operation
for Platform diagnostics. It returns fixed identity/capability/runtime fields, no
customer records, Auth users, SQL definitions or credentials. Old Shops without it
remain supported; lack of a probe is not permission to suspend them.

## Support acceptance and recovery

New Shop migration 20261023012311_durable_support_and_backend_capabilities.sql adds
private RLS-protected support_submissions and delivery events. The sender validates
live Auth/actor, persists sealed subject/category/message under the original UUID,
then dispatches. Platform's existing source + request UUID uniqueness and actor/body
conflict checks prevent duplicate tickets. Receiver commit and its receipt are
separate from Shop queue persistence. Only the server can acknowledge a queue row.

Pending requests survive tab closure, refresh and a new authorized session of the
same user. The Support page restores the oldest of at most20 own pending records.
It labels saved/pending or review rather than claiming a Platform ticket. Retry
reuses that row and current user JWT; JWTs/secrets are never stored in the journal.
No background process impersonates an expired/revoked user. The original actor must
return and retry; absence of a browser/storage does not delete the saved submission.
Until the Shop database commits acceptance, delivery is not guaranteed.

A dispatch has a 90s lease, capped exponential backoff and eight-attempt review.
Failed/lost ACK preserves the original request. Late workers cannot acknowledge a
new lease. For rejected/exhausted attempts, the original authorized user can call
support_delivery_review(p_request, p_reason) with a nonsecret review reason (10–300
characters). It is audited, does not grant permission and does not acknowledge a
ticket; the next original-ID attempt is reauthorized by Shop and Platform. Do not
invent a different UUID after an uncertain result. Deleted/revoked users require
operator review; another user cannot send their queued content as their own.

Existing separate owner consent for privileged Support, ticket revisions, employee
privacy and receiver abuse limits remain. No ticket automatically grants privileged
access. BYO Open Shop as Support remains prohibited.

Usage/thermal/Paper delivery already has its own transactional immutable outbox,
leases and deduplicating receiver; billing snapshots retain increasing source-bound
revisions; config commands retain their original request/payload journal. These are
reused, not duplicated. POS, new Support acceptance and financial writes still need
the authoritative database online. This milestone does not make Shop offline-first.

## Rollout boundary

No customer upgrade, hosted mutation or production deployment occurred. Install the
new Shop SQL before the two changed function packages (platform-bridge JWT=false,
support-tickets JWT=true), then release the matching Support UI. The full approved
release still includes every required function/dependency; use its normal installer
for fresh installs. Do not rerun an entire existing Shop installation. Existing v4
remains immutable/supported; upgrade is optional and customer-authorized. Preserve
older release packages, owner/binding, original request/job pins and journals.

Platform companion documentation: docs/RELEASE_INVENTORY_CONTINUITY.md in orbito.
Full joint hosted/manual acceptance remains a separate testing session.

The new client opts into pending receipts using the existing CORS-allowed
`x-client-info: retrasell-support-journal-v1` header. A saved but unacknowledged
submission returns 202 only to opted-in clients; legacy clients receive 503 and
retain their original retry identity. A verified received ticket retains the
existing successful receipt shape. Final support-v6 contains this correction;
the uninstalled local v5 candidate remains immutable and superseded.
