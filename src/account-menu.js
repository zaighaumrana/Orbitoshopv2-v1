// Header account dropdown: look, placement and open/close behaviour only.
// Every item reuses an existing data-action, so POS, Workshop and Admin keep their own handlers.
import { escapeHTML } from './html.js'
import { state, CFG } from './shared.js'
import { profileIcon } from './profile-icon.js'
import { onPrivateReset } from './ui-authority.js'

let open = false
onPrivateReset(() => { open = false })

const svg = (paths, size = 18, cls = 'rs-menu-icon') =>
  `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`

const ICON = {
  user:     svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  key:      svg('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9"/><path d="m16 7 3 3"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'),
  help:     svg('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
  moon:     svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  clock:    svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  logout:   svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'),
  chevron:  svg('<path d="m6 9 6 6 6-6"/>', 14, 'rs-account-chevron'),
}

const item = (action, icon, label, { danger = false, keepOpen = false, role = 'menuitem', checked } = {}) =>
  `<button type="button" role="${role}"${checked === undefined ? '' : ` aria-checked="${checked}"`} class="rs-menu-item${danger ? ' is-danger' : ''}" data-action="${action}"${keepOpen ? ' data-keep-open' : ''}>${icon}<span>${label}</span>${role === 'menuitemcheckbox' ? '<span class="rs-switch" aria-hidden="true"></span>' : ''}</button>`

// Menu item that moves to another in-app route (handled in the click listener below).
const navItem = (path, icon, label) =>
  `<button type="button" role="menuitem" class="rs-menu-item" data-nav="${path}">${icon}<span>${label}</span></button>`

export function accountMenuHTML({ session, shop = '', leave = false, clockOut = false } = {}) {
  const emp = session?.employee || {}
  const name = emp.name || ''
  const role = emp.role || ''
  const ownerLike = session?.isAdmin === true || role === 'Business Owner'
  const support = session?.isSupportAdmin === true
  const ems = CFG.ems_enabled === true && !ownerLike
  const initials = (name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => Array.from(w)[0]).join('') || '?').toUpperCase()

  const account = [
    ownerLike
      ? navItem('/admin/settings?tab=security', ICON.user, 'My Account')
      : '',
    !ownerLike && !support ? item('change-password', ICON.key, 'Change Password') : '',
    ems && leave ? item('open-leave-request', ICON.calendar, 'Request Leave') : '',
    state.installPrompt ? item('install', ICON.download, 'Install App') : '',
    `<a role="menuitem" class="rs-menu-item" href="/legal.html?doc=guide" target="_blank" rel="noopener">${ICON.help}<span>Help &amp; User Guide</span></a>`,
  ].join('')

  return `<div class="rs-account-menu" id="rs-account-menu" data-open="${open}">
    <button type="button" id="rs-account-trigger" class="icon-button rs-account-trigger" data-action="account-menu" aria-haspopup="menu" aria-expanded="${open}" aria-controls="rs-account-panel" aria-label="Account menu" title="Account menu">${profileIcon}${ICON.chevron}</button>
    <div class="rs-account-panel" id="rs-account-panel">
      <div class="rs-menu-identity">
        <span class="rs-menu-avatar" aria-hidden="true">${escapeHTML(initials)}</span>
        <div class="rs-menu-who"><strong>${escapeHTML(name)}</strong><span>${escapeHTML(role)}${shop ? ' · ' + escapeHTML(shop) : ''}</span></div>
      </div>
      <div role="menu" aria-labelledby="rs-account-trigger">
        <div class="rs-menu-label" role="presentation">Account</div>
        ${account}
        <div class="rs-menu-sep" role="separator"></div>
        <div class="rs-menu-label" role="presentation">Preferences</div>
        ${item('theme', ICON.moon, 'Dark mode', { role: 'menuitemcheckbox', checked: state.theme === 'dark', keepOpen: true })}
        <div class="rs-menu-sep" role="separator"></div>
        <div class="rs-menu-label" role="presentation">Session</div>
        ${ems && clockOut ? item('ems-clock-out', ICON.clock, 'Clock out') : ''}
        ${item('logout', ICON.logout, 'Log out', { danger: true })}
      </div>
    </div>
  </div>`
}

/** Dedicated popup for Manager / Cashier / Technician. Same form and handler as My Account used. */
export function changePasswordModalHTML() {
  return `<div class="modal-backdrop"><div class="modal" style="max-width:420px">
    <h2>Change Password</h2>
    <form data-form="change-password">
      <div class="form-grid">
        <label class="field"><span>Current Password</span><input name="oldPassword" type="password" required autocomplete="current-password"></label>
        <label class="field"><span>New Password</span><input name="newPassword" type="password" required autocomplete="new-password"></label>
        <label class="field"><span>Confirm New Password</span><input name="confirmPassword" type="password" required autocomplete="new-password"></label>
      </div>
      <div id="change-password-error" class="hidden" style="color:var(--danger);font-size:13px;margin:8px 0"></div>
      <div class="modal-actions">
        <button type="button" class="secondary-button" data-close>Close</button>
        <button class="primary-button">Update Password</button>
      </div>
    </form>
  </div></div>`
}

/* ── Open / close behaviour: one set of listeners for all three views ── */
function apply(focusTrigger = false) {
  const root = document.getElementById('rs-account-menu')
  if (!root) return
  root.dataset.open = String(open)
  const trigger = root.querySelector('#rs-account-trigger')
  trigger?.setAttribute('aria-expanded', String(open))
  if (focusTrigger) trigger?.focus({ preventScroll: true })
}

function setOpen(next, { focusTrigger = false, focusFirst = false } = {}) {
  open = next
  apply(focusTrigger)
  if (open && focusFirst) document.querySelector('#rs-account-panel .rs-menu-item')?.focus({ preventScroll: true })
}

if (!window.__rsAccountMenu) {
  window.__rsAccountMenu = true

  // Capture phase: the menu closes (and focus returns to the trigger) BEFORE a view's own
  // handler opens a dialog, so the dialog remembers the trigger as its opener.
  document.addEventListener('click', event => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('#rs-account-trigger')) {
      event.stopPropagation()
      setOpen(!open, { focusFirst: !open && event.detail === 0 })
      return
    }
    if (!open) return
    const menuItem = target.closest('#rs-account-panel .rs-menu-item')
    if (menuItem) {
      const path = menuItem.getAttribute('data-nav')
      if (path) {
        event.stopPropagation()
        setOpen(false)
        import('./router.js').then(({ navigate }) => navigate(path))
        return
      }
      if (!menuItem.hasAttribute('data-keep-open')) setOpen(false, { focusTrigger: true })
      return
    }
    if (!target.closest('#rs-account-menu')) setOpen(false)
  }, true)

  document.addEventListener('keydown', event => {
    if (!open) return
    const panel = document.getElementById('rs-account-panel')
    if (!panel) return
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation()
      setOpen(false, { focusTrigger: true }); return
    }
    if (event.key === 'Tab') { setOpen(false); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = [...panel.querySelectorAll('.rs-menu-item')]
    if (!items.length) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement)
    let next
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else if (event.key === 'ArrowDown') next = index < 0 ? 0 : (index + 1) % items.length
    else next = index <= 0 ? items.length - 1 : index - 1
    items[next].focus({ preventScroll: true })
  }, true)
}
