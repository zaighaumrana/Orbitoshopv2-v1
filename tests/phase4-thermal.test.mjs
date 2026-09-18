import test from 'node:test'
import assert from 'node:assert/strict'
import { measureThermal } from '../src/platform/thermal.js'

test('thermal 80mm length is integer CSS conversion plus calibrated feed; copies multiply', () => {
  const one = measureThermal(960)
  assert.equal(one.estimated_mm, 260)
  assert.equal(one.paper_width_mm, 80)
  assert.equal(one.measurement_status, 'estimated')
  assert.equal(measureThermal(960, 3).estimated_mm, 780)
})
test('unavailable thermal measurement never becomes zero', () => {
  for (const height of [0, NaN, Infinity, -1]) {
    assert.equal(measureThermal(height).estimated_mm, null)
    assert.equal(measureThermal(height).measurement_status, 'unavailable')
  }
  assert.equal(measureThermal(960, 1, false).estimated_mm, null)
  for (const copies of [0, -1, 1.5, 21]) assert.throws(() => measureThermal(100, copies))
})
