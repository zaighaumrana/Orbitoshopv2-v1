# Account menu, password changes and Security settings — current 5 November 2026

> Checkpoint — 5 November 2026: implemented on `development`. When this document was written (owner-supplied Git output), `development` matched `origin/development` at `d52d9dc` with a clean working tree. The owner reports that `npm run build` and `node --test tests/legal.test.mjs` pass and that the browser checklist covering this work passed (owner report; the environment used was not stated). This is a Shop front-end change only: no migration, database function or Platform change. Deployment and hosted acceptance are **not** established by this document.

## Purpose

The POS, Workshop and Admin headers each carried a separate copy of the same account controls: name chip, My Account icon, Light/Dark button, Clock Out and a red Logout button. Employees (Manager, Cashier, Technician) have no Settings access, so the My Account modal was their only way to change a password.

These controls are now one dropdown opened from the person icon. Password change moved to where each role can reach it, and the owner's Settings tab was renamed to match its remaining content.

## Roles — facts to keep in mind

The database accepts exactly five values in `app_users.role` (check constraint in the Phase 2 authentication foundation migration):

| Role | Who | Employee row |
| --- | --- | --- |
| Business Owner | The shop owner; one per shop | none |
| Manager, Cashier, Technician | The three employee roles | required |
| Orbito Support | Vendor-side support identity | none; no reusable password |

"Admin" is **not** a stored role. In the front end `isAdmin` means "Business Owner or Orbito Support" (`src/shared.js`), and "Admin" is the name of the back-office view. The migrations contain the word once, as a display label that the legacy-credential helper gives the legacy owner identity, whose canonical role stays `Business Owner`.

Module access (`ACCESS` map): Business Owner and Orbito Support have `settings`; Manager, Cashier and Technician do not. Managers use the back-office (Admin) view without Settings.

## The account menu

`src/account-menu.js` exports `accountMenuHTML({ session, shop, leave, clockOut })` and `changePasswordModalHTML()`. All three views call the builder in place of the old header buttons. The online chip, the Admin/POS/Workshop navigation buttons and the Admin module selector are unchanged.

Panel contents: an identity block (initials avatar, name, raw role label · shop name), then **Account**, **Preferences** and **Session** sections.

| Item | Business Owner | Orbito Support | Manager / Cashier / Technician |
| --- | --- | --- | --- |
| My Account → Admin → Settings → Security | yes | yes | — |
| Change Password (popup) | — (Settings card) | — (support note) | yes |
| Request Leave | — | — | when EMS is enabled |
| Clock out | — | — | when EMS is enabled |
| Install App | when the browser offers it | same | same |
| Help & User Guide (`/legal.html?doc=guide`) | yes | yes | yes |
| Dark mode switch | yes | yes | yes |
| Log out | yes | yes | yes |

"Owner-like" is `session.isAdmin === true` or role `Business Owner`, so Orbito Support is owner-like. The raw role label (including `Orbito Support`) is shown as-is, per the branding guide. Request Leave and Clock out also depend on the view passing `leave: true` / `clockOut: true`; all three views now do.

Every item reuses an existing action (`theme`, `logout`, `ems-clock-out`, `open-leave-request`, `install`, plus the new `change-password`), so each view keeps its own handlers. "My Account" for owners is a `data-nav` item that navigates through `router.js` (loaded on demand) to `/admin/settings?tab=security`.

### Behaviour that must not be broken

- **Open state lives in module state and is written into the markup** (`data-open`, `aria-expanded`). The shell renderer patches the header in place and removes attributes absent from the new markup, so a menu opened by changing the DOM only would close on every re-render. The root, trigger and panel have stable ids for the patcher.
- **One set of capture-phase listeners**, installed once (`window.__rsAccountMenu`). A menu item click closes the menu and returns focus to the trigger **before** the view handler opens a dialog, so the dialog system (which makes the header inert and restores focus to its opener) remembers the trigger.
- Outside click, Escape and Tab close the menu; arrow keys, Home and End move between items; Enter on the icon focuses the first item. The dark-mode item carries `data-keep-open`. A private reset (logout) closes the menu.
- Accessibility: `aria-haspopup`, `aria-expanded`, `aria-controls`, `role="menu"` with `menuitem` / `menuitemcheckbox`, and the existing global focus ring.
- Styling (`src/style.css`): RetraSell tokens only, inline SVG icons with `currentColor` (no emoji), reduced motion respected. On phones (≤768px) the panel is a full-width dropdown under the header: the header uses a backdrop blur, which would anchor a fixed bottom sheet to the header instead of the screen. While open the header's z-index is raised to 9 (dialogs are 10). Selectors are `.rs-shop`-prefixed with extra depth because the brand stylesheet loads after `style.css`.

## Password changes

`handleChangePasswordSubmit` calls `changeOwnPassword`, which verifies the current password with a Supabase Auth sign-in and updates it through Supabase Auth. There is no custom function or table, it works for every role, and it refuses Orbito Support sessions. That is why this change needed no backend work.

- **Manager, Cashier, Technician:** menu → **Change Password** opens a popup (modal type `changePassword`, rendered by `changePasswordModalHTML()`). It uses the same form (`data-form="change-password"`, fields `oldPassword`, `newPassword`, `confirmPassword`, error element `#change-password-error`) and the same submit handler as before in each view.
- **Business Owner:** the form is a card in Admin → Settings → Security, directly under Owner Login. It clears the fields and error message after success. The owner's Owner Login text points to this card.
- **Orbito Support:** the Security card shows the support note instead of a form, and the menu has no password item.
- Admin's "resources still loading" exception list includes `changePassword` and `leave-request` so these dialogs open immediately.

## Settings tab rename

The Settings tab key `staff` ("Staff & Security") became `security` ("Security"), and the page subtitle now says "security". The Security tab shows Owner Login, Change Password, then Override PIN. The "go to the Employees tab" card and its `go-employees-tab` handler were removed, because staff management lives in the Employees module.

The key is a front-end value only: the URL `?tab=`, the whitelist in `src/admin/navigation-state.js` and browser history state. No Supabase object references it. `safeAdminState` maps the legacy value (`legacy = { settingsTab: { staff: 'security' } }`) so old bookmarks and saved history entries still land on Security. `tests/support-automation.test.mjs` was updated to `security`.

## EMS actions in the Admin view

Managers are non-owner employees who work in the Admin view, which previously had no Clock Out and no leave-request handling (My Account showed a Request Leave button that did nothing there). `admin.js` now has the `ems-clock-out` and `open-leave-request` handlers, the `leave-request` modal and its submit handler, using `leaveRequestHTML`, `submitLeaveRequest` and `handleClockOut` from `src/features/ems/index.js`, the same code Workshop uses. The existing own-row attendance and leave-request permissions are unchanged. The owner reports that Manager clock-out and leave request were checked in the browser.

## Logout

In POS the confirmation names the number of cart items that will be cleared (logout resets the cart, the repair draft and in-flight operations). Without cart items it keeps the original wording.

## Removed code

The My Account modal (`myAccountModalHTML`), the `my-account` action and `myAccount` modal type in all three views, the `profileIcon` imports in the views, the `helpLink` import in `shared.js`, the `go-employees-tab` handler, and the then-unused `CFG` (`workshop.js`) and `SHORT_BRAND_NAME` (`shared.js`) imports.

Kept on purpose: `helpLink()` in `src/legal/links.js` (covered by the legal tests), `src/profile-icon.js` (used by the menu), `handleChangePasswordSubmit`.

## Tests touched

- `tests/legal.test.mjs` now requires the Help & User Guide link in `src/account-menu.js` instead of inside the removed modal.
- `tests/m3-browser.mjs` and `tests/pos-svg-browser.mjs` open the account menu before using Logout and Dark mode.
- `tests/support-automation.test.mjs` uses `security`.
- `tests/helpers/m3-owner-acceptance.mjs` is shared with the advance-payment change (see `docs/ADVANCE_PAYMENT_PROMPT.md`).

The browser scripts were edited but **not executed**.

## Validation

- Owner reports (environment not stated): build and `tests/legal.test.mjs` pass at `d52d9dc`; the browser checklist for the header menu in all views, employee password change, owner My Account → Security, Security tab content and URLs including the legacy `?tab=staff`, EMS Clock out and Request Leave, and the POS logout warning passed.
- Assistant review of a snapshot at `967a74c`: diffs matched the specified edits, JavaScript parsed, lint found no undefined names, both stylesheets parsed, and the Node-only suite gave identical before/after results. The later tidy-up commits (`19480fe` to `d52d9dc`) were confirmed only by the owner's Git status, leftover search, build and legal test.

## Limits and planned follow-up

- **Shift Stats is unchanged.** It is still a browser-local-midnight report of the signed-in operator's own activity. It is not a true shift and has no connection to EMS. A server-side shift model is a planned follow-up that needs a Shop backend change and a paired change in the Platform (sister) repository; it was deliberately kept out of this work. The menu has no Shift section yet.
- Employees given a temporary password are not forced to change it; nothing stores such a flag.
- No backend, migration or Platform change was made.
