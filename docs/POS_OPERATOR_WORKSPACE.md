# POS operator workspace candidate — current 30 October 2026

Feature: Catalog and Inventory occupy adjacent desktop panels; the independently paged open/undelivered repair queue expands below them. Cart stays right. At <=1100px product panels stack beside Cart; <=760px Cart follows the product/repair workspace. No horizontal overflow was observed at 320, 390, 768, 1024, 1280 or 1440px in loopback Chrome.

Existing bounded read controllers, authority captures, selected-ticket family reads, stable cart keys and financial commands remain authoritative. Queue root statuses are Pending/In Progress/Ready, independent of balance; Delivered/Declined/Cancelled and child invoices never enter it. Queue rows contain no partial-family balance. Selection loads the complete family before using existing collection/summary guards. Collapsing or reloading invalidates its generation; no collapsed queue history fetch occurs. Effective inventory_module_enabled governs width; errors and filtered-empty pages never disable Inventory.

## Presentation data and authorization

Migration 20261029173151 adds nullable icon_id to quick_items, repair_components and inventory, plus Shop-local device_brands. Repair tickets retain their existing device_brand text and every historical financial row. Brand UUID, display_name, NFKC/whitespace/case-normalized unique name, nullable icon, enabled flag, sort order and creation time are independent of assets. Browser deletion is unavailable; use inactivation. Defaults insert without replacing custom names. Existing Shop project isolation is the ownership boundary, with no Platform brand store.

Brand reads use current Client access, current canonical roles, Repair entitlement and restrictive Support consent. Owner/Manager and currently consented Orbito Support manage; Cashier/Technician read. Existing table authorization protects nullable item columns. No new definer function is introduced. Existing guarded get_app_config advertises catalog_icons=1; the existing service-only shop_backend_capabilities probe adds structural evidence. Its existing definer privileges/grants are preserved for guarded configuration/private structural introspection. Lock waiting is bounded to 5s and this migration to 60s. A partial index matches the new root/open queue; no old migration changes.

## Asset boundary and compatibility

src/catalog/registry-v1.json is the exact supplied proposal, schema 1 / version 1.0.0, 36 IDs. The contract and V1.0.1 artwork are owner-approved and all 36 verified local renderers are integrated. The registry retains its historical proposal fields unchanged; the production manifest records current availability. Category defaults terminate at generic.item; visited IDs stop corrupt cycles. A neutral placeholder is only the terminal missing-renderer recovery. No artwork intake gate remains; owner application acceptance and independent delta review remain separate.

Old backend bootstraps omit catalog_icons: existing bounded projections omit new columns, management offers upgrade guidance, and repair intake uses known proposal choices plus manual text. A failed brand read permits manual entry with an explicit unavailable message; it never creates records or masquerades as an empty configured list. Active configured brands and exact approved aliases form native searchable datalist choices. Arbitrary typed text round-trips unchanged, with generic display fallback. Inactive records remain readable for historical labels. Unknown stored icon assignments remain on unrelated edits.

## Candidate and validation commands

Use the existing release checker with --candidate support-v8 only after the candidate is registered. Active support-v7 and all historical packages/pins remain unchanged. Ordinary customer preflight intentionally blocks this unapproved backend source; do not edit fingerprints, bypass preflight or install from this feature branch. See POS_CANDIDATE_UPGRADE_GUIDE.md for owner gates and the existing guided procedures.

Focused checks: node --test tests/pos-icons.test.mjs tests/repair-draft-numeric.test.mjs tests/retail-checkout-submit.test.mjs. Set POS_EVIDENCE_DIR, PLAYWRIGHT_MODULE_PATH and CHROMIUM_EXECUTABLE_PATH for node tests/pos-operator-browser.mjs. Set POS_EVIDENCE_DIR and PG_BIN for node tests/pos-catalog-sql.mjs (new loopback PostgreSQL instance; no hosted target). The SQL harness uses the actual Managed and BYO migration envelopes, synthetic Auth primitives and preserved v7 package. This is author local evidence, not hosted or independent acceptance.


## 30 October 2026 — final V1.0.1 artwork integration

This supersedes earlier pending-artwork/registry-approval statements. The owner supplied the final approved pack and explicit integration instruction. All 36 IDs/paths/aliases/fallbacks and original registry bytes are unchanged. ZIP SHA-256 2403004077552928860d5f3a5880b69746c38f56c626f90fc42ce369792f6239; production manifest SHA-256 5a5636c30fd69b5579addbf73227aa3497c5456f110f60a0d0f6623aa63b75ce; original registry SHA-256 0924786e5b9c6eaedbd86a5cb33425bf4023b34b66675cf1419516a43a3e37c5. All 45 ZIP entries passed CRC/path/inventory checks; all 36 source/ZIP/local SVGs match both hash manifests, totaling 13,752 bytes. Strict XML allow-list rejects executable/external/style/font content. Full brand-name path revision 1.0.1 is included. Source Codex 1 directory remains read-only and untouched.

The application uses a source-generated frozen literal map of only these verified local SVG geometries. Database IDs select known entries; no runtime SVG parser, path construction, remote fetch, new runtime dependency or raw database SVG injection. Inline wrappers inherit currentColor, are aria-hidden/nonfocusable, and retain adjacent names. Category fallbacks and terminal neutral placeholder remain tested with empty/missing renderer maps. Approved raw assets and production manifest are preserved byte-for-byte under explicit Git attributes.

Focused intake/resolver/hash tests, actual Shop 36-icon 24/32px light/dark wrappers (144 instances), Catalog/Cart/queue visuals and the post-artwork normal build pass. Evidence: tests/svg-intake.json, svg-resolution.log, svg-visual-results.json, svg-all36-light.png, svg-all36-dark.png, pos-svg-light.png, pos-svg-dark.png, shop-build-svg.log. Backend source/release candidate unchanged. Remaining milestone gates are independent review, owner visual/functional acceptance, separately authorized release promotion/merge/deployment and hosted four-case verification (including the separate BYO account); physical printer/device evidence retains prior bounded deferral. No final-artwork intake remains outstanding.


## 30 October 2026 — independent audit correction boundary

POS-AUD-01: src/catalog/prices.js safely decodes actual finite nonnegative numeric prices from legacy numbers or variant objects. Missing/null/non-array/invalid values are unavailable, never coerced to zero. An explicitly stored numeric zero remains valid. POS preview and activation share this boundary; Admin displays unavailable entries without changing their original removal indices. Customer data is not rewritten.

POS-AUD-02: quickAccepted records the accepted query/revision. Input immediately clears it and marks the resource loading; rendering, activation and paging require current readiness plus exact query/revision. One cancellable debounce timer coalesces input. Existing captured view/session/load ownership rejects late responses; entry-load completion cannot overwrite a newer search. Cart rendering/removal remains independent, focus/caret/composition nodes retain the existing reconciler. Inventory uses its pre-existing separate selector controller; this correction does not refactor its behavior.

POS-AUD-03: Quick Item activation now uses the accepted Catalog record instead of data-attribute price JSON. The picker captures item ID, name, normalized prices, assigned icon_id and current view. A checked selection retains the same trusted icon identity and existing Cart key/quantity/variant/price fields through normal renders, without rereading Catalog or changing financial calculations. No icon-resolver/artwork change.

Targeted reproduction: tests/pos-audit-corrections-browser.mjs (POS_EVIDENCE_DIR, PLAYWRIGHT_MODULE_PATH and CHROMIUM_EXECUTABLE_PATH). It reuses the existing actual-entry synthetic SDK helpers, holds Catalog responses and exercises the three regressions plus one combined journey, older responses/failure/clear/debounce, view/session departure, entry-load race and modal Cart rerender. tests/pos-prices.test.mjs covers malformed containers and no coercion. These are author local corrections, pending independent delta re-review; initial independent NOT READY verdict is preserved. No push or hosted operation is authorized.


## 30 October 2026 — source approval scope

Owner-authorized support-v8 source promotion supersedes the candidate-only release gate above. Exact package remains af64c402ff72fb4ef4d72b892786c53a000d45ecb4045c4f9a7e89db51cf5dd4 (40/7/10), with no Shop source or SVG change. Platform-only approval migration 20261030141736 and three Platform metadata-consuming bundles await separate hosted activation. See [the four-workflow approval handoff](POS_CANDIDATE_UPGRADE_GUIDE.md). Independent delta review and original NOT READY audit remain; no hosted acceptance, frontend build trigger, customer upgrade or merge occurs in this source task.
