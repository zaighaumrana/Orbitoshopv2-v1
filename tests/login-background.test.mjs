import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

test('login background skips reduced motion, tolerates missing WebGL, and disposes resources once', () => {
  const source = readFileSync(new URL('../src/features/login/ghost-fibers.js', import.meta.url), 'utf8')
  let reduced = true, contexts = 0, removed = 0, released = 0, cancelled = 0, cleared = 0
  const listeners = new Map()
  const eventTarget = {
    addEventListener(key, fn) { listeners.set(key, fn) },
    removeEventListener(key) { listeners.delete(key) },
  }
  const gl = new Proxy({
    getShaderParameter:()=>true, getProgramParameter:()=>true,
    getExtension:()=>({loseContext(){ released++ }}),
  }, {get(target,key){ return target[key] ?? (()=>({})) }})
  let available = false
  const canvas = {...eventTarget, setAttribute(){}, remove(){removed++}, getContext(){contexts++; return available ? gl : null}}
  const context = vm.createContext({
    window:{...eventTarget,matchMedia:()=>({...eventTarget,matches:reduced})},
    document:{...eventTarget,hidden:false,createElement:()=>canvas},
    performance:{now:()=>0}, Float32Array,
    requestAnimationFrame:()=>1, cancelAnimationFrame(){cancelled++},
    setTimeout:()=>1, clearTimeout(){cleared++},
  })
  vm.runInContext(source.replace('export function', 'function')+'\nglobalThis.mount = mountGhostFibers', context)
  const container = {isConnected:true,clientWidth:800,clientHeight:600,appendChild(){},classList:{add(){},remove(){}}}
  context.mount(container)()
  assert.equal(contexts,0)
  reduced = false
  context.mount(container)()
  assert.equal(contexts,1)
  available = true
  const cleanup = context.mount(container)
  assert.equal(canvas.width,800)
  assert.equal(canvas.height,600)
  assert.ok(listeners.has('resize'))
  cleanup()
  const counts = [removed,released,cancelled,cleared]
  cleanup()
  assert.deepEqual([removed,released,cancelled,cleared],counts)
  assert.equal(released,1)
  assert.equal(listeners.size,0)
})
