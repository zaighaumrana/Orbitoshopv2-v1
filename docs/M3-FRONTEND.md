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
Close/Cancel; Escape/backdrop cannot discard them. Login dialogs keep their
established independent behavior.

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

Owner correction M3-OA-01 (29 October 2026) supersedes D05's original optional,
default-off attribution decision. The historical decision/rationale remains in the
program decision archive. `print/presentation.js` now automatically supplies one
restrained footer with the unchanged official local horizontal logo and `Powered by
RetraSell`. There are no attribution checkboxes, event choices, prompts or persisted
preferences. Support consent, financial approval and PIN confirmation are unrelated
and remain intact.

All six actual builders, POS receipt/ticket previews and the shift document share
this mechanism. The print queue also enforces it for direct callers. A marker makes
repeated builder/preview/queue presentation idempotent. An exact old plain footer
line is moved into the final branded footer once; other merchant terms and every
transaction field remain unchanged. The local SVG loads from the Shop's own static
assets and is decoded with existing image readiness before measuring the document.

The logo and line are rendered before height measurement and existing copies multiplication.
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

## 29 October owner visual corrections

The New Repair form and ready Admin ticket detail use one responsive wide workspace
class. The information/issue panels share the top row on desktop. Per owner steering,
New Repair has a full-width finance tile at the bottom: labour/quote on the left,
payments in the center, balance on the right. The same fields, constraints, draft
calculations and actions are retained. Admin detail groups repair/history separately
from finance/status/operations. Body content can scroll while existing completion
actions remain visible. Narrow screens stack the sections.

The merchant tile uses containment, generous padding and a quiet white image bed
without the former accent border. Support's existing single bounded width rule now
centers the complete region; submission, history, guidance and owner approvals remain
inside that wrapper. No Support behavior or permission changed. These corrections
remain local until separately authorized for publication, because the M3 branch now
feeds production. The approved empty build-trigger commit is an expected ancestor.
