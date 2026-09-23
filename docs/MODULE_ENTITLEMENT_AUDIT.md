# Client module entitlement audit

Date: 2026-09-24. Local changes only; no commit, deployment or migration application.

## Canonical flags

| Flag | Scope and disposition |
| --- | --- |
| `repair_module_enabled` | Admin Repairs, POS intake/collection, component catalog and repair modals. Disabled repair-specific queries, shortcuts and catalog tab are gated. |
| `inventory_module_enabled` | Inventory route, dynamic inventory code, POS stock picker and inventory forms. Retains existing role checks. |
| `technician_module_enabled` | The ONLY Workshop entitlement. Workshop is the frontend name of the Technician module. Route, navigation, loader and event checks use `can('workshop', role)`. |
| `workshop_enabled` | Unused legacy alias, not a second module. Ignored by the client; new forward migration removes its unused `get_app_config()` JSON field. Stored column and historical migrations remain for compatibility. |
| `live_tracking_enabled` | Standalone public tracking already fails closed on missing/disabled config; public-track Edge Function also rejects unavailable tracking. Unchanged. |
| `ems_enabled` | Admin EMS navigation/route, clock-in, leave and clock-out. Added missing role-plus-entitlement check and stale event guards. |
| `paper_resupply_enabled` | Billing projection controls only the resupply button/action. Added click-time guard. Does NOT control thermal metering. |

No additional `_enabled` flags exist in current frontend/public/Edge source. Billing & Usage retains its existing Owner-only authorization; no new billing or subscription-tier entitlement was invented. `ems_track_breaks` is subordinate EMS behavior; discount PIN and partial-Udhar settings are financial rules, not module entitlements.

## Findings and surgical fixes

- Repair/Workshop defaults were enabled before config; failed reload could retain previous entitlements. Optional flags now default off, require literal `true`, and clear on failed config or logout. Pending config responses are invalidated at logout.
- EMS lacked the module check in `can()`. Its permanently attached handlers also lacked route/entitlement guards and retained the original employee as reviewer. They now check the active route and permission and use the current session.
- Old lazy route imports could render after logout. Route callbacks now check role/path and application generation after imports; loaders/renderers reject inactive views. Route transitions clear stale modal/DOM content before loading.
- Repair queries, KPI/operational links and component catalog tabs remained exposed with Repairs disabled. These now follow the repair flag. Disabled repair/inventory cart lines are removed on config reload.
- Cached inventory handlers, repair modal entrypoints, Workshop keyboard handling and resupply clicks now check their current entitlement.
- Removed unused `resetEMSEvents()` export: resetting a Boolean never detached listeners and could encourage duplicate binding. No callers existed.

## Deliberately unchanged / boundaries

- Role lists, Technician financial restrictions, financial RPCs, repair-family semantics, payment/credit rules and thermal metering are unchanged.
- Unified financial reports and Udhar history remain accounting views, not new module entrypoints. Their financial queries remain intact.
- Shared operational EMS code is still part of POS/Workshop bundles; disabled actions and queries are gated. No bundling redesign.
- This is a client visibility/access audit, not new server-side entitlement enforcement. Existing backend authorization remains authoritative. Browser code alone is not a security boundary.
- Entitlement changes are observed on config reload/navigation/login; no real-time platform-push subscription was added. Already accepted server transactions are not cancelled by a later flag change.
- Legacy database column is retained intentionally; deleting it or editing applied migrations would introduce avoidable compatibility risk. Platform must set `technician_module_enabled`, not `workshop_enabled`.

## Migration / validation

`20260920195256_remove_legacy_workshop_config_alias.sql` replaces only `get_app_config()` to omit the legacy JSON key. Function access checks, security attributes, existing ACLs and all other projected fields are preserved. No table or RLS changes. Migration is staged locally, not applied or live SQL-tested.

Production build passed. Automated suite: 32/32 passed (29 existing, 3 targeted entitlement/config/migration-contract checks). No browser suite or broad regression was run. Targeted checks cover fail-closed role behavior, canonical Workshop flag, missing/non-boolean config, failed reload, logout versus pending response, and exact migration-body equivalence except the removed alias.

## Short live smoke after deployment

1. Disable optional flags, reload as Owner/Support: navigation, direct URLs, POS shortcuts and catalog must not expose disabled functionality. Repeat Workshop URL as Technician.
2. Set only `technician_module_enabled=true`: Workshop becomes available to permitted roles, with existing Technician financial restrictions.
3. Enable modules, visit them, logout; disable them and login again. Check no stale modal/module flash; simulate config failure and reload.
4. Disable tracking and resupply: public tracking is unavailable and resupply is hidden; normal receipt printing and hidden thermal metering remain unaffected.
