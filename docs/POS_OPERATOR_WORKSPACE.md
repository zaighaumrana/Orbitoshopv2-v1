# POS operator workspace candidate — 29 October 2026

Feature: Catalog and Inventory occupy adjacent desktop panels; the independently paged open/undelivered repair queue expands below them. Cart stays right. At <=1100px product panels stack beside Cart; <=760px Cart follows the product/repair workspace. No horizontal overflow was observed at 320, 390, 768, 1024, 1280 or 1440px in loopback Chrome.

Existing bounded read controllers, authority captures, selected-ticket family reads, stable cart keys and financial commands remain authoritative. Queue root statuses are Pending/In Progress/Ready, independent of balance; Delivered/Declined/Cancelled and child invoices never enter it. Queue rows contain no partial-family balance. Selection loads the complete family before using existing collection/summary guards. Collapsing or reloading invalidates its generation; no collapsed queue history fetch occurs. Effective inventory_module_enabled governs width; errors and filtered-empty pages never disable Inventory.

## Presentation data and authorization

Migration 20261029173151 adds nullable icon_id to quick_items, repair_components and inventory, plus Shop-local device_brands. Repair tickets retain their existing device_brand text and every historical financial row. Brand UUID, display_name, NFKC/whitespace/case-normalized unique name, nullable icon, enabled flag, sort order and creation time are independent of assets. Browser deletion is unavailable; use inactivation. Defaults insert without replacing custom names. Existing Shop project isolation is the ownership boundary, with no Platform brand store.

Brand reads use current Client access, current canonical roles, Repair entitlement and restrictive Support consent. Owner/Manager and currently consented Orbito Support manage; Cashier/Technician read. Existing table authorization protects nullable item columns. No new definer function is introduced. Existing guarded get_app_config advertises catalog_icons=1; the existing service-only shop_backend_capabilities probe adds structural evidence. Its existing definer privileges/grants are preserved for guarded configuration/private structural introspection. Lock waiting is bounded to 5s and this migration to 60s. A partial index matches the new root/open queue; no old migration changes.

## Asset boundary and compatibility

src/catalog/registry-v1.json is the exact supplied proposal, schema 1 / version 1.0.0, 36 IDs. Owner approval and final registry digest are pending. The trusted artwork map is intentionally empty; metadata never imports missing files or constructs a URL. Category defaults terminate at generic.item; visited IDs stop corrupt cycles. Placeholders keep checkout and tickets usable. Selectors label artwork pending. Final SVGs must be supplied/approved separately and verified before adding literal build-time imports.

Old backend bootstraps omit catalog_icons: existing bounded projections omit new columns, management offers upgrade guidance, and repair intake uses known proposal choices plus manual text. A failed brand read permits manual entry with an explicit unavailable message; it never creates records or masquerades as an empty configured list. Active configured brands and exact approved aliases form native searchable datalist choices. Arbitrary typed text round-trips unchanged, with generic display fallback. Inactive records remain readable for historical labels. Unknown stored icon assignments remain on unrelated edits.

## Candidate and validation commands

Use the existing release checker with --candidate support-v8 only after the candidate is registered. Active support-v7 and all historical packages/pins remain unchanged. Ordinary customer preflight intentionally blocks this unapproved backend source; do not edit fingerprints, bypass preflight or install from this feature branch. See POS_CANDIDATE_UPGRADE_GUIDE.md for owner gates and the existing guided procedures.

Focused checks: node --test tests/pos-icons.test.mjs tests/repair-draft-numeric.test.mjs tests/retail-checkout-submit.test.mjs. Set POS_EVIDENCE_DIR, PLAYWRIGHT_MODULE_PATH and CHROMIUM_EXECUTABLE_PATH for node tests/pos-operator-browser.mjs. Set POS_EVIDENCE_DIR and PG_BIN for node tests/pos-catalog-sql.mjs (new loopback PostgreSQL instance; no hosted target). The SQL harness uses the actual Managed and BYO migration envelopes, synthetic Auth primitives and preserved v7 package. This is author local evidence, not hosted or independent acceptance.
