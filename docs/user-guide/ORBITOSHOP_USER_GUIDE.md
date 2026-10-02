# {{PRODUCT_NAME}} User Guide

## Welcome

Feature availability: This guide covers features available across {{PRODUCT_NAME}} plans. Some features may not be available to your account depending on your subscription, enabled modules, business configuration, or supported services in your region.

{{PRODUCT_NAME}} helps you record sales, repairs, customer balances, stock and staff activity. Your Shop may not have every optional module. A missing module can be a plan setting, not an error. Use your own account and ask the Owner about access.

## Roles and accounts

- Business Owner: administration, POS, Workshop, employee management, Settings and Billing & Usage, subject to enabled modules.
- Manager: Dashboard, Repairs, Inventory, Reports, Receipts, Employees, EMS and Catalog where enabled. Not Settings, Billing & Usage, POS or Workshop. Can manage Cashier/Technician accounts, not create/promote/reset a Manager or Owner.
- Cashier: POS sales, available repair intake/collection and payment workflows. Sensitive actions may require the Shop's approval PIN. No general Admin or Workshop access.
- Technician: Workshop only when enabled. Operational job information and additional-work workflow remain available; canonical financial summaries are unavailable for this role. No general employee, salary, Admin or POS access.
- Orbito Support: a separately verified support identity with administrative support access, not the Shop Owner and not an Owner billing account.

The authorized Business Owner accepts published commercial terms for the Shop when a new required revision needs acceptance. Staff do not receive that contracting prompt, and an unpublished policy does not block Owner entry. Everyone with an appropriate account can open Profile / Account → Help & User Guide. Published legal documents and acceptance status are separate, in Business Owner Settings → Legal & Privacy.

## Make a retail sale

1. Open POS as an authorized account. Select a quick item/variant, enter a custom item if needed, or choose an in-stock inventory item when enabled.
2. Check quantities and prices. A discount or other protected action may ask for the approval PIN.
3. Choose the payment method shown. For Cash, enter at least the full total. For unpaid or partly paid amounts, use Udhar rather than pretending full cash was received.
4. Check customer details where required, then complete checkout once.
5. The sale is saved and a receipt is available. Stock-linked sales update inventory. Printing is separate from saving the sale.

If a connection error occurs, check whether the receipt/sale exists before attempting a new sale. Do not refresh repeatedly during a payment.

## Repair journey

Customer arrives → create ticket → record initial work/invoice → Pending → In Progress → Ready → payment or authorized credit → Delivered.

At POS, record customer name/phone, device details and requested work. Check components, labour, quote and advance. The advance cannot exceed the repair total. Keep notes relevant; do not record customer passwords or unnecessary device contents.

Pending means the repair is awaiting work. In Progress means work is underway. Ready means work is finished and awaiting handover; it does not mean Delivered or prove full payment. Delivered records customer handover through the collection process. Declined and Cancelled are different outcomes; use the action appropriate to the actual situation.

## Additional work and repair families

Original repair → extra work discovered → proposal Pending → customer decision → Approved additional invoice OR Declined proposal.

The Workshop can record proposed extra work. Obtain the customer's decision and use the authorized approval workflow. Pending proposals are not yet billed invoices. Declined proposals do not add an invoice. Approval creates a separate child/additional invoice linked to the original repair.

The original invoice and approved additional invoices form the repair family. Each invoice stays separately printable. A child receipt shows its parent reference. Avoid recording the same extra work twice. Authorized users can see the family total, paid amount and balance; Technicians keep their operational view without that financial summary.

## Payments and Udhar

Record the actual amount received and payment method. You may take full or permitted partial payment. Udhar records money still owed; it is not cash collected. Protected credit, settlement or delivery actions may require an approval PIN.

Repair-family payments settle the parent invoice first, then additional invoices in creation order, with their identifier breaking ties. You do not need to manually spread the same payment across each invoice. Check the remaining family balance before delivery.

Later settlement changes what the customer owes; it does not create another repair invoice or another BILL event. A payment alone is not the same as delivery. Refunds, returns, adjustments and cancellations should use their dedicated actions, not a new sale entered backwards.

## Workshop

Technicians and authorized Owner/Support users see the Workshop when enabled. Search the queue, open the job and review device information, approved work and notes. Update operational status, record relevant findings and propose additional work if required. Approved work can include separate additional invoices.

Mark a completed job Ready. Use the authorized collection/delivery workflow for customer handover; do not assume Ready clears the balance. A Technician cannot use the financial summary or general Admin screens. If a proposal seems missing, check whether it is still Pending or was Declined instead of Approved.

## Inventory

Authorized Admin users can create items, edit their details and adjust stock through Inventory. Record item name, SKU/category, selling price, cost and quantity as appropriate. Stock movements and reasons help explain changes. POS can sell inventory items when enabled; do not also manually subtract the same stock.

Inventory creation may count under the Shop's inventory usage plan. Price/stock fields are business records; keep them accurate. Disabled Inventory removes its UI and stock picker.

## Receipts and printing

Authorized Admin users can find retail and repair receipts in Receipts. Use type/date filters and search. Searching any repair-family invoice can show the family, with the exact matching invoice first; filters still apply. Each receipt has its own Print action.

Reprinting does not create another sale or BILL event. Check printer, paper size and the browser's print destination if output is wrong. A recorded print request is not proof paper emerged. Thermal paper-length estimates and reprint activity may be recorded even when optional Paper Resupply is off.

## Dashboard and Admin pages

### Dashboard

What it is for: an overview of invoiced amounts, collected payments, net payments, outstanding Udhar, enabled repair activity and employees.

What you can do: follow available overview links and examine recent activity. Who: Owner, Manager and Support. Important: invoiced value and collected cash are different; neither should automatically be treated as profit.

### Repairs

What it is for: find repair tickets and invoice families. What you can do: search ticket/invoice, customer, phone or device, inspect available details, additional-work decisions and authorized collection/adjustment actions. Who: Owner, Manager and Support when Repairs is enabled. Important: Cashiers use their POS repair workflow instead.

### Reports

What it is for: inspect operational financial reporting. What you can do: review reporting periods and amounts. Who: Owner, Manager and Support. Important: a report is not tax/legal advice and does not replace review of underlying records.

### Employees

What it is for: individual staff accounts. What you can do: create permitted roles, edit, deactivate/reactivate and reset passwords. Who: Owner/Support, or Manager within Cashier/Technician limits. Important: deactivate access when staff leave; deactivation does not erase historic records.

### EMS

What it is for: attendance, leave and salary workflows. What you can do: authorized Admin users review attendance/leaves and salary configuration/slips; eligible staff see clock-in/out or leave actions. Who: Owner, Manager and Support for Admin EMS, with employee self-service where enabled. Important: comply with employee-notice and payroll obligations; the application does not decide them for you.

### Catalog

What it is for: quick-sale items/variants and, when Repairs is enabled, repair components. What you can do: maintain the available catalogue. Who: Owner, Manager and Support. Important: catalogue entries and stock-counted inventory items are different.

### Settings

What it is for: Shop identity, receipt/tax preferences and staff/security settings. What you can do: authorized Owner/Support users update supported settings and inspect plan features; Owner can review legal acceptance. Important: module availability is Platform-managed, not an employee override.

### Billing & Usage

What it is for: the Shop's {{SHORT_BRAND_NAME}} service account. What you can do: Owner views available billing/usage information and requests paper when offered. Important: unavailable/stale information is not a zero balance or proof of payment. Other roles do not gain access by opening a direct URL.

POS, Workshop, Inventory and Receipts are explained above. Access always also depends on enabled modules.

## Modules

Repairs, Inventory, Technician/Workshop, Live Tracking, EMS and Paper Resupply can vary by Shop. Technician Module is the configuration name for Workshop, not another separate product. Live Tracking, where enabled, provides limited customer-facing repair status. Do not expose another customer's tracking details.

## Billing and paper resupply

Under the current invoice-event policy, one retail sale counts once regardless of Cash or Udhar; one original repair invoice counts once; an approved additional invoice can count separately. Later payment, settlement, repair collection and reprinting do not add BILL events. Your order/rate card controls actual prices.

If Paper Resupply is enabled, the Owner can request paper from Billing & Usage. The service records the request and receives lifecycle updates such as approved, dispatched or fulfilled when the Platform supplies them. The current client does not offer a complete fulfilment-history viewer; ask support for history or a missing update. Do not assume a request is dispatched merely because it was submitted.

Paper Resupply is separate from printing and thermal estimates. Turning it off does not stop either.

## Security, Help and common problems

- Keep passwords and approval PINs private. Use a separate account for each employee and lock unattended devices.
- Module missing: ask the Owner about role and enabled features; do not try to bypass the restriction.
- Login problem: check email, password, connectivity and verification. Forgot password records an eligible request for administrator assistance; it is not a promise of an immediate email reset link.
- Customer owes money: find the balance and record actual later payments through settlement.
- Ready but not Delivered: finish authorized handover, including payment/credit checks.
- Extra work missing: check proposal decision and the correct repair family.
- Printer issue: inspect browser print settings, connection and paper. Reprint the existing receipt rather than make another sale.
- Offline: normal transactions require connectivity. A queued print estimate is not an offline sale.
- Suspected unauthorized access: stop using the affected account/device and contact the Owner and support promptly.

Use Profile / Account → Help & User Guide. Login has no document links. Help is separate from Settings → Legal & Privacy, and unpublished contracts are not shown. Customer privacy requests should normally go to the Shop first; the service provider assists where required.
