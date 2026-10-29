// Bounded DOM reconciliation for the existing operational renderers. No routing,
// data, command or authorization state lives here; callers retain M1 ownership.
import {authorityIdentity,onPrivateReset} from './ui-authority.js';
const composing=new WeakSet();
document.addEventListener('compositionstart',event=>composing.add(event.target),true);
document.addEventListener('compositionend',event=>composing.delete(event.target),true);
let owner=null;
const managed=node=>node.nodeType===1&&node.hasAttribute('data-ui-managed');
function key(node){
 if(node.nodeType!==1)return null;
 for(const name of ['id','data-ui-key','data-form','name'])if(node.hasAttribute(name)&&!(name==='id'&&node.id.startsWith('feature-dialog-title-')))return node.tagName+':'+name+':'+node.getAttribute(name);
 for(const name of ['app-shell','topbar','content','page-title','pos-layout','totals'])if(node.classList.contains(name))return node.tagName+':region:'+name;
 return null;
}
function compatible(a,b){return a&&a.nodeType===b.nodeType&&(a.nodeType!==1||a.tagName===b.tagName)&&(!key(a)&&!key(b)||key(a)===key(b));}
function patchNode(node,next){
 if(node.nodeType!==1){if(node.nodeValue!==next.nodeValue)node.nodeValue=next.nodeValue;return;}
 const oldValue=node.getAttribute('value'),nextValue=next.getAttribute('value'),oldText=node.defaultValue,oldSelected=node.hasAttribute('selected');
 const oldChecked=node.hasAttribute('checked'),nextChecked=next.hasAttribute('checked');
 for(const attr of [...node.attributes]){
  if(!next.hasAttribute(attr.name)&&!['role','aria-modal','aria-labelledby','tabindex','data-ui-dialog','data-ui-busy'].includes(attr.name)&&!(attr.name==='id'&&attr.value.startsWith('feature-dialog-title-')))node.removeAttribute(attr.name);
 }
 for(const attr of next.attributes)if(node.getAttribute(attr.name)!==attr.value)node.setAttribute(attr.name,attr.value);
 // A DOM-only draft row belongs to this dialog instance, not to a new render.
 if(!node.hasAttribute('data-ui-preserve-children'))patchChildren(node,next);
 if(node.tagName==='INPUT'){
  if(oldValue!==nextValue&&!composing.has(node)&&node.value!==(nextValue||'')){
   const focused=document.activeElement===node,start=node.selectionStart,end=node.selectionEnd;
   node.value=nextValue||'';
   if(focused&&start!==null)try{node.setSelectionRange(start,end);}catch{}
  }
  if(oldChecked!==nextChecked)node.checked=nextChecked;
 }
 if(node.tagName==='TEXTAREA'&&oldText!==next.defaultValue&&!composing.has(node)&&node.value!==next.defaultValue){
  const focused=document.activeElement===node,start=node.selectionStart,end=node.selectionEnd;
  node.value=next.defaultValue;
  if(focused)node.setSelectionRange(start,end);
 }
 if(node.tagName==='OPTION'&&oldSelected!==next.hasAttribute('selected'))node.selected=next.hasAttribute('selected');
}
function patchChildren(parent,next){
 const old=[...parent.childNodes].filter(n=>!managed(n)),used=new Set();
 const keyed=new Map(old.map(n=>[key(n),n]).filter(([k])=>k));
 let cursor=[...parent.childNodes].find(n=>!managed(n))||null;
 for(const desired of [...next.childNodes]){
  let current=key(desired)?keyed.get(key(desired)):cursor;
  if(used.has(current)||!compatible(current,desired))current=null;
  if(!current){current=desired.cloneNode(true);parent.insertBefore(current,cursor);}
  else {if(current!==cursor)parent.insertBefore(current,cursor);patchNode(current,desired);}
  used.add(current);cursor=current.nextSibling;
  while(cursor&&managed(cursor))cursor=cursor.nextSibling;
 }
 for(const node of old)if(!used.has(node))node.remove();
}
export function renderOperationalScreen(html,{screen,view=screen,modal=null}={}){
 const app=document.getElementById('app'),template=document.createElement('template');
 template.innerHTML=html;
 const nextShell=template.content.querySelector('.app-shell');
 if(!nextShell)throw Error('Operational renderer requires its existing application shell.');
 const identity=authorityIdentity();
 if(!owner||owner.app!==app||owner.screen!==screen||owner.identity!==identity||!owner.shell.isConnected){
  const shell=nextShell.cloneNode(true),host=document.createElement('div');
  shell.classList.add('rs-shop');host.className='rs-shop feature-modal-host';
  app.replaceChildren(shell,host);owner={app,screen,identity,shell,host,view,modal:null,modalHTML:null};
 }else{
  nextShell.classList.add('rs-shop');
  // A different page must not inherit another page's uncontrolled field values.
  if(owner.view!==view){owner.shell.querySelector('.content').replaceChildren(...nextShell.querySelector('.content').cloneNode(true).childNodes);owner.view=view;}
  patchNode(owner.shell,nextShell);
 }
 const modalTemplate=document.createElement('template');
 for(const node of [...template.content.childNodes])if(node!==nextShell)modalTemplate.content.append(node.cloneNode(true));
 const modalHTML=modalTemplate.innerHTML;
 if(owner.modal!==modal){owner.host.replaceChildren(modalTemplate.content.cloneNode(true));owner.modal=modal;owner.modalHTML=modalHTML;}
 else if(owner.modalHTML!==modalHTML){patchChildren(owner.host,modalTemplate.content);owner.modalHTML=modalHTML;}
 return owner.shell;
}
onPrivateReset(()=>{owner?.host.replaceChildren();owner=null;});
