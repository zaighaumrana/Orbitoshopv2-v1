# M3 frontend ownership and branding

Local implementation on `feature/shop-modernization-m3`, based on Shop development
`2dffa1eaf0ddd63d0e8369ccf6f889e4d31e028d`. Platform design reference:
`864cdbc1c09184a72e33afe67aa4a4f516e78e68`. Publication, independent acceptance,
merge and deployment are separate owner gates.

## Rendering and dialogs

`ui-render.js` reconciles the existing Admin/POS/Workshop templates inside stable
shell, content and feature-modal boundaries. Navigation/authority changes replace
the appropriate boundary; ordinary updates retain nodes. The existing M1 view and
command guards remain authoritative. Cart and receipt rows have stable keys.
Quick Item's DOM-only variant list explicitly retains its children for that dialog
instance. A different dialog object never inherits its draft or scroll position.

`ui-dialog.js` coordinates feature dialogs and authenticated body confirmations:
accessible names (including loading-to-detail transitions), entry/return focus,
Tab containment, inert background, topmost keyboard ownership and visual-viewport
height. Specialized confirmation/PIN policies stay in their existing handlers.
Busy work blocks dismissal. Dirty business forms require a second explicit
Close/Cancel; Escape/backdrop cannot discard them. Ephemeral print choices are not
business drafts. Login dialogs keep their established independent behavior.

`ui-lifecycle.js` counts overlapping modal promises, so a short unrelated event
cannot clear an earlier operation's busy state. It does not approve commands or
replace financial locks. Family/receipt model caches validate relevant row/data
revisions, including in-place identity, value and parent-link changes. Existing
bounded queries, capability gates, request ordering and full-detail reads remain.

## Product and merchant identity

`public/brand/retrasell-shop.css` uses the approved Platform tokens under `.rs-shop`
and `.rs-tracker`. Official assets are original reference bytes, including local
Inter 400/500/600/700 and its OFL license. The font alias **RetraSell Inter** prevents
the protected login's existing `Inter` fallback from changing. No root token/font,
login artwork, animation or shared base stylesheet was redesigned.

`applyBranding()` retains legacy root values for login, fixes product metadata and
derives separate merchant accents. `merchant-accent.js` accepts strict hex, safely
composites alpha and derives readable accents per theme; saved settings stay raw.
Product actions, focus and semantic colors remain fixed. Merchant name/logo stay
within the compact header and business documents. The standalone tracker retains
its configured project and exact public lookup contract. The service worker is
unchanged and online-only; no financial offline cache or app-ID change was added.

## Printing

`print/presentation.js` supplies default-off, per-action attribution. The six actual
builders accept a final `{attribution:true}` presentation option; existing arguments
and default strings are unchanged. Actual POS/Admin/EMS callers capture the selected
document's choice before asynchronous work, share one snapshot across delegates and
reset it for the next attempt. No preference, payload field or `terms_text` encoding
is persisted. The core printer also accepts `{attribution:true}` and avoids an exact
duplicate `Powered by RetraSell` line. Salary slips use the same presentation helper.

The line is rendered before height measurement and existing copies multiplication.
Financial amounts, barcodes, reprint markers, queue order and thermal versions are
unchanged. The measured blocked-CDN weakness justified copying the exact existing
JsBarcode **3.11.6**, not upgrading it:

- Original source: https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js
- Upstream/license: https://github.com/lindell/JsBarcode/tree/v3.11.6
- Local file: `public/vendor/JsBarcode-3.11.6.all.min.js` (60,817 bytes)
- SHA-256: `52e032534c3f98976ad95cb8c20baf80ed0cc83d42590602a8cf1db16e2e22ed`
- MIT notice: `public/vendor/JsBarcode-LICENSE.txt`

Only the script URL changes. Existing 5-second bounded waits, fonts/images, CODE128
options, measurement and print-intent ownership remain. A failed local dependency
still reports unavailable measurement truthfully. Browser intent is not a physical
80mm print, cut or barcode-scanning result.

## Focused verification and handoff

`tests/m3-ui-models.test.mjs` and `m3-assets.test.mjs` cover changed model/print and
asset contracts. `m3-browser.mjs` reuses the existing actual-entry synthetic SDK;
`m3-print-browser.mjs` runs the actual thermal renderer with a synthetic intent sink.
Both require the documented Playwright/Chrome/evidence environment variables; no
hosted calls are permitted. `--source-baseline` serves original tracked sources
read-only from Git. `--zoom-only` uses an isolated Chrome profile with actual 200%
page zoom (CSS viewport and DPR checked), not a screenshot scale factor.

Permanent results, exact commands, source hashes, failures/corrections and owner
follow-ups are in the existing `Shop-Modernization-2026/Milestone-3-Branding` archive.
Independent audit and owner acceptance remain unperformed. Real mobile keyboard,
physical printer and installed OS-icon/cache observations require owner evidence.
F22's accepted bounded deferral remains; F18 has an implemented evidence-led fix,
not a self-approved deferral. No backend, Platform source, release or hosted change.
