import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import { escapeHTML } from '../src/html.js'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
function loginContext() {
  const source = stripTypeScriptTypes(read('supabase/functions/login/index.ts').replace(/^import .*$/gm, ''))
  const context = vm.createContext({ URL, console, Deno: {
    env: { get: key => key === 'SUPABASE_URL' ? 'https://fixture.supabase.co' : '' }, serve() {},
  } })
  vm.runInContext(source, context)
  return context
}

test('legacy login fails closed without vault and retains hash migration verification', async () => {
  const ctx = loginContext()
  let vault = null, calls = 0
  const admin = {
    from(table) {
      assert.equal(table, 'legacy_auth_credentials', 'no plaintext table reads')
      return { select() { return this }, eq() { return this }, async maybeSingle() { return { data:vault } } }
    },
    async rpc(name, args) {
      calls++; assert.equal(name, 'verify_legacy_credential'); assert.equal(args.candidate_email, 'test@example.test')
      return { data:[{ normalized_email:args.candidate_email }] }
    },
  }
  assert.equal(await ctx.verifyLegacyIdentity(admin, 'test@example.test', 'fixture'), null)
  assert.equal(calls, 0)
  vault = { normalized_email:'test@example.test' }
  assert.equal((await ctx.verifyLegacyIdentity(admin, 'test@example.test', 'fixture')).normalized_email, vault.normalized_email)
  assert.equal(calls, 1)
})

test('mapped support uses one ID lookup and still rejects wrong Auth email', async () => {
  const ctx = loginContext()
  let email='orbitosupport+fixture@support.orbito.internal', lookups=0
  const profile={ auth_user_id:'support-id',email,employee_id:null,status:'Inactive',role:'Orbito Support' }
  const admin={
    from(table) {
      assert.equal(table,'app_users')
      return { select(){return this},eq(){return this},async maybeSingle(){return {data:profile}} }
    },
    auth:{admin:{
      async getUserById(id){lookups++;assert.equal(id,profile.auth_user_id);return {data:{user:{id,email}}}},
      listUsers(){throw Error('Unexpected full Auth scan')},
    }},
  }
  const call=()=>ctx.bootstrapSupportSession(admin,{},'platform-id','platform@example.test',null)
  assert.equal((await call()).error,'Support access is inactive.')
  assert.equal(lookups,1)
  email='owner@example.test'
  assert.equal((await call()).error,'Client support identity requires administrator recovery.')
})

test('online-only worker does not intercept fetch and registration rejection is handled', async () => {
  const handlers=new Map()
  vm.runInNewContext(read('public/sw.js'), {self:{addEventListener:(type,fn)=>handlers.set(type,fn)}})
  assert.deepEqual([...handlers.keys()],['install','activate'])
  const source=read('src/main.js')
  const start=source.indexOf("if ('serviceWorker' in navigator)")
  let warned=0
  vm.runInNewContext(source.slice(start,source.indexOf('boot()',start)),{
    navigator:{serviceWorker:{register:async()=>{throw Error('Fixture unavailable')}}},
    console:{warn:()=>warned++},
  })
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(warned,1)
})

test('Workshop matched child and work invoice labels escape stored text', () => {
  const source=read('src/pos/workshop.js')
  const attack='"><img src=x onerror=alert(1)>'
  for(const marker of ['Matched: ', "Original Repair'} · "]) {
    const start=source.indexOf(marker)+marker.length
    assert.ok(start>=marker.length)
    const interpolation=source.slice(start).match(/^\$\{([^}]+)\}/)
    assert.ok(interpolation)
    const value=vm.runInNewContext(interpolation[1],{
      escapeHTML,t:{_matchedChild:{invoice_number:attack}},work:{invoice:attack},
    })
    assert.equal(value,escapeHTML(attack))
  }
})
