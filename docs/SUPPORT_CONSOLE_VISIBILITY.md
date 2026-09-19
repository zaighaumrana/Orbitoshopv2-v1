# Support-only on-screen console

Date: 2026-09-15

Current status: integrated into `development` and deployed. Phase 4 client live
smoke passed, per project-owner confirmation. The table below preserves this
batch's isolated test evidence; its unrecorded individual live cases are not
automatically claimed passed by the overall smoke confirmation. See
[project status](PROJECT_STATUS.md). Final client regression/cleanup is next.

## Root cause and audit

index.html loads debuglog.js before main.js. Many modules also import that same
ES module for dlog/dstack. The previous record -> flush -> ensurePanel path
unconditionally created a body-level fixed panel and a separate button bar.
It survived #app rerenders and had no authenticated-role gate.

The audit found one renderer in src/debuglog.js; all diagnostic imports share it.
The panel CSS is inline, fixed-position and does not reserve document space.
No additional console footer, toggle, menu, CSS spacing rule or legacy debug-flag
activation was found in src, index.html or public. Infrastructure/imports remain.

## Changes and canonical check

- src/debuglog.js: default-deny capture/rendering; one Auth observer; verified
  profile reads; stale-result generation guard; guarded controls; complete teardown.
- src/shared.js: initialize diagnostics with the existing real Supabase client;
  revoke synchronously at the start of the existing logout path.
- tests/support-console.html: isolated browser/DOM role and lifecycle fixture.
- docs/SUPPORT_CONSOLE_VISIBILITY.md: this report.

Access requires all of:

1. Existing client auth.getUser() successfully verifies an authenticated user.
2. app_users.auth_user_id matches that user.
3. app_users.role is exactly `Orbito Support`.
4. app_users.status is `Active` and employee_id is null (dedicated support identity).

This uses the same Auth/app_users source as Phase 2, not state.role, an email
comparison, user_metadata, route parameters or browser flags. Verification only
reads identity/profile data; it does not establish or change authentication.
Auth events recheck access outside the callback. Same-user refresh preserves
controls while rechecking; failed verification revokes. Logout/user changes clear
the panel, button bar, buffers, pause/minimize state and button handlers. Queued
or in-flight old verification cannot restore revoked access.

Ordinary browser console calls still forward to the original browser methods.
For non-support sessions no in-app diagnostic buffer or console DOM is created.
No app layout styles were changed and no reserved bottom space is introduced.

## Privileged-operation audit

No privileged operations were found. Controls only clear the in-memory log,
pause display updates and minimize/expand the local panel. There is no command
execution, administrative RPC, database mutation or support endpoint in it.
Backend Auth/RLS and support-login architecture remain unchanged.

Normal application roles cannot activate this panel using DOM reveal, URL or
storage flags. Removed controls have their handlers cleared and entry points
check private verified access. This is not a claim that client JavaScript is a
security boundary against someone rewriting their own browser runtime; doing so
does not confer any backend privileges. No weaker authorization substitute added.

## Historical test matrix (original batch evidence)

Tests use an isolated fake Auth/profile client, not real account credentials.

| Role / case | DOM result | Live authenticated smoke |
| --- | --- | --- |
| Business Owner | Absent after login/refresh event/logout | Pending |
| Cashier | Absent after login/refresh event/logout | Pending |
| Technician | Absent after login/refresh event/logout | Pending; verify Workshop layout |
| Manager, Operator, unknown role | Absent after login/refresh event/logout | Pending where identities exist |
| Orbito Support | Visible; clear/pause/minimize work; one panel after refresh event | Pending actual page refresh |
| Support -> logout -> Owner -> Support | No stale panel; support restored | Pending |
| Anonymous, fake query/storage flags | Console absent | DOM checked |
| Inactive or employee-linked support | Denied | DOM checked |
| Logout before queued verification | Cannot restore panel | DOM checked |

- PASS: 32 browser/DOM assertions; no console errors.
- PASS: one Auth listener despite repeated initialization.
- PASS: stale button handler removed on logout.
- PASS: npm run build (79 modules); existing mixed static/dynamic import warning only.
- PASS: git diff --check.
- No live DB writes, migrations, financial or role-permission changes.

The original batch deferred individual authenticated smoke cases listed above.
Current integrated client deployment and overall Phase 4 live smoke are complete;
per-case results not recorded here remain unspecified, not a current merge hold.
Repo-wide regression/cleanup remains the next planned client task.

Reference checked: [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser).
