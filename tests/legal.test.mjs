import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { renderDocument } from '../src/legal/render.js'
import { legalLinks, helpLink } from '../src/legal/links.js'
import { escapeHTML } from '../src/html.js'
import { PRODUCT_NAME, SHORT_BRAND_NAME, PROJECT_OWNER_NAME } from '../src/config/brand.js'
import { needsOnboarding } from '../src/onboarding-state.js'

const read = path => readFileSync(new URL('../' + path, import.meta.url),'utf8')
const draftMetadata = JSON.parse(read('src/legal/metadata.json'))
// Reviewed publication fixture only; production metadata remains unresolved.
const metadata = structuredClone(draftMetadata)
for (const key of metadata.requiredCompanyFields) metadata.company[key] = 'Reviewed value for ' + key
metadata.subprocessorScheduleReviewed = true
for (const key of ['terms','privacy','dpa']) Object.assign(metadata.documents[key], {version:'1.0',effectiveDate:'2026-09-29'})
const versions = {published:true,required_revision:metadata.requiredRevision,terms_version:'1.0',privacy_version:'1.0',dpa_version:'1.0'}
function functions(path, context) {
  const ctx = vm.createContext({PRODUCT_NAME,SHORT_BRAND_NAME,legalConfigurationReady:()=>true, ...context})
  vm.runInContext(read(path).replace(/^import .*$/gm,'').replace(/export /g,''), ctx)
  return ctx
}

test('legal API requires authority, sends exact versions without actor/date/tenant, rejects stale policy', async () => {
  const calls = []
  const client = {rpc:async(name,args)=>{calls.push({name,args}); return {data:{...versions,accepted:true}}}}
  const ctx = functions('src/legal/api.js',{metadata})
  await assert.rejects(ctx.acceptLegalTerms(client,false))
  assert.equal(calls.length,0)
  await ctx.acceptLegalTerms(client,true)
  assert.deepEqual(Object.keys(calls[0].args).sort(),['p_authorized','p_dpa_version','p_privacy_version','p_required_revision','p_terms_version'])
  assert.equal(ctx.versionsMatch({...versions,required_revision:'new'}),false)
  assert.equal(ctx.versionsMatch({...versions,terms_version:'1.1'}),false)
  await assert.rejects(ctx.readLegalStatus({rpc:async()=>({error:{message:'offline'}})}))
})

test('Owner gate requires checkbox, coalesces submit, retries safely; staff bypass without RPC', async () => {
  let checked = false, submits = 0, proceeds = 0, resolve
  const nodes = {'h1':{focus(){}},'#legal-signout':{},'#legal-retry':{},'#legal-acceptance-error':{textContent:''}}
  const submitButton = {}
  const form = {elements:{authorized:{get checked(){return checked}}},querySelector:()=>submitButton}
  nodes.form = form
  const root = {isConnected:true,querySelector:key=>nodes[key]}
  const app = {innerHTML:'',firstElementChild:root}
  let status = {...versions,accepted:false}
  const ctx = functions('src/legal/acceptance.js',{
    esc:escapeHTML,legalLinks,metadata,document:{getElementById:()=>app},
    readLegalStatus:async()=>status,versionsMatch:()=>true,
    acceptLegalTerms:()=>{submits++;return new Promise(r=>{resolve=r})},
  })
  for (const role of ['Cashier','Technician','Manager','Orbito Support']) {
    await ctx.ensureOwnerAcceptance({}, {employee:{role}},()=>proceeds++,()=>{})
  }
  assert.equal(proceeds,4)
  const session = {employee:{role:'Business Owner'}}
  await ctx.ensureOwnerAcceptance({},session,()=>proceeds++,()=>{})
  assert.match(app.innerHTML,/type="checkbox" required/)
  assert.doesNotMatch(app.innerHTML,/\bchecked\b/)
  const event = {preventDefault(){},currentTarget:form}
  await form.onsubmit(event)
  assert.equal(submits,0)
  checked = true
  const pending = form.onsubmit(event)
  await form.onsubmit(event)
  assert.equal(submits,1)
  resolve({...versions,accepted:true})
  await pending
  assert.equal(proceeds,5)
  status = {...versions,accepted:true}
  await ctx.ensureOwnerAcceptance({},session,()=>proceeds++,()=>{})
  assert.equal(proceeds,6,'refresh uses durable accepted status')
  assert.equal(submits,1)
})

test('canonical Markdown is safe; login has no document links and Help is separate from legal', () => {
  for (const path of ['docs/legal/TERMS_OF_SERVICE.md','docs/legal/PRIVACY_NOTICE.md','docs/legal/DATA_PROCESSING_ADDENDUM.md','docs/user-guide/ORBITOSHOP_USER_GUIDE.md','docs/user-guide/QUICK_START_GUIDE.md']) {
    const result = renderDocument(read(path).replace(/\r/g,''))
    assert.match(result.body,/<h1 /)
    assert.ok(result.contents.length >= 5)
    for (const [,key] of read(path).matchAll(/\{\{([A-Z_]+)\}\}/g)) assert.ok(['PRODUCT_NAME','SHORT_BRAND_NAME','SUBPROCESSORS'].includes(key) || key in metadata.company)
  }
  assert.doesNotMatch(renderDocument('# <script>alert(1)</script>').body,/<script>/)
  assert.match(renderDocument('# Title\r\n\r\n## Section\r\n').body,/<h2 /)
  for (const doc of ['terms','privacy','dpa']) assert.ok(legalLinks().includes('?doc='+doc))
  assert.doesNotMatch(legalLinks(), /doc=guide/)
  assert.match(helpLink(), /Help &amp; User Guide/)
  assert.doesNotMatch(helpLink(), /doc=terms|doc=privacy|doc=dpa/)
  assert.doesNotMatch(read('src/auth.js'),/legalLinks|helpLink|legal\.html|PLACEHOLDER/)
  assert.match(read('src/auth.js'), /escapeHTML\(PROJECT_ATTRIBUTION\)/)
  assert.match(read('src/shared.js').split('export function myAccountModalHTML')[1].split('/** Shared handler')[0], /\$\{helpLink\(\)\}/)
  assert.doesNotMatch(read('src/legal/page.js'),/shared\.js|supabase|turnstile|ghost-fibers/)
  assert.match(read('legal.html'),/src\/legal\/page.js/)
  assert.match(read('vite.config.js'),/legal: 'legal.html'/)
  assert.match(read('vite.config.js'), /Shop browser configuration missing/)
})

test('Owner status failure or mismatched versions show neutral service state; detached session cannot render', async () => {
  let proceeds = 0, current = true, failure = false
  const nodes = {'h1':{focus(){}},'#legal-signout':{},'#legal-retry':{},form:{}}
  const root = {querySelector:key=>nodes[key]}
  const app = {innerHTML:'',firstElementChild:root}
  const ctx = functions('src/legal/acceptance.js',{
    esc:escapeHTML,legalLinks,metadata,document:{getElementById:()=>app},
    readLegalStatus:async()=>{ if (failure) throw Error('Unavailable'); return {...versions,required_revision:'new',accepted:true} },
    versionsMatch:()=>false,acceptLegalTerms:()=>{throw Error('must not submit')},
  })
  const run = ()=>ctx.ensureOwnerAcceptance({}, {employee:{role:'Business Owner'}},()=>proceeds++,()=>{},()=>current)
  await run()
  assert.match(app.innerHTML,/Agreement configuration unavailable/)
  assert.doesNotMatch(app.innerHTML,/Your business agreement|checkbox|legal-acceptance-form|Accept and continue|doc=terms/)
  assert.equal(proceeds,0)
  failure = true
  await run()
  assert.match(app.innerHTML,/Agreement status unavailable/)
  assert.doesNotMatch(app.innerHTML,/Your business agreement|checkbox|legal-acceptance-form|Accept and continue|doc=terms/)
  assert.equal(proceeds,0)
  current = false
  await run()
  assert.doesNotMatch(app.innerHTML,/legal-acceptance-form/)
})

test('unpublished Owner entry proceeds without acceptance even when bundled configuration is unfinished', async () => {
  let proceeds = 0
  const app = {innerHTML:''}
  const ctx = functions('src/legal/acceptance.js',{
    metadata,document:{getElementById:()=>app},
    readLegalStatus:async()=>({...versions,published:false,accepted:false}),
    legalConfigurationReady:()=>false,
    acceptLegalTerms:()=>{throw Error('must not accept')},
  })
  await ctx.ensureOwnerAcceptance({}, {employee:{role:'Business Owner'}},()=>proceeds++,()=>{})
  assert.equal(proceeds,1)
  assert.doesNotMatch(app.innerHTML,/legal-acceptance-form/)
})

test('public reader hides unpublished or unfinished contracts and suppresses optional placeholders', async () => {
  const providers = [{provider:'Test provider',purpose:'Hosting',location:'Confirmed region',reference:'https://example.com',status:'Reviewed'}]
  const ctx = functions('src/legal/readiness.js',{metadata:draftMetadata,subprocessors:providers,AbortSignal})
  const source = '# Terms\n\n{{ENTITY}} {{DPO}} {{EU_REP}} {{UK_REP}} {{SUBPROCESSORS}}'
  assert.equal(ctx.customerDocument('terms',source,versions).finalized,false)
  const configured = structuredClone(metadata)
  for (const key of configured.requiredCompanyFields) configured.company[key] = 'Reviewed value for ' + key
  configured.subprocessorScheduleReviewed = true
  assert.equal(ctx.customerDocument('terms',source,{...versions,published:false},configured,providers).finalized,false)
  const result = ctx.customerDocument('terms',source,versions,configured,providers)
  assert.equal(result.finalized,true)
  assert.doesNotMatch(result.text,/\{\{|\[DPO|\[EU REPRESENTATIVE|\[UK REPRESENTATIVE/)
  assert.match(result.text,/Not listed; contact/)
  assert.equal(ctx.customerDocument('terms',source+' {{UNKNOWN}}',versions,configured,providers).finalized,false)
  assert.equal(ctx.customerDocument('terms',source+' [PLACEHOLDER: UNKNOWN]',versions,configured,providers).finalized,false)
  const sameEmail = structuredClone(configured)
  sameEmail.company.PRIVACY_EMAIL = sameEmail.company.LEGAL_EMAIL.toUpperCase()
  assert.equal(ctx.legalConfigurationReady(sameEmail,providers),false)
  for (const key of ['terms','privacy','dpa']) {
    const unfinished = structuredClone(configured)
    unfinished.documents[key].version = draftMetadata.documents[key].version
    assert.equal(ctx.legalConfigurationReady(unfinished,providers),false)
  }
  assert.equal(ctx.customerDocument('guide','# Guide',null).text,'# Guide')
  assert.equal(await ctx.readPublicPublication('https://example.com','key',async()=>{throw Error('offline')}),null)
  assert.notEqual(metadata.company.ENTITY,PROJECT_OWNER_NAME)
  assert.equal(ctx.customerDocument('guide','# {{PRODUCT_NAME}} / {{SHORT_BRAND_NAME}}',null).text,'# RetraSell POS / RetraSell')
  assert.ok(!('productBrand' in draftMetadata) && !('shortProductBrand' in draftMetadata))
  for (const path of ['docs/legal/TERMS_OF_SERVICE.md','docs/legal/PRIVACY_NOTICE.md','docs/legal/DATA_PROCESSING_ADDENDUM.md']) {
    assert.doesNotMatch(read(path),/\u00e2\u20ac|\u00c3[\u0080-\u00bf]|\ufffd/)
  }
})

test('unpublished Settings exposes no contracts; direct legal URL redirects to Help without rendering draft', async () => {
  const settings = functions('src/legal/acceptance.js', {metadata,legalLinks,esc:escapeHTML,
    versionsMatch:()=>true,legalConfigurationReady:()=>true})
  for (const status of [null,{...versions,published:false}]) {
    assert.doesNotMatch(settings.legalSettingsHTML(status,true), /href=|PLACEHOLDER|being finalized/)
  }
  for (const doc of ['terms','privacy','dpa','guide']) {
    let redirect = null
    const page = {innerHTML:''}
    const ctx = functions('src/legal/readiness.js', {
      metadata:draftMetadata,subprocessors:[],AbortSignal,URLSearchParams,
      location:{search:'?doc='+doc,replace:value=>{redirect=value}},
      document:{documentElement:{dataset:{}},getElementById:()=>page},
      localStorage:{getItem:()=>null},renderDocument,esc:escapeHTML,
      terms:'# PRIVATE DRAFT',privacy:'# PRIVATE DRAFT',dpa:'# PRIVATE DRAFT',guide:'# Guide',quickStart:'# Quick Start',
      env:{},
    })
    vm.runInContext(read('src/legal/page.js').replace(/^import .*$/gm,'').replaceAll('import.meta.env','env').replace('void showPage()','globalThis.ready = showPage()'),ctx)
    await ctx.ready
    if (doc === 'guide') {
      assert.equal(redirect,null)
      assert.match(page.innerHTML, /Guide/)
      assert.doesNotMatch(page.innerHTML, /doc=terms|doc=privacy|doc=dpa|PRIVATE DRAFT|PLACEHOLDER/)
    } else {
      assert.equal(redirect,'/legal.html?doc=guide')
      assert.equal(page.innerHTML,'')
    }
  }
})

test('business decisions remain unpublished, Pakistan-focused and free of invented caps or identities', () => {
  const terms = read('docs/legal/TERMS_OF_SERVICE.md')
  assert.match(terms,/ABCD Ventures is the Parent Company \(Holding Company\) that owns this sole proprietorship\./)
  assert.match(terms,/due immediately upon invoice/)
  assert.match(terms,/3 Working Days/)
  assert.doesNotMatch(terms,/LIABILITY_CAP|SUBPROCESSOR_NOTICE|OrbitoShop|\bOrbito\b/)
  assert.equal(draftMetadata.company.TAX_NUMBER,'5842096')
  assert.equal(draftMetadata.company.REGISTRATION,'5842096')
  assert.equal(draftMetadata.company.GOVERNING_LAW,'Pakistan')
  assert.equal(draftMetadata.company.COURTS,'Gujranwala, Punjab, Pakistan')
  assert.equal(draftMetadata.company.EXPORT_WINDOW,'30 days after cancellation or termination')
  assert.equal(draftMetadata.company.ENTITY,'[PLACEHOLDER: OFFICIAL_LEGAL_BUSINESS_NAME]')
  assert.equal(draftMetadata.subprocessorScheduleReviewed,false)
  const ctx = functions('src/legal/readiness.js',{metadata:draftMetadata,subprocessors:[],AbortSignal})
  assert.match(ctx.customerDocument('guide',read('docs/user-guide/ORBITOSHOP_USER_GUIDE.md'),null).text, /Feature availability: This guide covers features available across RetraSell POS plans\. Some features may not be available to your account depending on your subscription, enabled modules, business configuration, or supported services in your region\./)
})

test('current enterApplication completes Onboarding V2 before legal and keeps normal routing behind the gate', async () => {
  const main = read('src/main.js')
  const source = main.slice(main.indexOf('async function enterApplication(session)'),main.indexOf('async function onLoginSuccess(session)'))
    .replace(/await import\('([^']+)'\)/g, "await importModule('$1')")
  const calls = [], routes = new Map()
  let finishOnboarding, allowLegal = true
  const CFG = {onboarding_version:2,onboarding_completed_at:null,ems_enabled:false}
  const ctx = vm.createContext({
    CFG,state:{role:null},sb:{},applicationGeneration:0,canonicalRole:s=>s.employee.role,needsOnboarding,
    clearRoutes(){calls.push('clear');routes.clear()},registerRoute:(path,fn)=>routes.set(path,fn),registerNotFound(){},
    navigate:path=>calls.push(path),startRouter:()=>calls.push('router'),
    setupRoutes:()=>calls.push('routes'),routeForRole:()=>calls.push('normal'),_clearSession(){},showLogin(){},
    async importModule(path){
      assert.equal(path,'./onboarding.js')
      return {renderOnboarding(_session,done){calls.push('wizard');finishOnboarding=done}}
    },
    async ensureOwnerAcceptance(_client,_session,proceed,_logout,current){
      calls.push('legal');assert.ok(current());assert.ok(CFG.onboarding_completed_at)
      if (allowLegal) await proceed()
    },
  })
  vm.runInContext(source,ctx)
  const owner = {employee:{role:'Business Owner'}}
  await ctx.enterApplication(owner)
  assert.deepEqual(calls,['clear','/onboarding','router'])
  routes.get('/onboarding')()
  assert.equal(calls.at(-1),'wizard')
  CFG.onboarding_completed_at = '2026-10-02T00:00:00Z'
  await finishOnboarding()
  assert.deepEqual(calls.slice(-5),['clear','legal','routes','normal','router'])
  allowLegal = false;calls.length = 0
  await ctx.enterApplication(owner)
  assert.deepEqual(calls,['clear','legal'],'unavailable legal status cannot install application routes')
  assert.match(main,/activate|loadCurrentSession/)
  assert.match(main,/location.pathname === '\/invite\/accept'/)
  assert.match(main,/if \(!await loadConfig\(false\)\)/)
})
