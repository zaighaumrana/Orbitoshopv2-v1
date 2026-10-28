import {escapeHTML as esc} from '../../html.js';
import {backendUpgradeGuidance} from '../backend-upgrade-guidance.js';
export function supportPage(v,owner=false) {
 const badge=status=>`<span class="badge ${status==='Resolved'?'good':status==='In Progress'?'warn':''}">${esc(status)}</span>`;
 const detail=t=>`<article class="card support-section support-detail"><h3>${esc(t.subject)}</h3>
  <div class="support-meta">${badge(t.status)}<span>${esc(t.category)} &middot; <time datetime="${esc(t.created_at)}">${esc(new Date(t.created_at).toLocaleString())}</time></span></div>
  <div class="support-message">${esc(t.message)}</div>
  ${t.resolution?`<div class="support-message"><strong>Resolution</strong><br>${esc(t.resolution)}</div>`:''}
  ${t.resolved_at?`<p class="muted">Resolved ${esc(new Date(t.resolved_at).toLocaleString())}</p>`:''}</article>`;
 return `<div class="support-page">
 ${v.error?`<div class="card support-notice support-notice-error" role="alert">${esc(v.error)}</div>`:''}
 ${v.receipt?`<div class="card support-notice support-notice-success" role="status">Request received. Reference: ${esc(v.receipt)}</div>`:''}
 <form data-form="customer-support" class="card support-section">
  <div class="support-heading"><h2>New support request</h2><p class="muted">Contact RetraSell about your Shop. Managers can see their own requests; the Business Owner can see this Shop&rsquo;s requests.</p></div>
  <div class="support-fields">
   <label class="field"><span>Subject</span><input name="subject" data-support-field="subject" required maxlength="160" value="${esc(v.draft.subject)}" ${v.pending?'readonly':''}></label>
   <label class="field"><span>Category</span><select name="category" data-support-field="category" ${v.pending?'disabled':''}>
    ${[['technical','Technical'],['billing_question','Billing question'],['account','Account'],['other','Other']].map(([id,label])=>`<option value="${id}" ${v.draft.category===id?'selected':''}>${label}</option>`).join('')}</select></label>
  </div>
  <label class="field"><span>Description</span><textarea name="message" data-support-field="message" required maxlength="4000" rows="4" ${v.pending?'readonly':''}>${esc(v.draft.message)}</textarea></label>
  <p class="muted">Include the problem and steps to reproduce it. Do not include passwords, access keys or payment card details.</p>
  ${v.pending?`<p class="support-notice support-notice-pending" role="status">${v.deliveryState==='review'?'This saved request needs review before another delivery attempt. Keep its original reference and contact your administrator.':v.deliveryState?'Saved in this Shop. Platform acknowledgment is pending; a signed-in retry uses the original request.':'The outcome is uncertain. Retry the same request after reconnecting; delivery is not confirmed.'}</p>`:''}
  <div class="support-actions"><button type="submit" class="primary-button" ${v.busy?'disabled':''}>${v.busy?'Please wait&hellip;':v.pending?'Retry original request':'Submit request'}</button></div>
 </form>
 ${owner?backendUpgradeGuidance():''}
 <section class="card support-section" aria-label="Support history">
  <div class="toolbar"><h2>Support history</h2><button type="button" class="secondary-button" data-action="customer-support-refresh" ${v.busy?'disabled':''}>Refresh</button></div>
  ${v.detail?detail(v.detail):''}
  <div class="support-history">${v.tickets.map(t=>`<button type="button" class="list-row support-ticket" data-action="customer-support-detail" data-ticket-id="${esc(t.ticket_id)}" title="${esc(t.subject)}" aria-pressed="${v.detail?.ticket_id===t.ticket_id}" ${v.busy?'disabled':''}>
   <span class="support-ticket-main"><strong>${esc(t.subject)}</strong><time class="muted" datetime="${esc(t.created_at)}">${esc(new Date(t.created_at).toLocaleString())}</time></span>
   <span class="support-ticket-meta">${badge(t.status)}<span class="support-ticket-action">View request &rarr;</span></span></button>`).join('')||'<div class="card empty">No requests on this page.</div>'}</div>
  <nav class="support-pagination rs-pagination" aria-label="Support history pages"><button type="button" class="secondary-button" data-action="customer-support-previous" ${v.busy||!v.offset?'disabled':''}>Previous</button>
   <span class="muted rs-pagination-summary">Page ${Math.floor(v.offset/50)+1}</span><button type="button" class="secondary-button" data-action="customer-support-next" ${v.busy||!v.has_more||v.offset>=5000?'disabled':''}>Next</button></nav>
 </section>
 ${owner?`<section class="card support-section"><h2>Privileged support access &middot; separate owner approval</h2><p>Submitting a ticket grants no Shop access. Approve only a reviewed case. This allows the canonical Support role to view and manage Shop application operations for up to 30 minutes; it does not share database credentials. Revoking blocks subsequent server operations. Already displayed data is not erased and existing browser sessions are not claimed signed out.</p>
 ${v.detail||v.accessPending?`<form data-form="support-consent" class="support-section"><input type="hidden" name="ticket_id" value="${esc(v.accessPending?.p_case||v.detail?.ticket_id)}"><p class="muted">Verified case: <code>${esc(v.accessPending?.p_case||v.detail?.ticket_id)}</code></p><label class="field"><span>Purpose (20&ndash;400 characters)</span><textarea name="purpose" required minlength="20" maxlength="400" ${v.accessPending?'readonly':''}>${esc(v.accessPending?.p_purpose||'')}</textarea></label><label class="field"><span>Type AUTHORIZE SUPPORT to approve this case</span><input name="confirmation" required pattern="AUTHORIZE SUPPORT" autocomplete="off" value="${esc(v.accessPending?.p_confirmation||'')}" ${v.accessPending?'readonly':''}></label><div class="support-actions"><button type="submit" class="primary-button" ${v.busy?'disabled':''}>${v.accessPending?'Retry original approval':'Authorize one support session &middot; 30 minutes'}</button></div></form>`:'<p class="muted">Open a verified ticket above before approving access.</p>'}
 ${v.access?.approved_id?`<p class="support-notice support-notice-success" role="status">Approval created. Give only this public approval ID to the Platform Master: <code>${esc(v.access.approved_id)}</code></p>`:''}
 <p class="muted">After an uncertain response or page refresh, review this history before authorizing another session. BYO tickets do not enable Managed Open Shop as Support.</p>
 <h4>Owner access history</h4><div class="support-section">${(v.access?.approvals||[]).map(a=>`<article class="support-approval"><strong>Approval <code>${esc(a.id)}</code></strong><dl class="support-approval-details"><dt>Case</dt><dd>${esc(a.ticket_id)}</dd><dt>Purpose</dt><dd>${esc(a.purpose)}</dd><dt>Scope</dt><dd>${esc(a.scope)}</dd><dt>Owner</dt><dd>${esc(a.approved_by)}</dd><dt>Approved</dt><dd>${esc(a.approved_at)}</dd><dt>Expires</dt><dd>${esc(a.expires_at)}</dd><dt>Status</dt><dd>${a.revoked_at?'Revoked '+esc(a.revoked_at):a.used_at?'Session bound '+esc(a.used_at)+' &middot; Platform actor '+esc(a.platform_actor):'Not yet used'}</dd></dl>${!a.revoked_at?`<div class="support-actions"><button type="button" class="secondary-button" data-action="support-consent-revoke" data-consent-id="${esc(a.id)}" ${v.busy?'disabled':''}>Revoke approval</button></div>`:''}</article>`).join('')||'<p class="muted">No approvals recorded.</p>'}</div></section>`:''}
 </div>`;
}
