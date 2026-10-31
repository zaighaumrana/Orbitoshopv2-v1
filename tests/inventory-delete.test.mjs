import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const source=readFileSync(new URL('../src/features/admin/inventory/api.js',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace(/^export /gm,'');
function fixture(error=null,confirmed=true){
 const calls=[],messages=[],toasts=[],confirmations=[];const context=vm.createContext({state:{},dlog(){},showBlockingError:m=>messages.push(m),showToast:m=>toasts.push(m),confirmAction:async options=>{confirmations.push(options);return confirmed?{confirmed:true,value:await options.action()}:{confirmed:false}},sb:{from:table=>({delete:()=>({eq:async(field,id)=>{calls.push({table,field,id});return {error}}})})}});
 vm.runInContext(source,context);return {calls,messages,toasts,confirmations,run:()=>context.handleInvDelete({dataset:{invDelete:'7'}})};
}
test('referenced inventory stays protected and the operator sees history/adjustment guidance instead of SQL',async()=>{
 const f=fixture({code:'23503',message:'violates foreign key constraint inventory_movements_inventory_id_fkey'});const result=await f.run();assert.equal(result.deleted,false);assert.deepEqual(f.calls,[{table:'inventory',field:'id',id:7}]);assert.equal(f.toasts.length,0);assert.match(f.messages[0],/history.*cannot be deleted/i);assert.match(f.messages[0],/Adjust Stock/);assert.doesNotMatch(f.messages[0],/foreign key|inventory_movements|constraint/i);assert.match(f.confirmations[0].message,/history.*retained/i);
});
test('cancel performs no delete; unrelated denial fails closed; unused item deletion keeps its existing success path',async()=>{
 const cancelled=fixture(null,false);assert.equal((await cancelled.run()).deleted,false);assert.equal(cancelled.calls.length,0);
 const denied=fixture({code:'42501',message:'Access denied'});assert.equal((await denied.run()).deleted,false);assert.equal(denied.toasts.length,0);assert.doesNotMatch(denied.messages[0],/stock or sales history/i);
 const unused=fixture();assert.equal((await unused.run()).deleted,true);assert.equal(unused.calls.length,1);assert.equal(unused.messages.length,0);assert.match(unused.toasts[0],/deleted/i);
});
