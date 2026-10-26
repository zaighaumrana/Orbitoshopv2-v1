// UI ownership only. Server Auth, role and consent remain authoritative.
let identity=null,generation=0;
const resets=new Set();
export function nativeIdentity(session){
 try{const c=JSON.parse(atob(session.access_token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));return session.user.id+':'+c.session_id;}catch{return null;}
}
export function onPrivateReset(reset){resets.add(reset);return ()=>resets.delete(reset);}
export function setUIAuthority(next){
 if(next===identity)return;
 identity=next;generation++;
 for(const reset of resets)reset();
}
export function invalidateUIAuthority(){identity=null;generation++;for(const reset of resets)reset();}
export function captureAuthority(){const captured=generation;return ()=>captured===generation;}
export function authorityIdentity(){return identity;}
