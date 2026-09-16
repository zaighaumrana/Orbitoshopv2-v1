import test from 'node:test'
import assert from 'node:assert/strict'
import {groupRepairFamilies,repairFamilyWork} from '../src/features/repairs/family.js'
import {snapshotDraft,replaceDraft,getDraft} from '../src/features/pos/repairs/state.js'
import {escapeHTML} from '../src/html.js'

const parent={id:1,components_noted:[{name:'speaker'},{name:'back panel'}],status:'Ready'}
const child={id:2,parent_ticket_id:1,components_noted:[{name:'charging port',tag:'Not Working'}],status:'Pending',labour_cost:100}
test('approved invoice work includes operationally Pending children once without mutating parent',()=>{
  const before=JSON.stringify(parent)
  const work=repairFamilyWork(groupRepairFamilies([parent,child,child])[0])
  assert.deepEqual(work.flatMap(w=>w.components.map(c=>c.name)),['speaker','back panel','charging port'])
  assert.equal(work[1].hasLabour,true)
  assert.equal(JSON.stringify(parent),before)
})
test('pending/declined proposal details are not active work; cancelled child excluded',()=>{
  const family={root:parent,members:[parent,child,{...child,id:3,status:'Cancelled'}],
    proposals:[{decision:'Pending',details:{components:[{name:'camera'}]}},{decision:'Declined',details:{components:[{name:'mic'}]}}]}
  assert.deepEqual(repairFamilyWork(family).flatMap(w=>w.components.map(c=>c.name)),['speaker','back panel','charging port'])
  assert.equal(family.proposals.length,2)
})
test('no-child work unchanged; intentionally repeated names are not collapsed',()=>{
  assert.deepEqual(repairFamilyWork({root:parent,members:[parent]})[0].components,parent.components_noted)
  const repeated={...child,components_noted:[{name:'speaker'},{name:'speaker'}]}
  assert.equal(repairFamilyWork({root:parent,members:[parent,repeated]})[1].components.length,2)
})
test('custom intake component uses normal model and survives draft editing',()=>{
  replaceDraft({components:[{name:'speaker',tag:'Broken',price:10},{name:'charging IC',tag:'Custom',customText:'intermittent',price:20}],labour:0,payments:[],overridePrice:null})
  const saved=snapshotDraft();replaceDraft(saved)
  assert.deepEqual(getDraft().components,saved.components)
  assert.equal(getDraft().components[1].name,'charging IC')
  assert.equal(escapeHTML('<IC & "port">'),'&lt;IC &amp; &quot;port&quot;&gt;')
})
