import { sb, CFG, fld, loadConfig, applyBranding, invokeAccountAdmin, _clearSession } from './shared.js'
import { escapeHTML } from './html.js'
import { managedFeatures } from './onboarding-state.js'
import { settingsUpdates } from './settings-data.js'
import { validatePassword } from './shared.js'

export async function acceptInvite(done) {
  const app = document.getElementById('app')
  app.innerHTML = '<main class="card" style="max-width:480px;margin:8vh auto;padding:28px"><h1>Activate your owner account</h1><p role="status">Checking your invitation…</p></main>'
  const hash = new URLSearchParams(location.hash.slice(1))
  const query = new URLSearchParams(location.search)
  const tokens = { access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') }
  const code = query.get('code')
  const failed = hash.has('error') || query.has('error')
  history.replaceState({}, '', '/invite/accept')
  try {
    if (failed) throw new Error('Invitation expired or invalid. Contact your operator for help.')
    let result
    if (tokens.access_token && tokens.refresh_token) result = await sb.auth.setSession(tokens)
    else if (code) result = await sb.auth.exchangeCodeForSession(code)
    else result = await sb.auth.getSession()
    tokens.access_token = tokens.refresh_token = null
    if (result.error || !result.data?.session) throw new Error('Open the invitation email on this device to activate your account.')
    const verified = await sb.auth.getUser()
    if (verified.error || !verified.data.user) throw new Error('Invitation session could not be verified.')
    const { data: owner, error: ownerError } = await sb.rpc('get_owner_invite_context')
    if (ownerError || !owner || owner.owner_email !== verified.data.user.email?.toLowerCase().trim()) {
      throw new Error('This session does not match the reserved Shop owner, or the owner profile is still provisioning. Retry shortly or open the correct invitation.')
    }
    app.innerHTML = `<main class="card" style="max-width:480px;margin:8vh auto;padding:28px"><h1>Create your password</h1><p>Welcome to ${escapeHTML(CFG.shop_name)}. Choose a password for your owner account.</p><form id="invite-password" class="form-grid"><label class="field"><span>New password</span><input name="password" type="password" autocomplete="new-password" required minlength="8"></label><label class="field"><span>Confirm password</span><input name="confirm" type="password" autocomplete="new-password" required></label><p role="alert"></p><button class="primary-button">Activate account</button></form></main>`
    app.querySelector('form').onsubmit = async event => {
      event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button')
      const error = validatePassword(form.elements.password.value) || (form.elements.password.value !== form.elements.confirm.value ? 'Passwords must match.' : '')
      if (error) { form.querySelector('[role="alert"]').textContent = error; return }
      button.disabled = true
      try {
        const { error } = await sb.auth.updateUser({ password: form.elements.password.value })
        if (error) throw new Error('Password could not be saved. Check the Shop password policy and retry.')
        form.reset(); await done()
      } catch (error) { form.querySelector('[role="alert"]').textContent = error.message; button.disabled = false }
    }
  } catch (error) { app.querySelector('[role="status"]').textContent = error.message }
}

export function renderOnboarding(session, done) {
  let step = 0, busy = false
  const titles = ['Business & branding','Contact','Receipt & tax','Security','Your plan','Review & complete']
  const features = () => managedFeatures(CFG).map(([label, enabled]) => `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)"><span>${escapeHTML(label)}</span><strong>${enabled ? 'Included' : 'Not included'}</strong></div>`).join('')
  const field = (label, name, value, type = 'text', required = false) => fld(label,name,value,type).replace('<input ', `<input ${required ? 'required ' : ''}`)
  const contents = () => [
    `${field('Business Name','name',CFG.shop_name,'text',true)}${field('Description','businessDescription',CFG.shop_description)}${field('Primary Color','primaryColor',CFG.primary_color,'color')}${field('Secondary Color','secondaryColor',CFG.secondary_color,'color')}<label class="field"><span>Logo Upload (PNG, JPEG, WebP · up to 512 KB)</span><input name="logo" type="file" accept="image/png,image/jpeg,image/webp"></label>`,
    `${field('Address','address',CFG.shop_address,'text',true)}${field('Phone','phone',CFG.shop_phone,'text',true)}${field('Business Email','email',CFG.shop_email,'email',true)}`,
    `${field('Currency Symbol','currency',CFG.currency,'text',true)}${field('Tax Rate %','taxRate',CFG.tax_rate,'number',true).replace('step="any"','step="any" min="0" max="100"')}${field('Invoice Prefix','invoicePrefix',CFG.invoice_prefix || 'INV','text',true)}${field('Ticket Prefix','ticketPrefix',CFG.ticket_prefix || 'TK','text',true)}<label class="field"><span>Receipt Footer</span><textarea name="receiptFooter">${escapeHTML(CFG.terms_text || '')}</textarea></label>`,
    `<label class="field"><span>Owner Email</span><input readonly value="${escapeHTML(session.employee.email)}"></label><p>Your verified Shop Auth identity matches the reserved owner. Set a separate override PIN for sensitive operations.</p><label class="field"><span>Override PIN (4–6 digits; leave blank if already saved)</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" autocomplete="new-password"></label>`,
    `<div style="grid-column:1/-1">${features()}<p class="muted">Managed by Orbito Platform. Printing and thermal metering remain available independently of Paper Resupply.</p></div>`,
    `<div style="grid-column:1/-1"><h2>${escapeHTML(CFG.shop_name)}</h2><p>${escapeHTML(CFG.shop_address)}<br>${escapeHTML(CFG.shop_phone)} · ${escapeHTML(CFG.shop_email)}</p><p>Currency: ${escapeHTML(CFG.currency)} · Tax: ${escapeHTML(CFG.tax_rate)}%</p><p>Owner: ${escapeHTML(session.employee.email)}</p>${features()}<p>Your saved settings remain available in Business Settings.</p></div>`,
  ][step]
  function render() {
    document.getElementById('app').innerHTML = `<main style="max-width:800px;margin:5vh auto;padding:20px"><p class="muted">ORBITO · WELCOME TO YOUR SHOP</p><h1>Make it yours.</h1><p>Each completed step is saved, so you can safely return later.</p><progress max="6" value="${step+1}" style="width:100%" aria-label="Setup progress"></progress><p>Step ${step+1} of 6</p><section class="card" style="padding:28px"><h2>${titles[step]}</h2><form id="shop-onboarding" class="form-grid">${contents()}<p role="alert" style="grid-column:1/-1"></p><div style="grid-column:1/-1;display:flex;justify-content:space-between;gap:12px"><button type="button" id="onboard-back" class="secondary-button" ${step===0?'disabled':''}>Back</button><button class="primary-button">${step===5?'Complete setup':'Save & continue'}</button></div></form></section><button id="onboard-signout" class="secondary-button" style="margin-top:16px">Sign out & resume later</button></main>`
    document.getElementById('onboard-back').onclick = () => { if (!busy) { step--; render() } }
    document.getElementById('onboard-signout').onclick = () => { if (!busy) void _clearSession() }
    document.getElementById('shop-onboarding').onsubmit = async event => {
      event.preventDefault(); if (busy) return
      busy = true; const form = event.currentTarget
      form.querySelectorAll('button').forEach(b => { b.disabled = true })
      try {
        let result = { ok:true }
        if (step < 3) result = await invokeAccountAdmin('update-config', { updates: await settingsUpdates(form) })
        if (step === 3 && form.elements.pin.value) result = await invokeAccountAdmin('set-pin', { pin:form.elements.pin.value })
        if (step === 5) result = await invokeAccountAdmin('complete-onboarding', {})
        if (!result.ok) throw new Error(result.error)
        if (!await loadConfig(false)) throw new Error('Settings saved, but confirmation could not be loaded. Retry when connected.')
        applyBranding()
        if (step === 5) { await done(); return }
        step++; busy = false; render()
      } catch (error) {
        form.querySelector('[role="alert"]').textContent = error.message
        form.querySelectorAll('button').forEach(b => { b.disabled = false })
        form.querySelector('#onboard-back').disabled = step === 0
      } finally { busy = false }
    }
  }
  render()
}
