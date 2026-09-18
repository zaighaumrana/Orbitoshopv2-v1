import test from 'node:test'
import assert from 'node:assert/strict'
import { installNumericInputValidation } from '../src/numeric-input.js'

test('document numeric keydown ignores missing/non-string keys without weakening validation', () => {
  const installKey = Symbol.for('orbitoshop.numericInputValidation')
  const saved = Object.fromEntries(['document', 'window', 'HTMLInputElement'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const installed = globalThis[installKey]
  const handlers = new Map()
  let feedback = 0
  class Input {
    dataset = { numeric: 'digits' }
    getBoundingClientRect() { return { bottom: 20, top: 0, left: 0 } }
  }
  try {
    delete globalThis[installKey]
    globalThis.HTMLInputElement = Input
    globalThis.document = {
      addEventListener(type, callback) { handlers.set(type, callback) },
      createElement() { return { style: {}, setAttribute() {}, remove() {} } },
      body: { append() { feedback++ } },
    }
    globalThis.window = { innerHeight: 800, innerWidth: 1000, setTimeout() { return 0 } }
    installNumericInputValidation()
    const handler = handlers.get('keydown')
    assert.equal(typeof handler, 'function')
    const dispatch = properties => {
      const event = { target: new Input(), prevented: false, preventDefault() { this.prevented = true }, ...properties }
      handler(event)
      return event.prevented
    }
    // Generic/synthetic keydown events need not carry KeyboardEvent.key.
    for (const properties of [{}, { key: undefined }, { key: null }, { key: 1 }, { key: {} }]) {
      assert.equal(dispatch(properties), false)
    }
    for (const key of ['0', '9', '', 'Enter', 'Backspace', 'ArrowLeft']) assert.equal(dispatch({ key }), false)
    assert.equal(dispatch({ key: 'v', ctrlKey: true }), false)
    assert.equal(dispatch({ key: 'a', isComposing: true }), false)
    assert.equal(feedback, 0)
    assert.equal(dispatch({ key: 'a' }), true)
    assert.equal(feedback, 1)
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
    if (installed === undefined) delete globalThis[installKey]
    else globalThis[installKey] = installed
  }
})
