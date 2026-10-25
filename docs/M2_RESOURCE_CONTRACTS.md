# M2 resource and measurement contracts

26 October 2026. Local M2 is authorized atop unmerged M1 tip
`4186b5181a39679b6c26637db295174346b25e4f` (empty refresh, application tree
identical to `1ca15ba3364c7fb9dd0946e89acf24da5e4f21a4`). Publication waits
for M1 integration/owner decision. Independent review and owner acceptance pending.

Every read is owned by M1 authority/native-session and exact navigation plus its
resource query/page/selection generation. Server RLS/RPC authorization remains
live. No completed permission cache. Search resets page and invalidates pending
results immediately; only remote typing is debounced. Commands retain existing
UUIDs, immutable payloads, PIN and uncertain-outcome recovery. Mutations refresh
affected current data after authoritative acknowledgement, never replay commands.

| Screen | Entry | Deferred | Truth/detail and invalidation |
|---|---|---|---|
| POS | Verified config, bounded stock/quick selectors, repair intake choices | Collection/history, returns, Udhar, shift | Selected full row/family and canonical payment/return RPC; stock selectors after checkout, selected family after repair/payment |
| Dashboard | Canonical global/day financial report, eight recent sale headers, exact operational counts | Debt detail and selected sale | Financial RPC independent of preview; counts from exact head queries or explicit unavailable; refresh affected summary |
| Reports | Canonical global report, fifteen recent summaries | Full selected invoice and debt detail | Original report scope; no preview arithmetic; refresh current report after mutation |
| Workshop | Active root page and all required operational children | Components editor; monetary expansion only | Existing selected canonical summary, no Technician money; selected-family and queue refresh |
| Admin repairs | Complete family-aware page/search | Editor/components/canonical monetary summary | Match any member including old root; partial family unavailable; count independent of page |
| Inventory | Projected selected search/page, deterministic name/id ordering | Exact editor/stock detail | Canonical stock RPC; low-stock page alerts explicitly scoped; current page refreshed after mutation |
| Catalog | Active entitled quick-item or components tab/page | Other tab/editor | Full selected variants; active resource refreshed after catalog writes |
| Receipts | Unified bounded archive with historical search/date/type/dedup semantics | Exact reprint payload | Complete legacy helper oracle; independent truncated arrays are insufficient; backend decision required if existing queries cannot satisfy |
| Employees | Projected searchable name/id page | Exact profile/account-admin actions | Current UUID/role server authority; refresh directory after account mutation |
| EMS | Active tab and separately verified live indicator | Other tabs | Complete selected payroll period independent of attendance/directory pages; preserve existing day/pay policy; refresh active tab/live after writes |
| Settings | Verified config and active tab | Owner Legal only on Legal tab | Existing account-admin allowlist; fresh config after save invalidates in-flight equivalence |
| Billing/Usage | Versioned billing projection | Explicit Paper/history reads | Original request identity/revision/readback; existing controller retained |
| Help/Support | Existing bounded list/recovery and owner consent | Selected detail | Live actor/session/consent/project binding checks retained unless equivalence proved; original UUID recovery unchanged |
| Tracking | Exact build-target public config | Explicit ticket/phone lookup | Narrow public endpoint only; public/auth config scopes never shared |

Unavailable required data blocks only its dependent operation. No failed read is
displayed as an empty complete list or zero. A list page count, exact matching
count and canonical global financial value are distinct. Selected detail is read
completely before action/printing. Historical timestamps and unmatched legacy
display names are never reinterpreted into canonical actors.

## Frozen comparison substrate

`tests/performance-browser.mjs` runs actual index/main/router/module rendering in
Chrome with synthetic native Auth and an HTTP loopback data service. All external
traffic is blocked. Auth fixture calls are counted separately; HTTP RPC/table/
function requests and UTF-8 response bytes plus Resource Timing transfer/encoded/
decoded bytes are retained. No real DB CPU/query-plan or hosted latency claim.

Medium fixture: 10,000 history rows, 1,000 products, ten active roots, 25 employees,
25 quick items, five intake components; simulated API cap 1,000 (not a claim about
hosted settings). Browser CPU throttle 4, response delay 80ms; POS/Workshop also
300ms slow profile. Twenty cold and warm samples per selected scenario, one
unreported warmup, nearest-rank p50/p95, ranges, exact source/fixture/harness hashes
and environment in JSON. Cold means fresh browser context with warmed Vite
transform cache; warm means same-page route re-entry after Settings. Build mode is
Vite development for both. Synthetic transport is not an SDK/RLS integration test.

Useful marker requires current route handler completion, real application shell,
ready required resources, actual POS input or current EMS tab. The injected marker
is test-only; no application instrumentation changes. Baseline is captured before
application performance edits. Candidate comparisons require identical fixture,
harness, browser/profile and marker. Baseline harness development failures and early
invalid markers are retained and excluded from comparisons explicitly.

Hard budgets: zero Workshop startup monetary RPCs; zero unrelated POS sales,
returns, Udhar or shift entrance reads; finite pages with stable unique ordering;
complete selected detail; global financial values independent of page. Investigate
any critical p95 regression above 5%; do not conceal missing completeness/audit
evidence behind timing improvements. Track B source changes require exact owner
approval before implementation and both-mode final release integration afterward.
