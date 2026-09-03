/* ═══════════════════════════════════════════════════════════════════
   RetailOS — router.js
   Lightweight History API router. No dependencies.
   Centralized navigation — modules call navigate(), never history directly.
═══════════════════════════════════════════════════════════════════ */

import { dlog, dstack, callerInfo } from './debuglog.js'

const routes = new Map()
let notFoundHandler = null
let currentPath = null

/**
 * Register a route.
 * @param {string} path - e.g. '/admin/inventory' or '/admin/repairs/:id'
 * @param {Function} handler - called with (params, query)
 */
export function registerRoute(path, handler) {
  routes.set(path, handler)
}

export function registerNotFound(handler) {
  notFoundHandler = handler
}

/**
 * Navigate to a path. Pushes history unless already on that path.
 * @param {string} path
 * @param {object} options - { replace: boolean } to use replaceState instead
 */
export function navigate(path, options = {}) {
  dstack('router.navigate', `ENTRY path=${path} opts=${JSON.stringify(options)} currentPath=${currentPath}`)
  const url = new URL(path, window.location.origin)
  const pathname = url.pathname

  if (pathname === currentPath && !options.force) {
    // Already here — just re-resolve (e.g. query string changed)
    dlog('router.navigate', `SAME-PATH re-resolve pathname=${pathname}`)
    resolve(pathname, url.search)
    return
  }

  if (options.replace) {
    dlog('router.navigate', `history.replaceState -> ${path}`)
    history.replaceState({}, '', path)
  } else {
    dlog('router.navigate', `history.pushState -> ${path}`)
    history.pushState({}, '', path)
  }
  resolve(pathname, url.search)
}

/**
 * Match a pathname against registered routes, supporting :param segments.
 */
function matchRoute(pathname) {
  // Exact match first
  if (routes.has(pathname)) {
    return { handler: routes.get(pathname), params: {} }
  }
  // Param match
  for (const [routePath, handler] of routes.entries()) {
    if (!routePath.includes(':')) continue
    const routeParts = routePath.split('/').filter(Boolean)
    const pathParts  = pathname.split('/').filter(Boolean)
    if (routeParts.length !== pathParts.length) continue
    const params = {}
    let matched = true
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = pathParts[i]
      } else if (routeParts[i] !== pathParts[i]) {
        matched = false; break
      }
    }
    if (matched) return { handler, params }
  }
  return null
}

function parseQuery(search) {
  const params = new URLSearchParams(search)
  const out = {}
  for (const [k, v] of params.entries()) out[k] = v
  return out
}

function resolve(pathname, search = '') {
  dlog('router.resolve', `ENTRY pathname=${pathname} caller=[${callerInfo()}]`)
  currentPath = pathname
  const match = matchRoute(pathname)
  const query = parseQuery(search)

  if (match) {
    dlog('router.resolve', `MATCHED route -> handler invoked (unawaited)`)
    match.handler(match.params, query)
  } else if (notFoundHandler) {
    dlog('router.resolve', `NOT-FOUND -> calling notFoundHandler`)
    notFoundHandler(pathname)
  } else {
    dlog('router.resolve', `NOT-FOUND and no notFoundHandler registered`)
    console.warn('No route matched:', pathname)
  }
}

/**
 * Call once at boot. Resolves the current URL and listens for back/forward.
 */
let _routerStarted = false
export function startRouter() {
  dlog('router.startRouter', `ENTRY _routerStarted=${_routerStarted} location=${window.location.pathname} caller=[${callerInfo()}]`)
  if (!_routerStarted) {
    _routerStarted = true
    window.addEventListener('popstate', () => {
      dlog('router.popstate', `location=${window.location.pathname}`)
      resolve(window.location.pathname, window.location.search)
    })
  }
    if (currentPath !== window.location.pathname) {
    resolve(
      window.location.pathname,
      window.location.search
    )
  }
}

/**
 * Helper to build a path with query params.
 */
export function buildPath(path, query = {}) {
  const params = new URLSearchParams(query)
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * Get current query params without navigating.
 */
export function getCurrentQuery() {
  return parseQuery(window.location.search)
}
