/* ═══════════════════════════════════════════════════════════════════
   features/admin/inventory/index.js
   Barrel re-export for admin.js's inventory usage. admin.js does
   `_inv = await import(...)` and calls `_inv.functionName(...)` as one
   flat namespace -- this preserves that interface while api.js
   (Supabase ops) and render.js (rendering) stay split internally.
═══════════════════════════════════════════════════════════════════ */
export * from './api.js'
export * from './render.js'
