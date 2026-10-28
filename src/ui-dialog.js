// Shared focus/background ownership; financial/PIN decisions remain with callers.
const layers=[],records=new WeakMap();let sequence=0;
const focusable=modal=>[...modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(el=>!el.disabled&&el.tabIndex>=0&&!el.hidden&&el.getClientRects().length);
const top=()=>layers.filter(layer=>layer.modal.isConnected).at(-1);
function fitDialog(modal){
 const viewport=window.visualViewport,height=viewport?.height||window.innerHeight,top=viewport?.offsetTop||0;
 modal.style.setProperty('--dialog-height',height+'px');
 const backdrop=modal.closest('.modal-backdrop');
 backdrop?.style.setProperty('--dialog-height',height+'px');backdrop?.style.setProperty('--dialog-top',top+'px');
}
function nameDialog(modal){
 const heading=modal.querySelector('h1,h2,h3'),name=modal.getAttribute('aria-labelledby');
 if(heading&&!modal.hasAttribute('aria-label')&&(!name||name.startsWith('feature-dialog-title-')||!document.getElementById(name))){
  heading.id||=`feature-dialog-title-${modal.dataset.uiDialog}`;modal.setAttribute('aria-labelledby',heading.id);
 }else if(!heading&&!modal.hasAttribute('aria-label')&&!name)modal.setAttribute('aria-label','Shop dialog');
}
let inerted=new Map(),scrollLock=null;
function refresh(){
 for(const [node,value]of inerted)node.inert=value;inerted=new Map();
 const active=top();
 if(!active){if(scrollLock!==null){document.body.style.overflow=scrollLock;scrollLock=null;}return;}
 if(scrollLock===null){scrollLock=document.body.style.overflow;document.body.style.overflow='hidden';}
 let branch=active.modal;
 while(branch&&branch!==document.body){
  for(const sibling of branch.parentElement?.children||[])if(sibling!==branch&&!['SCRIPT','STYLE','LINK'].includes(sibling.tagName)){inerted.set(sibling,sibling.inert);sibling.inert=true;}
  branch=branch.parentElement;
 }
}
export function dialogOwnsKeyboard(modal){return top()?.modal===modal;}
export function releaseDialog(modal,{restore=true}={}){
 const layer=records.get(modal);if(!layer)return;
 records.delete(modal);const index=layers.indexOf(layer);if(index>=0)layers.splice(index,1);refresh();
 if(restore)queueMicrotask(()=>{
  const active=top(),opener=layer.opener;
  if(opener?.isConnected&&!opener.inert&&(!active||active.modal.contains(opener)))opener.focus({preventScroll:true});
  else if(active)(focusable(active.modal)[0]||active.modal).focus({preventScroll:true});
  else document.querySelector('.topbar button,.topbar select')?.focus({preventScroll:true});
 });
}
export function ownDialog(modal,{close,busy=()=>false,escape=true,dirty=false}={}){
 fitDialog(modal);
 let layer=records.get(modal);
 if(layer){Object.assign(layer,{close,busy,escape});nameDialog(modal);refresh();return;}
 layer={modal,close,busy,escape,dirty:false,opener:document.activeElement};records.set(modal,layer);layers.push(layer);
 modal.dataset.uiDialog=String(++sequence);modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.tabIndex=-1;
 nameDialog(modal);
 if(dirty){const remember=event=>{layer.dirty=true;modal.querySelector('[data-draft-warning]')?.remove();};modal.addEventListener('input',remember);modal.addEventListener('change',remember);}
 refresh();queueMicrotask(()=>{if(top()===layer)(modal.querySelector('[autofocus],input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),select:not([disabled])')||focusable(modal).find(el=>!el.matches('[data-modal-close]'))||modal).focus({preventScroll:true});});
}
export function mayDismiss(modal){
 const layer=records.get(modal);if(!layer||layer.busy())return false;
 if(layer.dirty){
  // Use an explicit second dismissal, never incidental Escape/backdrop, to discard.
  let notice=modal.querySelector('[data-draft-warning]');
  if(!notice){notice=document.createElement('p');notice.dataset.draftWarning='';notice.dataset.uiManaged='';notice.className='inline-notice';notice.setAttribute('role','alert');notice.textContent='Unsaved changes. Keep editing, or choose Close / Cancel again to discard this draft.';modal.append(notice);return false;}
 }
 return true;
}
document.addEventListener('keydown',event=>{
 const layer=top();if(!layer)return;
 if(event.key==='Tab'){
  const controls=focusable(layer.modal),first=controls[0]||layer.modal,last=controls.at(-1)||first;
  if(event.shiftKey&&(document.activeElement===first||!layer.modal.contains(document.activeElement))){event.preventDefault();event.stopImmediatePropagation();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!layer.modal.contains(document.activeElement))){event.preventDefault();event.stopImmediatePropagation();first.focus();}
 }
 if(event.key==='Escape'){
  event.preventDefault();event.stopImmediatePropagation();
  if(layer.escape&&!layer.dirty&&!layer.busy())layer.close?.();
 }
},true);
document.addEventListener('click',event=>{
 const layer=top();if(!layer)return;
 const close=event.target.closest?.('[data-close]');
 const backdrop=event.target.classList?.contains('modal-backdrop');
 if(close&&layer.modal.contains(close)){
  if(!mayDismiss(layer.modal)){event.preventDefault();event.stopImmediatePropagation();}
 }else if(backdrop){
  // Preserve each family's explicit no-backdrop rule; dirty/busy never dismiss.
  if(event.target.hasAttribute('data-no-backdrop-close')||layer.dirty||layer.busy()){event.preventDefault();event.stopImmediatePropagation();}
 }
},true);
const observer=new MutationObserver(()=>{
 let changed=false;for(const layer of [...layers])if(!layer.modal.isConnected){releaseDialog(layer.modal);changed=true;}
 if(changed)refresh();
});observer.observe(document.body,{childList:true,subtree:true});
const fitAll=()=>{for(const {modal}of layers)fitDialog(modal);};
window.visualViewport?.addEventListener('resize',fitAll);
window.visualViewport?.addEventListener('scroll',fitAll);
window.addEventListener('resize',fitAll);
