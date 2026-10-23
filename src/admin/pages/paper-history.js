import {escapeHTML as esc} from '../../html.js';
const status=value=>({requested:'Requested',approved:'Approved',dispatched:'Dispatched',fulfilled:'Delivered',rejected:'Rejected',cancelled:'Cancelled'}[value]||'Awaiting update');
const date=value=>{const d=new Date(value);return value&&Number.isFinite(d.getTime())?esc(d.toLocaleString()):'Date unavailable';};
export const activePaperRequest=(rows=[])=>rows.find(r=>['requested','approved','dispatched'].includes(r.status));
export function paperProgress(r){
 return Number(r.sync_version)>0&&Number.isFinite(Date.parse(r.platform_updated_at))
  ?`Confirmed by Platform · last Platform update ${date(r.platform_updated_at)}`
  :'Saved locally · awaiting Platform sync. Use Refresh paper status to check for updates.';
}
export function paperHistory(rows=[]){return `<section aria-label="Paper supply requests"><h2>Paper Supply Updates</h2>${rows.length?rows.map(r=>`<article class="card" style="overflow-wrap:anywhere"><h3>${status(r.status)}</h3><p role="status">${paperProgress(r)}</p><p class="muted">Request ${esc(r.request_id)} · ${date(r.requested_at)}</p>${r.communication?.length?r.communication.map(m=>`<p><strong>${status(m.status)}</strong> · ${date(m.at)}<br>${esc(m.message||'No customer message supplied.')}${m.expectation?`<br>Expected delivery: ${esc(m.expectation)}`:''}</p>`).join(''):`<p>${r.status==='requested'?'Your request is waiting for a decision.':'No customer message was supplied for this earlier update.'}</p>${r.platform_updated_at?`<p>Updated ${date(r.platform_updated_at)}</p>`:''}`}</article>`).join(''):'<p>No paper requests yet.</p>'}</section>`;}
