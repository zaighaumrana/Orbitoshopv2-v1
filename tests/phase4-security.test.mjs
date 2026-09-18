import test from 'node:test'
import assert from 'node:assert/strict'
import {escapeHTML,safeImageURL} from '../src/html.js'
import {generateTempPassword} from '../src/security/password.js'

test('S1 encodes script and attribute-breakout text',()=>{
  assert.equal(escapeHTML('<script>alert(1)</script>'),'&lt;script&gt;alert(1)&lt;/script&gt;')
  assert.equal(escapeHTML('\"><img src=x onerror=alert(1)>'),'&quot;&gt;&lt;img src=x onerror=alert(1)&gt;')
  assert.equal(escapeHTML("&\"'"),'&amp;&quot;&#39;')
})
test('S1 image URLs reject executable and arbitrary data protocols',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','data:image/svg+xml,<svg onload=alert(1)>','//evil.example/img'])assert.equal(safeImageURL(url),'')
  assert.equal(safeImageURL('https://example.com/logo.png'),'https://example.com/logo.png')
})
test('S9 passwords meet policy without Math.random',()=>{
  const original=Math.random;Math.random=()=>{throw new Error('Insecure RNG used')}
  try {for(let i=0;i<500;i++){
    const p=generateTempPassword();assert.equal(p.length,10)
    assert.match(p,/[A-Za-z]/);assert.match(p,/[0-9]/);assert.match(p,/[!@#$%]/)
  }} finally {Math.random=original}
})
