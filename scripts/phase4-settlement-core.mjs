// Emit a patch only. Preserve the staged S3 settlement body exactly, except
// bypassing direct-collection BILL capture for the existing Udhar settlement.
import fs from 'node:fs'
const source = fs.readFileSync('supabase/migrations/20260917015216_phase4_pin_request_security.sql', 'utf8').replaceAll('\r', '')
const definition = source.match(/create or replace function public\.settle_udhar\([\s\S]*?^\$\$;/m)?.[0]
if (!definition || definition.split('public.record_repair_payment(').length !== 2) throw new Error('Settlement source changed')
const changed = definition.replace('public.record_repair_payment(', 'app_private.record_repair_payment(')
const file = 'supabase/migrations/20260917174024_phase4_platform_bridge.sql'
const marker = '  public.create_inventory_item(uuid,text,text,text,numeric,numeric,integer,integer) to authenticated;'
process.stdout.write(`*** Begin Patch\n*** Update File: ${file}\n@@\n ${marker}\n+\n+-- Udhar settlement preserves its existing non-BILL semantics.\n${changed.split('\n').map(l=>'+'+l).join('\n')}\n*** End Patch`)
