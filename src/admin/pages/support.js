import {escapeHTML as esc} from '../../html.js';
export function supportPage(v) {
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
 <div style="display:grid;gap:12px">${v.tickets.map(t=>`<button class="card" data-action="customer-support-detail" data-ticket-id="${esc(t.ticket_id)}" ${v.busy?'disabled':''}>${esc(t.subject)} · ${esc(t.status)} · ${esc(new Date(t.created_at).toLocaleString())}</button>`).join('')||'<div class="empty">No requests on this page.</div>'}</div>
 <div class="toolbar"><button data-action="customer-support-previous" ${v.busy||!v.offset?'disabled':''}>Previous</button>
 <span>Page ${Math.floor(v.offset/50)+1}</span><button data-action="customer-support-next" ${v.busy||!v.has_more||v.offset>=5000?'disabled':''}>Next</button></div>`;
}
