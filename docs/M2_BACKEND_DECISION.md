# M2 conditional read-contract decision

26 October 2026. **PROPOSED; NOT AUTHORIZED; NOT IMPLEMENTED.** This is an
approval-ready scope description, not a migration or permission to change Platform.

`node --test tests/read-contract-gaps.test.mjs` executes the inherited pure family
and receipt helpers against independent complete fixtures. It reproduces an old
root omitted by a capped member query; 1,001 matching members representing one
family; a repair-linked sale incorrectly included when the repair lies off-page;
and exact child-invoice search losing cross-date family members. A passing gap
test proves the defect exists, never that F05 is closed.

## Alternatives assessed

| Approach | What it can establish | Remaining problem |
|---|---|---|
| Existing projected table pages and exact head counts | Flat stock/directory/catalog/attendance pages and root/status counts | Does not union sales/tickets or count distinct families matching any member |
| Fetch matching members, then roots/children | Complete selected family using bounded selected-ID queries | Matching-member pages are not distinct root pages; one large family can occupy many pages; exact matching-family count/order requires scanning all matches |
| Embedded PostgREST self-relationships | Some per-field child-match filters can be pushed into SQL | Must prove canonical concatenated free-text match, stable distinct root ordering and complete children; does not solve cross-table receipt union/dedup |
| Scan all matching history in client | Can reproduce complete helper on a stationary full dataset | Unbounded entry/search transfer and inconsistent cross-request snapshots; violates finite archive/startup contract at 100k rows |
| Independently page two receipt sources and merge | A recent preview | Cannot claim canonical complete union, dedup or cross-date family expansion without proving off-page absence |
| Narrow SQL reads | One statement can select distinct matching roots/unified receipts and counts under the canonical actor | Requires explicit owner approval, forward SQL, ACL proof and final Managed/BYO release integration |

## Exact proposed scope for owner review

1. A read-only repair-family page/search contract (proposed name
   `get_repair_family_page`): bounded distinct root IDs with a deterministic
   root-created-at/id cursor; any-member canonical search, optional active queue
   status; explicit matching-root/status counts; complete required operational
   children for each returned root or an explicit incomplete/oversize result.
   Preserve child invoice identity and active-root child lifecycle semantics.
2. A read-only unified receipt archive contract (proposed name
   `get_receipt_archive_page`): bounded canonical retail/repair union, exclude
   repair-linked duplicate sales even when the repair is outside the page;
   existing date/type/free-text and exact invoice family expansion semantics;
   deterministic timestamp/type/id cursor and exact matching count. Full selected
   reprint payload remains separately authorized. No client header sums as money.
3. Only a separately demonstrated missing operational aggregate may be added to
   that scope. Existing canonical financial reports, exact table head counts and
   complete selected-period reads remain preferred. No batch Workshop monetary API,
   new write RPC, time policy, speculative index, cache, Storage or Edge service.

Reuse the **current** canonical actor/lifecycle/module/Support-consent checks from
the final migration chain, not an obsolete definition in an earlier migration.
Use invoker/RLS when adequate; any definer choice requires an explicit security
reason, fixed empty search_path, fully qualified names and least-privilege grants.
Prove anonymous/denied role/suspended/revoked/wrong-binding negatives, exact actor
scope, stale current-request ownership and complete independent fixture equivalence.

Approval must include the required Platform **release integration only**: paired
runtime requirements/capabilities, immutable new Shop release, Managed and BYO
selectors/consumers and the mirrored parity workflow. Finish and commit all approved
backend bytes before generating the final fingerprint. Preserve support-v6, older
artifacts/customer pins and additive upgrade history; test both fresh paths and
supported upgrades. No Platform product UI or protected Platform database write.
No customer install, merge, deployment or rollout follows from approval.

Until this scope is approved and verified, M2-008/009 and their affected M2-010/012/
013 gates remain **BLOCKED**, F05 remains open, and M2 cannot be called complete.
The local frontend changes remain reviewable independently. M1 PR #2 must also be
integrated or receive a specific publication decision before the final M2 PR.
