import {escapeHTML as esc} from '../../html.js';
export function supportPage(v,owner=false) {
 const detail=t=>`<div class="card" style="display:grid;gap:10px"><h3>${esc(t.subject)}</h3>
  <div>${esc(t.category)} · ${esc(t.status)} · ${esc(new Date(t.created_at).toLocaleString())}</div>
  <div style="white-space:pre-wrap">${esc(t.message)}</div>
  ${t.resolution?`<div style="white-space:pre-wrap"><strong>Resolution</strong><br>${esc(t.resolution)}</div>`:''}
  ${t.resolved_at?`<div>Resolved ${esc(new Date(t.resolved_at).toLocaleString())}</div>`:''}</div>`;
 return `<div class="page-header"><h2>New support request</h2><p>Contact RetraSell about your Shop. Managers can see their own requests; the Business Owner can see this Shop’s requests.</p></div>
 ${v.error?`<div class="card" role="alert">${esc(v.error)}</div>`:''}
 ${v.receipt?`<div class="card" role="status">Request received. Reference: ${esc(v.receipt)}</div>`:''}
 <form data-form="customer-support" class="card" style="display:grid;gap:12px">
  <label class="field"><span>Subject</span><input name="subject" data-support-field="subject" required maxlength="160" value="${esc(v.draft.subject)}" ${v.pending?'readonly':''}></label>
  <label class="field"><span>Category</span><select name="category" data-support-field="category" ${v.pending?'disabled':''}>
   ${[['technical','Technical'],['billing_question','Billing question'],['account','Account'],['other','Other']].map(([id,label])=>`<option value="${id}" ${v.draft.category===id?'selected':''}>${label}</option>`).join('')}</select></label>
  <label class="field"><span>Description</span><textarea name="message" data-support-field="message" required maxlength="4000" rows="5" ${v.pending?'readonly':''}>${esc(v.draft.message)}</textarea></label>
  <p class="muted">Include the problem and steps to reproduce it. Do not include passwords, access keys or payment card details.</p>
  ${v.pending?'<p role="status">The outcome is uncertain. Retry sends the same request and cannot create a duplicate. Your original content is retained in this tab.</p>':''}
  <button type="submit" class="primary-button" ${v.busy?'disabled':''}>${v.busy?'Please wait…':v.pending?'Retry original request':'Submit request'}</button>
 </form>
 <div class="toolbar"><h3>Support history</h3><button data-action="customer-support-refresh" ${v.busy?'disabled':''}>Refresh</button></div>
 ${v.detail?detail(v.detail):''}
 ${owner?`<section class="card"><h3>Privileged support access · separate owner approval</h3><p>Submitting a ticket grants no Shop access. Approve only a reviewed case. This allows the canonical Support role to view and manage Shop application operations for up to 30 minutes; it does not share database credentials. Revoking blocks subsequent server operations. Already displayed data is not erased and existing browser sessions are not claimed signed out.</p>
 ${v.detail||v.accessPending?`<form data-form="support-consent" style="display:grid;gap:12px"><input type="hidden" name="ticket_id" value="${esc(v.accessPending?.p_case||v.detail?.ticket_id)}"><p>Verified case: ${esc(v.accessPending?.p_case||v.detail?.ticket_id)}</p><label class="field"><span>Purpose (20–400 characters)</span><textarea name="purpose" required minlength="20" maxlength="400" ${v.accessPending?'readonly':''}>${esc(v.accessPending?.p_purpose||'')}</textarea></label><label class="field"><span>Type AUTHORIZE SUPPORT to approve this case</span><input name="confirmation" required pattern="AUTHORIZE SUPPORT" autocomplete="off" value="${esc(v.accessPending?.p_confirmation||'')}" ${v.accessPending?'readonly':''}></label><button class="primary-button" ${v.busy?'disabled':''}>${v.accessPending?'Retry original approval':'Authorize one support session · 30 minutes'}</button></form>`:'<p>Open a verified ticket above before approving access.</p>'}
 ${v.access?.approved_id?`<p role="status">Approval created. Give only this public approval ID to the Platform Master: <code>${esc(v.access.approved_id)}</code></p>`:''}
 <p>After an uncertain response or page refresh, review this history before authorizing another session. BYO tickets do not enable Managed Open Shop as Support.</p><h4>Owner access history</h4>${(v.access?.approvals||[]).map(a=>`<article><p>Approval ${esc(a.id)} · Case ${esc(a.ticket_id)}<br>${esc(a.purpose)} · Scope ${esc(a.scope)}<br>Owner ${esc(a.approved_by)} · Approved ${esc(a.approved_at)} · Expires ${esc(a.expires_at)}<br>${a.revoked_at?'Revoked '+esc(a.revoked_at):a.used_at?'Session bound '+esc(a.used_at)+' · Platform actor '+esc(a.platform_actor):'Not yet used'}</p>${!a.revoked_at?`<button type="button" data-action="support-consent-revoke" data-consent-id="${esc(a.id)}" ${v.busy?'disabled':''}>Revoke approval</button>`:''}</article>`).join('')||'<p>No approvals recorded.</p>'}</section>`:''}
 <div style="display:grid;gap:12px">${v.tickets.map(t=>`<button class="card" data-action="customer-support-detail" data-ticket-id="${esc(t.ticket_id)}" ${v.busy?'disabled':''}>${esc(t.subject)} · ${esc(t.status)} · ${esc(new Date(t.created_at).toLocaleString())}</button>`).join('')||'<div class="empty">No requests on this page.</div>'}</div>
 <div class="toolbar"><button data-action="customer-support-previous" ${v.busy||!v.offset?'disabled':''}>Previous</button>
 <span>Page ${Math.floor(v.offset/50)+1}</span><button data-action="customer-support-next" ${v.busy||!v.has_more||v.offset>=5000?'disabled':''}>Next</button></div>`;
}
