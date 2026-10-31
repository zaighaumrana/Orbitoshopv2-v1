// Safe presentation state only. Free text, record IDs, modal and transaction
// drafts are excluded. Live main/router gates remain authoritative.
const tabs={inventoryStatus:['active','retired'],settingsTab:['branding','contact','receipt','staff','legal','icons'],catalogTab:['quickitems','components']}
export function safeAdminState(input={}){
 const out={}
 for(const [name,values] of Object.entries(tabs))if(values.includes(input[name]))out[name]=input[name]
 for(const name of ['receiptDateFrom','receiptDateTo'])if(/^\d{4}-\d{2}-\d{2}$/.test(input[name]||''))out[name]=input[name]
 if(['all','retail','repair'].includes(input.receiptType))out.receiptType=input.receiptType
 return out
}
export function adminViewScope(session){return JSON.stringify([session.authUserId,session.employee?.role])}
export function readAdminView(history,location,session){
 const v=history.state?.shop_view
 if(!session.authUserId||v?.scope!==adminViewScope(session)||v.route!==location.pathname+location.search)return null
 return {values:safeAdminState(v.values),scroll:Number.isFinite(v.scroll)?Math.max(0,Math.min(v.scroll,100000)):0}
}
export function saveAdminView(history,location,session,state,scroll){
 if(!session.authUserId||location.pathname!=='/admin/'+state.adminModule)return
 try{history.replaceState({...history.state,shop_view:{scope:adminViewScope(session),route:location.pathname+location.search,values:safeAdminState(state),scroll:Math.max(0,Math.min(Number(scroll)||0,100000))}},'',location.pathname+location.search)}catch{}
}
