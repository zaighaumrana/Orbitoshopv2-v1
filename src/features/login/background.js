// Keep the graphics chunk off the critical login path.
export function startLoginBackground(root) {
  let disposed = false
  let disposeGraphics = () => {}
  const observer = new MutationObserver(() => {
    if (!root.isConnected) cleanup()
  })
  function cleanup() {
    if (disposed) return
    disposed = true
    clearTimeout(timer)
    observer.disconnect()
    disposeGraphics()
  }
  const timer = setTimeout(async () => {
    if (disposed || !root.isConnected || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    try {
      const { mountGhostFibers } = await import('./ghost-fibers.js')
      if (!disposed && root.isConnected) disposeGraphics = mountGhostFibers(root.querySelector('.login-fibers'))
    } catch {
      // Failed chunk/WebGL: retain the static background and usable login.
    }
  }, 0)
  observer.observe(root.parentNode, {childList:true})
  return cleanup
}
