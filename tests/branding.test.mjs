import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as brand from '../src/config/brand.js'
import { escapeHTML, safeImageURL } from '../src/html.js'
import config from '../vite.config.js'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('public brand, project attribution and unresolved legal entity are distinct', () => {
  assert.equal(brand.PRODUCT_NAME, 'OrbitoShop')
  assert.equal(brand.SHORT_BRAND_NAME, 'Orbito')
  assert.equal(brand.PROJECT_OWNER_NAME, 'ABCD Ventures')
  assert.equal(brand.PROJECT_ATTRIBUTION, 'A project of ABCD Ventures')
  assert.equal(brand.LEGAL_ENTITY_NAME, null)
})

test('login copy uses configured brand while tenant title/logo and auth controls remain separate', () => {
  const source = read('src/auth.js')
  const template = source.slice(source.indexOf('app.innerHTML = `') + 'app.innerHTML = '.length,
    source.indexOf('// Turnstile is required')).trim()
  const html = vm.runInNewContext(template, { ...brand, escapeHTML, safeImageURL,
    CFG: { shop_name: 'Merchant & Sons', shop_address: 'Shop street', shop_logo: '' } })
  assert.match(html, /Merchant &amp; Sons/)
  assert.match(html, /OrbitoShop<br>A project of ABCD Ventures/)
  assert.match(html, /Orbito Support/)
  assert.doesNotMatch(html, /null|LEGAL_ENTITY_NAME/)
  for (const id of ['login-email', 'login-password', 'login-btn', 'forgot-btn', 'cf-turnstile-wrap', 'support-access-btn']) {
    assert.match(html, new RegExp(`id="${id}"`))
  }
  const tenant = read('src/shared.js').split('export function currentTenant()')[1].split('\n}')[0]
  assert.match(tenant, /name:\s+CFG.shop_name/)
  assert.doesNotMatch(tenant, /PRODUCT_NAME|SHORT_BRAND_NAME|PROJECT_OWNER_NAME/)
  assert.doesNotMatch(read('src/print/print.js'), /config\/brand|PRODUCT_NAME/)
})

test('HTML title and dev/build manifest derive names from the same config', () => {
  const plugin = config.plugins.find(p => p.name === 'product-branding')
  const html = plugin.transformIndexHtml.handler(read('index.html'))
  assert.ok(html.includes(`<title>${escapeHTML(brand.PRODUCT_NAME)}</title>`))
  assert.doesNotMatch(html, /%PRODUCT_NAME%/)
  let asset, middleware, served, contentType, next = false
  plugin.generateBundle.call({ emitFile: value => { asset = value } })
  plugin.configureServer({ middlewares: { use: fn => { middleware = fn } } })
  middleware({ url: '/manifest.webmanifest?test=1' }, {
    setHeader: (_name, value) => { contentType = value }, end: value => { served = value },
  }, () => assert.fail('Manifest was not served'))
  assert.equal(contentType, 'application/manifest+json')
  assert.equal(served, asset.source)
  const manifest = JSON.parse(served)
  assert.equal(manifest.name, brand.PRODUCT_NAME)
  assert.equal(manifest.short_name, brand.SHORT_BRAND_NAME)
  assert.equal(manifest.start_url, '/')
  middleware({ url: '/other' }, {}, () => { next = true })
  assert.equal(next, true)
})
