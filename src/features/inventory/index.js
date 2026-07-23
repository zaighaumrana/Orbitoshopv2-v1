/* ═══════════════════════════════════════════════════════════════════
   features/inventory/index.js
   Barrel re-export for the Inventory feature. pos.js and admin.js both
   do `_inv = await import(...)` and then call `_inv.functionName(...)`
   as one flat namespace -- this file preserves that exact interface
   while the implementation is actually split into api.js (Supabase
   ops) and render.js (HTML rendering) internally.

   Still lazy-loaded only when CFG.inventory_module_enabled is true --
   unchanged from before this split. A client with inventory disabled
   never fetches this chunk (or api.js/render.js) at all.
═══════════════════════════════════════════════════════════════════ */
export * from './api.js'
export * from './render.js'
