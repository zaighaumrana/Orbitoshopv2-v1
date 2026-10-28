// Presentation only: no settings, storage, money, document IDs or command state.
const attributionText='Powered by RetraSell';
export function withPrintAttribution(html,{attribution=false}={}) {
  if(!attribution)return html;
  const lines=html.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(?:div|p|section)>/gi,'\n').replace(/<[^>]*>/g,'').split('\n').map(x=>x.trim());
  return lines.includes(attributionText)?html:html+'<div class="c sm" data-product-attribution style="margin-top:6px">'+attributionText+'</div>';
}
const printActions=new Set(['print-shift','print-receipt','print-ticket-slip','print-repair-summary','print-repair-invoice','reprint-receipt','submit-sub-invoice','decide-additional-work']);
const selector=[...printActions].map(action=>'[data-action="'+action+'"]').join(',')+',[data-print-slip],[data-form="return-confirm"]';
function container(target){return target.closest('.modal')||target.closest('.rs-receipt-row')||target.closest('td')||target.closest('.card')||target.closest('.content');}
export function normalizePrintControls(root){
  const contexts=new Map();
  for(const action of root.querySelectorAll(selector)){
    const context=container(action);if(!context)continue;
    if(!contexts.has(context))contexts.set(context,[]);
    contexts.get(context).push(action);
  }
  for(const [context,actions]of contexts){
    const documentKey=actions.map(action=>[action.dataset.action,action.dataset.saleId,action.dataset.ticketId,action.dataset.printSlip].join(':')).join('|');
    const existing=context.querySelector('[data-print-attribution]');
    if(existing){if(existing.dataset.printDocument!==documentKey)existing.checked=false;existing.dataset.printDocument=documentKey;continue;}
    const action=actions[0];
    const label=document.createElement('label');label.className='rs-print-choice';label.dataset.uiManaged='';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.dataset.printAttribution='';checkbox.dataset.printDocument=documentKey;
    label.append(checkbox,document.createTextNode(' Include “Powered by RetraSell” on this print'));
    (context.querySelector('.modal-actions')||context).append(label);
  }
}
const eventChoices=new WeakMap();
export function capturePrintChoice(target,type='click',event){
  // Admin and EMS share delegated ownership; one event has one captured choice.
  if(event&&eventChoices.has(event))return eventChoices.get(event);
  const action=target.closest('[data-action],[data-print-slip],[data-form]');
  const prints=action&&(printActions.has(action.dataset.action)||action.hasAttribute('data-print-slip')||(type==='submit'&&action.dataset.form==='return-confirm'));
  const checkbox=prints?container(action)?.querySelector('[data-print-attribution]'):null;
  const attribution=checkbox?.checked===true;
  if(checkbox)checkbox.checked=false; // Each print attempt starts a new, default-off choice.
  const choice={attribution};if(event)eventChoices.set(event,choice);return choice;
}
