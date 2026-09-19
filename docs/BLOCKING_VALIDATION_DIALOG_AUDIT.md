# Blocking validation dialog audit

Date: 2026-09-14

Current status: integrated into `development` and deployed with the completed
client phases. Phase 4 live smoke passed (project-owner confirmation). Historical
audit/test details below are unchanged; see [project status](PROJECT_STATUS.md).

## Result

Converted 94 explicit blocking toast call sites across seven frontend modules, plus the shared dialog action exception handler. No global toast interception: success/information toasts remain available, and transient numeric-input feedback and existing inline PIN/login validation remain unchanged.

The initial repair advance error now reads:

- Title: Payment Too High
- Message: The advance cannot be more than the repair total. Enter a smaller amount.
- Button: OK

The cause was presentation routing: the unchanged repair API rejects an excessive advance, but the POS caller previously displayed its failure as a generic error toast. The new shared acknowledgement dialog uses the existing centered app-dialog layout. All failure branches below still stop at the same point; no monetary comparisons, permissions, RPC parameters, schema or backend rules were changed.

## Audit policy

Converted errors that abort the current submission/action: invalid amounts, missing required input/reasons, split-total mismatch, payment/delivery/return/adjustment/cancellation failures, repair changes, missing records required for a requested action, inventory writes, employee/payroll/settings saves and password-reset-request prerequisites. These are blocking failures, not minor passive notifications. Success notices stay as toasts. Existing input-level feedback remains inline.

Concurrent blocking notices share one promise and dialog. A failure inside an already-running shared confirmation is rendered inside that same centered dialog; its controls are re-enabled and it stays open for correction/retry. This avoids nested-dialog deadlocks and accidentally dismissing the error when a callback returns. Exceptions also remain in the existing dialog. Confirmation actions still run at most once while pending.

## Verification

- PASS: production build, 79 modules. Existing non-blocking mixed static/dynamic shared.js import warning remains.
- PASS: node --test tests/*.test.mjs, 5 tests (2 new, 3 existing).
- PASS: git diff --check.
- PASS: 7 browser DOM checks: over-advance rejects with zero RPC calls; duplicate notices share one dialog/promise; exact title and single OK action; acknowledgement closes; double-submit invokes one action; nested failure remains visible with retry enabled; success remains a toast.
- PASS: screenshot inspected for centered readable dialog; no console errors in the isolated browser tests.
- No live records changed. Browser fixture stubs network/RPC calls. The full set of live account/financial workflows was not replayed; the audit verified their presentation call sites and the shared behavior.

## Files changed

- src/blocking-error.js: pure presentation copy mapping.
- src/shared.js: shared acknowledgement helper, deduplication and in-dialog failures.
- src/pos/pos.js: explicit blocking feedback call sites.
- src/pos/workshop.js: explicit blocking feedback call sites.
- src/admin/admin.js: explicit blocking feedback call sites.
- src/features/admin/inventory/api.js: explicit blocking feedback call sites.
- src/features/admin/ems/index.js: explicit blocking feedback call sites.
- src/features/ems/index.js: explicit blocking feedback call sites.
- src/auth.js: explicit blocking feedback call sites.
- tests/blocking-error.test.mjs: copy regression tests.
- tests/blocking-dialog.html: isolated browser regression harness, not in production build.
- docs/BLOCKING_VALIDATION_DIALOG_AUDIT.md: this report.

## Exact changed cases

Each entry below identifies the current source line and the failure branch. Dynamic error values retain the backend explanation, with generic prefixes removed where mapped; over-advance uses the wording above. All calls use the centered shared helper, or the current shared dialog's error area when its action is pending.

### src/pos/pos.js

- Line 533: `showBlockingError('This ticket has not been placed yet.')`
- Line 978: `if (!res.ok) { dlog('POS.placeOrder', \`INSERT FAILED: ${res.error}\`); showBlockingError('Error placing order: ' + res.error); return }`
- Line 1001: `if (!res.ok) { showBlockingError('Error recording payment: ' + res.error); return }`
- Line 1021: `showBlockingError(\`Split amounts must add up to ${money(total)}.\`); return`
- Line 1068: `showBlockingError('Sale error: ' + res.error)`
- Line 1130: `showBlockingError('Only an unplaced repair draft can be modified here.')`
- Line 1177: `if (!reason) { showBlockingError('Enter a reason.'); return }`
- Line 1184: `if (!res.ok) { showBlockingError('Error: ' + res.error); return }`
- Line 1223: `if (!name) { showBlockingError('Enter a component name.'); return }`
- Line 1247: `if (!text) { showBlockingError('Describe the issue.'); return }`
- Line 1260: `if (!comps.length && !labour) { showBlockingError('Add at least one component or a labour charge.'); return }`
- Line 1263: `if (!res.ok) { showBlockingError('Error: ' + res.error); return }`
- Line 1350: `if (!amount || amount <= 0) { showBlockingError('Enter a payment amount.'); return }`
- Line 1382: `if (!res.ok) { showBlockingError('Delivery error: ' + res.error); return false }`
- Line 1393: `if (!summaryResult.ok) { showBlockingError('Summary error: ' + summaryResult.error); return }`
- Line 1403: `if (!res.ok) { showBlockingError('Delivery error: ' + res.error); return }`
- Line 1436: `if (!name)    { showBlockingError('Enter item name.'); return }`
- Line 1437: `if (price<=0) { showBlockingError('Enter valid price.'); return }`
- Line 1503: `if (!text) { showBlockingError('Describe the issue.'); return }`
- Line 1521: `if (!amount||amount<=0) { showBlockingError('Enter a payment amount.'); return }`
- Line 1551: `if (!amount||amount<=0) { showBlockingError('Enter a valid amount.'); return }`
- Line 1556: `if (!res.ok) { showBlockingError('Settle error: ' + res.error); return }`
- Line 1644: `if (!data.customerName?.trim()) { showBlockingError('Customer name is required.'); return }`
- Line 1645: `if (!data.customerPhone?.trim()) { showBlockingError('Customer phone is required.'); return }`
- Line 1646: `if (!data.deviceBrand?.trim())  { showBlockingError('Device brand is required.'); return }`
- Line 1647: `if (!data.deviceModel?.trim())  { showBlockingError('Device model is required.'); return }`
- Line 1674: `if (!updated) { showBlockingError('Repair draft is no longer in the cart.'); return }`
- Line 1703: `if (!lookup.ok) { showBlockingError('Return lookup failed: '+lookup.error); return }`
- Line 1712: `if (preview.error) { showBlockingError(preview.error); return }`
- Line 1713: `if (!preview.lines.length) { showBlockingError('Enter a return quantity for at least one item.'); return }`
- Line 1715: `if (!reason) { showBlockingError('Enter a return reason.'); return }`
- Line 1719: `if (!result.ok) { showBlockingError('Return error: '+result.error); return }`
- Line 1746: `if (!result.ok) { showBlockingError('Error: ' + result.error); return }`

### src/pos/workshop.js

- Line 615: `if (error) { showBlockingError('Error: ' + error.message); return }`
- Line 649: `if (!reason) { showBlockingError('Enter a reason.'); return }`
- Line 656: `if (!res.ok) { showBlockingError('Error: ' + res.error); return }`
- Line 695: `if (!name) { showBlockingError('Enter a component name.'); return }`
- Line 721: `if (!text) { showBlockingError('Describe the issue.'); return }`
- Line 734: `if (!comps.length && !labour) { showBlockingError('Add at least one component or a labour charge.'); return }`
- Line 743: `if (!res.ok) { showBlockingError('Error: ' + res.error); return }`
- Line 766: `if (!result.ok) { showBlockingError('Error: ' + result.error); return }`

### src/admin/admin.js

- Line 665: `if (!summary) { showBlockingError('Repair summary is unavailable.'); return }`
- Line 727: `if (!reason) { showBlockingError('Enter a reason.'); return }`
- Line 734: `if (!res.ok) { showBlockingError('Error: ' + res.error); return }`
- Line 771: `if (!name) { showBlockingError('Enter a component name.'); return }`
- Line 795: `if (!text) { showBlockingError('Describe the issue.'); return }`
- Line 808: `if (!comps.length && !labour) { showBlockingError('Add at least one component or a labour charge.'); return }`
- Line 814: `if (!res.ok) { showBlockingError('Error: ' + res.error); return }`
- Line 840: `if (!result.ok) { showBlockingError('Decision error: ' + result.error); return }`
- Line 860: `if (amount <= 0 || !reason) { showBlockingError('Enter a positive reduction and a reason.'); return }`
- Line 864: `if (!result.ok) { showBlockingError('Adjustment error: ' + result.error); return }`
- Line 871: `if (!summaryResult.ok) { showBlockingError('Summary error: ' + summaryResult.error); return }`
- Line 879: `if (refund < 0 || !reason) { showBlockingError('Enter a valid refund and a reason.'); return }`
- Line 883: `if (!result.ok) { showBlockingError('Cancellation error: ' + result.error); return }`
- Line 904: `if (!res.ok) { showBlockingError('Error: ' + res.error); return }`
- Line 965: `if (!result.ok) { showBlockingError('Error deactivating: ' + result.error); return }`
- Line 993: `if (error) { showBlockingError('Update failed: '+error.message); return }`
- Line 1000: `if (!sale) { showBlockingError('Sale not found.'); return }`
- Line 1017: `if (!ticket) { showBlockingError('Repair invoice not found.'); return }`
- Line 1021: `if (!parent) { showBlockingError('Parent repair record not found.'); return }`
- Line 1070: `if (error) { showBlockingError('Error: '+error.message); return }`
- Line 1082: `if (error) { showBlockingError('Error: '+error.message); return }`
- Line 1091: `if (error) { showBlockingError('Error: '+error.message); return }`
- Line 1103: `if (error) { showBlockingError('Error: '+error.message); return }`
- Line 1115: `if (error) { showBlockingError('Error: '+error.message); return }`
- Line 1125: `if (error) { showBlockingError('Error: '+error.message); return }`
- Line 1141: `if (!amount || amount <= 0) { showBlockingError('Enter a valid amount.'); return }`
- Line 1146: `if (!result.ok) { showBlockingError('Settle error: '+result.error); return }`
- Line 1232: `if (!itemName) { showBlockingError('Item name is required.'); return }`
- Line 1240: `if (error) { showBlockingError('Error: ' + error.message); return }`
- Line 1262: `if (err) { showBlockingError(err); return }`
- Line 1265: `if (!result.ok) { showBlockingError('Error updating: '+result.error); return }`
- Line 1268: `if (!reset.ok) { showBlockingError('Employee details were saved, but password reset failed: ' + reset.error); return }`
- Line 1275: `if (pwErr) { showBlockingError(pwErr); return }`
- Line 1280: `if (!result.ok) { showBlockingError('Error saving employee: '+result.error); return }`
- Line 1305: `if (!result.ok) { showBlockingError('Settings error: '+result.error); return }`
- Line 1311: `if (!email) { showBlockingError('Enter an owner email.'); return }`
- Line 1313: `if (!result.ok) { showBlockingError('Error: '+result.error); return }`
- Line 1318: `if (!data.new_pin?.trim()) { showBlockingError('Enter a PIN.'); return }`
- Line 1320: `if (!result.ok) { showBlockingError('Error: '+result.error); return }`

### src/features/admin/inventory/api.js

- Line 31: `showBlockingError('Error: ' + error.message)`
- Line 54: `if (error) { dlog('admin.inventory.submitInvAdd', \`FAILED: ${error.message}\`); showBlockingError('Error: '+error.message); return { ok:false } }`
- Line 68: `if (error) { dlog('admin.inventory.submitInvEdit', \`FAILED: ${error.message}\`); showBlockingError('Error: '+error.message); return { ok:false } }`
- Line 85: `if (error) { showBlockingError('Stock adjustment failed: '+error.message); return { ok:false } }`

### src/features/admin/ems/index.js

- Line 530: `if (error) { showBlockingError('Error: ' + error.message); return }`
- Line 560: `if (!data.rate || Number(data.rate) <= 0) { showBlockingError('Enter a valid rate.'); return }`
- Line 567: `if (error) { showBlockingError('Error: ' + error.message); return }`
- Line 575: `if (!empId || !month || !year) { showBlockingError('Please fill all fields.'); return }`
- Line 580: `if (!result.ok) { showBlockingError('Error: ' + result.error); return }`

### src/features/ems/index.js

- Line 150: `if (error) { showBlockingError('Clock-in failed: ' + error.message); btn.disabled = false; btn.textContent = '⏱ Clock In'; return }`
- Line 322: `showBlockingError('Clock-out failed: ' + error.message)`

### src/auth.js

- Line 370: `if (!email) { showBlockingError('Enter your email address first.'); return }`
- Line 372: `if (!turnstileToken) { showBlockingError('Complete the verification first.'); return }`
- Line 375: `if (!res.ok) { showBlockingError('Something went wrong: ' + res.error); return }`

### src/shared.js

The action catch handler now shows its failure inside the current centered dialog instead of emitting a top-right error toast.

## Release status

Completed, merged and deployed. Business rules and backend access controls unchanged.
