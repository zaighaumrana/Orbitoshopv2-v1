import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { renderDocument } from '../src/legal/render.js'
import { legalLinks } from '../src/legal/links.js'
import { escapeHTML } from '../src/html.js'

const read = path => readFileSync(new URL('../' + path, import.meta.url),'utf8')
const metadata = JSON.parse(read('src/legal/metadata.json'))
const versions = {published:true,required_revision:metadata.requiredRevision,terms_version:'1.0',privacy_version:'1.0',dpa_version:'1.0'}
function functions(path, context) {
  const ctx = vm.createContext({legalConfigurationReady:()=>true, finalizingMessage:'Legal documents are being finalized.', ...context})
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

test('public documents render safely from canonical Markdown; login links need no auth', () => {
  for (const path of ['docs/legal/TERMS_OF_SERVICE.md','docs/legal/PRIVACY_NOTICE.md','docs/legal/DATA_PROCESSING_ADDENDUM.md','docs/user-guide/ORBITOSHOP_USER_GUIDE.md','docs/user-guide/QUICK_START_GUIDE.md']) {
    const result = renderDocument(read(path).replace(/\r/g,''))
    assert.match(result.body,/<h1 /)
    assert.ok(result.contents.length >= 5)
    for (const [,key] of read(path).matchAll(/\{\{([A-Z_]+)\}\}/g)) assert.ok(key === 'SUBPROCESSORS' || key in metadata.company)
  }
  assert.doesNotMatch(renderDocument('# <script>alert(1)</script>').body,/<script>/)
  assert.match(renderDocument('# Title\r\n\r\n## Section\r\n').body,/<h2 /)
  for (const doc of ['terms','privacy','dpa','guide']) assert.ok(legalLinks().includes('?doc='+doc))
  assert.match(read('src/auth.js'),/\$\{legalLinks\(\)\}/)
  assert.doesNotMatch(read('src/legal/page.js'),/shared\.js|supabase|turnstile|ghost-fibers/)
  assert.match(read('legal.html'),/src\/legal\/page.js/)
  assert.match(read('vite.config.js'),/legal: 'legal.html'/)
})

test('Owner status failure or mismatched versions cannot continue; detached session cannot render', async () => {
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
  assert.match(app.innerHTML,/checkbox" required disabled/)
  assert.equal(proceeds,0)
  failure = true
  await run()
  assert.match(app.innerHTML,/Unavailable/)
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
  const ctx = functions('src/legal/readiness.js',{metadata,subprocessors:providers,AbortSignal})
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
  assert.equal(ctx.customerDocument('guide','# Guide',null).text,'# Guide')
  assert.equal(await ctx.readPublicPublication('https://example.com','key',async()=>{throw Error('offline')}),null)
  assert.notEqual(metadata.company.ENTITY,metadata.projectOwner)
  for (const path of ['docs/legal/TERMS_OF_SERVICE.md','docs/legal/PRIVACY_NOTICE.md','docs/legal/DATA_PROCESSING_ADDENDUM.md']) {
    assert.doesNotMatch(read(path),/\u00e2\u20ac|\u00c3[\u0080-\u00bf]|\ufffd/)
  }
})
