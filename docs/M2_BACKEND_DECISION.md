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

## 26 October 2026 — expanded owner authorization and local implementation

The later owner instruction authorizes Shop SQL development and Docker validation.
The initial NOT AUTHORIZED / NOT IMPLEMENTED statement above is historical. The
Platform boundary remains unchanged: explicit approval is required before any
Platform source, branch, commit, selector, manifest or database change. The owner
also requires repository-delivered migrations instead of direct hosted SQL.

Implemented locally: `20261025233743_m2_bounded_operational_reads.sql`, two invoker
read RPCs, an additive authenticated config availability field, a structural
capability and the existing both-mode requirement manifest. No Edge function,
business write command, financial summary, table grant or historical artifact is
changed. Stable bounded offsets use created-at/id order; they make no claim of a
cross-request snapshot while other operators mutate history. Exact invoice search
returns family identity; the existing complete selected-family helper preserves
the established JavaScript natural sort and cross-date semantics. Selected family
reads fail closed above the explicit verified detail bound.

Both real SQL envelopes pass fresh v6-plus-forward and populated v4-to-v6-plus-
forward fixtures. Initial read-contract oracle checks cover 1,001 children, global
distinct roots, cancelled children, off-page duplicate sales and exact child/date
behavior. Replays are inert; conflicting source is denied; an intentional failure
rolls back its business insert and ledger entry. Final capability-source checks
are recorded separately. These fixtures use synthetic Auth and are not hosted
provider or JWT acceptance evidence.

At 12,003 tickets / 11,003 sales, the exploratory warm SQL measurement reports a
complete-table alternative at 16,176,578 decoded JSON bytes and 1,631.229ms median
(three samples), versus a 25-row receipt page at 9,455 bytes and 828.190ms. The
inherited capped alternative is incomplete and is not an equivalent correctness
baseline. No index is added without plan evidence. SQL scans for exact counts and
arbitrary substring search still scale with eligible history; bounded network
transfer does not imply constant database cost.

New frontend calls require `get_app_config().read_contracts` version1. Missing,
public, failed or replacement-session config clears availability. Older shops do
not call the new RPCs. Their complete legacy path remains when verifiable; large
capped histories explicitly report unavailable rather than presenting partial
results as complete. Backend packaging/parity and M2 completion remain BLOCKED
pending the focused Platform integration decision and final exact-source gates.

## 26 October 2026 — final local candidate and older-backend continuity

The owner subsequently approved local-only Platform release integration, including
its feature branch, source changes, commits and focused tests. Platform commit is
cedde3838e039b2ec9aebc163153e01253ede1ca. No remote Platform operation, PR, merge,
deployment or hosted database change is authorized or performed. V7 remains
candidate-local, unsupported and unapproved; actual Managed/BYO selectors stay v6.

Final backend source is50b94931ecf743166136b2c562cbb6d2fbaebdc7. Migration SHA256 is
ab1f175ab24b4590fa7523ec906aa018c625b628c51f4dcc6a579a4dcb8d2c00; final fingerprint
c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada. An independent
undated/pre-epoch receipt oracle found a dateTo-only mismatch in the earlier
uncommitted candidate; the failed source and old draft are preserved. Corrected
SQL passed all four fresh/populated Managed/BYO fixtures before regeneration.

Older large backends now retain bounded exact ticket/invoice lookup with complete
selected family/receipt detail, without the new RPCs. Small complete histories
retain free-text legacy search. Controls state their actual page/lookup scope;
there is no forced upgrade or false complete global search on a capped history.

Final local candidate parity passes with39 migrations,7 unchanged functions and
9 requirements. Targeted parity/health/pin/assessment15/15 and actual upgrade
planner/executor/denial3/3 pass. Eight historical package/selector files, old catalog
rows and actual BYO manifest are unchanged. The ordinary active gate and the old
CLI-success fixture remain blocked by real unpromoted-source checks; they are not
weakened or counted as passes. Both paired workflows retain the ordinary gate.

See the permanent M2 archive's20261026T180000Z-M2-012-cedde38-local-review for exact
patches, source ZIPs, hashes and detailed review report. Full provider staging,
release promotion, independent audit and owner acceptance remain separate gates.
