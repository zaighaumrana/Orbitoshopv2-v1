import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeNumericValue } from '../src/numeric-input.js'
import { snapshotDraft, replaceDraft, getDraft, resetDraft, updateCartRepairDraft,
  calcDraftTotal, calcDraftPaid } from '../src/features/pos/repairs/state.js'

test('numeric normalization preserves leading zeros, decimals and signed values', () => {
  assert.equal(sanitizeNumericValue('00a123', 'digits'), '00123')
  assert.equal(sanitizeNumericValue('12.50', 'decimal'), '12.50')
  assert.equal(sanitizeNumericValue('-12.50', 'signed-decimal'), '-12.50')
  assert.equal(sanitizeNumericValue('12x.3.4', 'decimal'), '12.34')
  assert.equal(sanitizeNumericValue('12a3', 'integer'), '123')
})

test('cancelled working changes cannot mutate the saved cart draft', () => {
  const saved = snapshotDraft({components:[{name:'Screen',price:100.5}],
    payments:[{amount:30,method:'Cash'}],labour:20.25,overridePrice:null})
  replaceDraft(saved)
  getDraft().components[0].price = 999
  getDraft().payments[0].amount = 999
  resetDraft()
  assert.equal(calcDraftTotal(saved), 120.75)
  assert.equal(calcDraftPaid(saved), 30)
})

test('save updates same cart identity and cannot modify a finalized repair', () => {
  const cart = [{productId:'draft-1',requestId:'request-1',isTicket:true,isNewTicket:true}]
  const draftData = {components:[{name:'Screen',price:120.5}],
    payments:[{amount:30,method:'Cash'}],labour:40.25,overridePrice:null}
  const saved = updateCartRepairDraft(cart, 'draft-1', {
    productId:'other',requestId:'other',customerName:'Edited',draftData})
  assert.equal(cart.length, 1)
  assert.equal(saved.productId, 'draft-1')
  assert.equal(saved.requestId, 'request-1')
  assert.equal(calcDraftTotal(saved.draftData), 160.75)
  draftData.payments[0].amount = 999
  assert.equal(calcDraftPaid(saved.draftData), 30)
  cart[0].isNewTicket = false
  assert.equal(updateCartRepairDraft(cart, 'draft-1', {draftData}), null)
})
