import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../src/shared.js', import.meta.url), 'utf8')
function harness(rpc) {
  const config = source.slice(source.indexOf('export let CFG'), source.indexOf('export async function loadQuickItems'))
  const access = source.slice(source.indexOf('export const ACCESS'), source.indexOf('/* ── Auth ── */'))
  const ctx = vm.createContext({ sb:{rpc}, state:{modal:null}, dlog(){}, console:{warn(){}}, sessionStorage:{removeItem(){}} })
  vm.runInContext(`${config}\n${access}`.replace(/export /g, '') + '\nglobalThis.api = {CFG,can,modalEntitled,loadConfig,resetClientEntitlements}', ctx)
  return ctx.api
}

test('optional modules fail closed for every role; Workshop uses technician flag only', async () => {
  const api = harness(async()=>({data:{technician_module_enabled:true,workshop_enabled:false,ems_enabled:'true'}}))
  for (const role of ['Business Owner','Orbito Support','Manager','Cashier','Technician']) {
    for (const mod of ['repairs','inventory','workshop','ems']) assert.equal(api.can(mod,role), false)
  }
  await api.loadConfig()
  assert.equal(api.can('workshop','Technician'), true)
  assert.equal(api.can('workshop','Manager'), false)
  assert.equal(api.can('ems','Business Owner'), false)
  assert.equal('workshop_enabled' in api.CFG, false)
  assert.equal(api.modalEntitled('repair'),false)
  assert.equal(api.modalEntitled('inv-add'),false)
  assert.equal(api.modalEntitled('leave-request'),false)
})

test('failed reload clears enabled flags; logout invalidates pending config', async () => {
  let result = {data:{repair_module_enabled:true,inventory_module_enabled:true,ems_enabled:true}}
  const api = harness(async()=>result)
  await api.loadConfig()
  assert.equal(api.can('repairs','Business Owner'),true)
  result = {error:new Error('offline')}
  await api.loadConfig()
  assert.equal(api.can('repairs','Business Owner'),false)
  let resolve
  const pending = harness(()=>new Promise(r=>{resolve=r}))
  const loading = pending.loadConfig()
  pending.resetClientEntitlements()
  resolve({data:{technician_module_enabled:true}})
  await loading
  assert.equal(pending.can('workshop','Technician'),false)
})

test('legacy config migration removes only unused Workshop projection', () => {
  const baseline = readFileSync(new URL('../supabase/migrations/20260903165753_phase2_auth_foundation.sql',import.meta.url),'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/20260920195256_remove_legacy_workshop_config_alias.sql',import.meta.url),'utf8')
  const fn = text=>text.match(/create or replace function public\.get_app_config\(\)[\s\S]*?\$\$;/)[0].replace(/\r/g,'')
  assert.equal(fn(migration),fn(baseline).replace("    'workshop_enabled', sc.workshop_enabled,\n",''))
})
