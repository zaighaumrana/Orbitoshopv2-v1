import { escapeHTML as esc } from '../html.js'
import { legalLinks } from './links.js'
import { readLegalStatus, acceptLegalTerms, versionsMatch } from './api.js'
import metadata from './metadata.json'
import { legalConfigurationReady } from './readiness.js'
import './legal.css'

// Only the canonical Owner contracts for the Shop. Staff and Support never accept.
export async function ensureOwnerAcceptance(client, session, proceed, logout, isCurrent = () => true) {
  if (session.employee?.role !== 'Business Owner') { if (isCurrent()) await proceed(); return }
  const app = document.getElementById('app')
  app.innerHTML = '<main class="legal-shell"><p role="status">Checking agreement status…</p></main>'
  let status
  try { status = await readLegalStatus(client) } catch {}
  if (!isCurrent()) return
  if (status?.published === false) { await proceed(); return }
  const unavailable = (title, message) => {
    app.innerHTML = `<main class="card legal-shell" style="max-width:480px;margin:8vh auto;padding:28px"><h1 tabindex="-1">${esc(title)}</h1><p role="status">${esc(message)}</p><div class="legal-links"><button id="legal-retry" class="primary-button">Retry</button><button id="legal-signout" class="secondary-button">Sign out</button></div></main>`
    const root = app.firstElementChild
    root.querySelector('h1').focus()
    root.querySelector('#legal-signout').onclick = logout
    root.querySelector('#legal-retry').onclick = async () => {
      const button = root.querySelector('#legal-retry')
      if (button.disabled || !isCurrent()) return
      button.disabled = true
      await ensureOwnerAcceptance(client, session, proceed, logout, isCurrent)
    }
  }
  if (status?.published !== true || typeof status.accepted !== 'boolean') {
    unavailable('Agreement status unavailable', 'Your account is signed in, but service status could not be checked. Reconnect and retry.')
    return
  }
  const matching = status?.published === true && versionsMatch(status) && legalConfigurationReady()
  if (!matching) {
    unavailable('Agreement configuration unavailable', 'The service configuration could not be confirmed. Reload or contact support, then retry.')
    return
  }
  if (status.accepted === true) { await proceed(); return }
  app.innerHTML = `<main class="legal-shell legal-acceptance">
    <h1 tabindex="-1">Your business agreement</h1>
    <p>By continuing, I confirm that I am authorized to act for this business and agree to the Service's Terms of Service, Privacy Notice and Data Processing Terms.</p>
    ${legalLinks()}<p>Terms v${esc(metadata.documents.terms.version)} · Privacy v${esc(metadata.documents.privacy.version)} · Data Processing v${esc(metadata.documents.dpa.version)}</p>
    <p class="muted">Review each document before accepting. Privacy acknowledgment is not blanket consent for data processing. You may sign out without accepting.</p>
    <form id="legal-acceptance-form">
      <label class="legal-consent"><input name="authorized" type="checkbox" required> I am authorized to accept these terms for this business.</label>
      <p id="legal-acceptance-error" role="alert"></p>
      <button class="primary-button" type="submit">Accept and continue</button>
    </form>
    <div class="legal-links"><button class="secondary-button" id="legal-retry">Reload status</button><button class="secondary-button" id="legal-signout">Sign out</button></div>
  </main>`
  const root = app.firstElementChild
  root.querySelector('h1').focus()
  root.querySelector('#legal-signout').onclick = logout
  root.querySelector('#legal-retry').onclick = () => {
    if (!busy) void ensureOwnerAcceptance(client, session, proceed, logout, isCurrent)
  }
  let busy = false
  root.querySelector('form').onsubmit = async event => {
    event.preventDefault()
    if (busy || !matching || !isCurrent()) return
    const form = event.currentTarget
    const errorEl = root.querySelector('#legal-acceptance-error')
    if (!form.elements.authorized.checked) { errorEl.textContent = 'Confirm your authority before continuing.'; return }
    busy = true
    form.querySelector('button').disabled = true
    root.querySelector('#legal-retry').disabled = true
    errorEl.textContent = ''
    try {
      await acceptLegalTerms(client, true)
      if (root.isConnected && isCurrent()) await proceed()
    } catch (error) {
      if (root.isConnected) errorEl.textContent = error.message
    } finally {
      busy = false
      if (root.isConnected) {
        form.querySelector('button').disabled = false
        root.querySelector('#legal-retry').disabled = false
      }
    }
  }
}

export function legalSettingsHTML(status, owner) {
  if (status?.published !== true || !versionsMatch(status) || !legalConfigurationReady()) {
    return '<section class="card"><h2>Legal &amp; Privacy</h2><p>No published legal documents are currently available here.</p></section>'
  }
  const receipt = status?.receipt
  return `<section class="card"><h2>Legal &amp; Privacy</h2>${legalLinks()}
    <p>Current Terms: v${esc(metadata.documents.terms.version)} · Privacy: v${esc(metadata.documents.privacy.version)} · Data Processing: v${esc(metadata.documents.dpa.version)}</p>
    ${owner ? receipt ? `<p>Accepted by: ${esc(receipt.accepted_name)}<br>Accepted on: ${esc(new Date(receipt.accepted_at).toLocaleString())}</p><p>Accepted versions: Terms ${esc(receipt.terms_version)}, Privacy ${esc(receipt.privacy_version)}, Data Processing ${esc(receipt.dpa_version)}.</p>`
      : '<p>No acceptance record available. An unavailable status is not evidence of acceptance.</p>' : '<p>Business agreement evidence is available to the Business Owner.</p>'}
    ${owner && status && !versionsMatch(status) ? '<p role="status">Server policy and this application differ. Reload or contact support.</p>' : ''}
  </section>`
}
