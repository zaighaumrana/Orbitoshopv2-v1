import test from 'node:test'
import assert from 'node:assert/strict'
import { blockingErrorCopy } from '../src/blocking-error.js'

test('over-advance uses plain requested wording for local and server failures', () => {
  for (const prefix of ['', 'Error placing order: ']) {
    assert.deepEqual(blockingErrorCopy(prefix+'Initial payment cannot exceed the repair invoice.'), {
      title:'Payment Too High', message:'The advance cannot be more than the repair total. Enter a smaller amount.',
    })
  }
})
test('other failures retain actionable detail and remove generic error prefixes', () => {
  assert.deepEqual(blockingErrorCopy('Delivery error: Payment is required.'), {
    title:'Unable to Continue', message:'Payment is required.',
  })
  assert.equal(blockingErrorCopy('Cash received is less than the sale total. Use Udhar for an unpaid balance.').title, 'Incomplete Cash Payment')
})
