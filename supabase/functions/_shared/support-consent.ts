// Call only after Auth getUser(token) has verified this exact bearer. Never use
// browser metadata as session authority; SQL rechecks the owned live Auth session.
export async function supportSessionAllowed(admin:any,token:string,actor:string,role:string) {
 if(role!=='Orbito Support')return true;
 try {
  const claims=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));
  if(claims.sub!==actor||typeof claims.session_id!=='string')return false;
  const r=await admin.rpc('support_session_authorized',{p_actor:actor,p_session:claims.session_id});
  return !r.error&&r.data===true;
 }catch{return false}
}
