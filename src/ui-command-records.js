import {authorityIdentity} from './ui-authority.js'
const records=new Map()
// Records only commands already initiated by the user. Never schedules a retry.
export function observeCommand(name,args,send){
 const identity=authorityIdentity(),actor=identity?.split(':')[0]
 if(!actor)return send()
 const key=actor+':'+args.p_request_id,payload=JSON.stringify([name,args])
 let record=records.get(key)
 if(record&&record.payload!==payload)throw Error('Original request UUID has a different intended payload. Reconcile it before continuing.')
 record||={actor,session:identity,requestId:args.p_request_id,name,args:structuredClone(args),payload,status:'pending'}
 records.set(key,record)
 let sent;try{sent=send(identity)}catch(error){record.status='uncertain';throw error}
 return Promise.resolve(sent).then(result=>{record.status=result?.error?'uncertain':'acknowledged';record.result=structuredClone(result);return result},error=>{record.status='uncertain';throw error})
}
export function originalCommandRecords(){
 const actor=authorityIdentity()?.split(':')[0]
 return [...records.values()].filter(r=>r.actor===actor).map(r=>structuredClone(r))
}
