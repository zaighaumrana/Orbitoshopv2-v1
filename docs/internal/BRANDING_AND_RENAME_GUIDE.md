# Product branding and future rename (internal only)

Edit **`src/config/brand.js`** for public product branding. It is a pure module with no dependencies, tenant state, credentials or legal publication logic.

| Field | Current value | Meaning |
| --- | --- | --- |
| PRODUCT_NAME | RetraSell POS | Full public product name |
| SHORT_BRAND_NAME | RetraSell | Short brand used in support/Platform copy |
| PROJECT_OWNER_NAME | ABCD Ventures | Project/parent attribution |
| PROJECT_ATTRIBUTION | A project of ABCD Ventures | Derived from project owner |
| LEGAL_ENTITY_NAME | null | Unresolved; not rendered or used to fill legal configuration |

Product and short names can be changed for a reviewed rename. Project owner must change only on an actual ownership/attribution decision. `A project of ABCD Ventures` is attribution, not evidence that ABCD Ventures is the contracting entity. Assigning a future legal entity requires a separate legal decision/review; changing this field alone does not configure or publish a legal package.

## Current consumers

- `src/auth.js`: product/attribution beneath the existing tenant login content; support button/title and suspended-Shop support copy. Merchant title/logo/address remain merchant-configured. GhostFibers, glass/colors, Turnstile, forgot-password and auth handlers are unchanged.
- `src/shared.js`: support-session explanatory text only. `currentTenant()` and merchant branding do not consume product constants.
- `src/admin/admin.js`: Platform attribution in Plan Features; canonical entitlement/role checks unchanged.
- `index.html`: `%PRODUCT_NAME%` title replaced by the small Vite hook in `vite.config.js` before HTML processing.
- `public/manifest.webmanifest`: metadata template. Its names are injected from brand config by Vite in development and production output; do not serve the source tree as a production build. Rebuild/restart Vite after a config rename. Existing installed apps may need a browser-managed metadata refresh.

The legal reader and user-guide templates also resolve public branding from this module. Legal metadata contains business/document fields, not a second product-name source. `legal.html` uses the same Vite title hook. Onboarding copy uses SHORT_BRAND_NAME without changing its activation or six-step behavior. Changing branding does not publish a legal policy or configure the unresolved contracting entity.

## Intentional exceptions and non-brand identifiers

- Tenant Shop names/logos in navigation, business headers, receipts, repair tickets, salary slips and tracking remain independent. Existing legacy `RetailOS`/`RetailOS Shop` merchant fallbacks in `src/auth.js`, `src/shared.js`, `src/features/ems/index.js`, `src/features/admin/ems/index.js` and `public/track.html` are left alone in this pass; they are not made aliases of PRODUCT_NAME. Review fallback copy separately if required, never overwrite a stored merchant name during a product rename.
- `orbitoshop.ahwad.com/track` printed by `src/print/print.js` is an operational tracking address, not a cosmetic label. Changing it requires a separate URL/deployment decision; receipt semantics are untouched here.
- The canonical `Orbito Support` database role and support Auth display name/email remain unchanged. Their raw role labels may remain visible in account headers. Do not rename authorization values as branding; use a separately reviewed display-only label if needed later.
- Keep package/repo names, SQL schemas/tables/functions, migration names, Edge names, API contracts, environment variables, source IDs, client bindings, Git branches, storage keys, service-worker/cache IDs, CSS selectors (`orbito-login`) and technical symbols unchanged.
- Icons/logos are assets, not text; this task preserves their presentation. Review replacement artwork separately if a future brand requires it.
- Historical/internal docs are not customer branding surfaces. This guide is never linked in customer navigation.

## Safe rename procedure

1. Edit the public name fields in `src/config/brand.js`; do not conflate project owner, legal entity or merchant identity.
2. Search old public names (also historical `RetailOS`) across frontend/static assets. Classify public copy versus technical identifiers and tenant data; do not mass-replace.
3. Run `node --test tests/branding.test.mjs tests/login-background.test.mjs tests/final-cleanup.test.mjs`, production build and diff check. Inspect generated `dist/index.html` and `dist/manifest.webmanifest`.
4. Smoke login, support-mode labels, navigation and install metadata. Inspect receipts/tickets to confirm merchant identity and the functional tracking URL are untouched.
5. Review any newly integrated legal reader as a separate contractual/publication concern, not an automatic string replacement.

A product rename does not change the contracting entity, privacy-controller identity, merchant Shop identity, Platform/Shop credentials, database identifiers, entitlement semantics or billing/usage rules.
