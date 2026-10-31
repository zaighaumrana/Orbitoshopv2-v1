import {sb,CFG} from '../shared.js'
import {readPage,readComplete,searchColumns} from '../bounded-read.js'
export const catalogAvailable=()=>CFG.read_contracts?.catalog_icons===1
export const iconColumns=columns=>columns+(catalogAvailable()?',icon_id':'')
export function deviceBrands(current,{search='',offset=0,size=25,activeOnly=false}={}){
 if(!catalogAvailable())return Promise.resolve({data:[],count:0,offset:0,size,hasMore:false,nextOffset:0,error:null})
 return readPage(()=>{let q=searchColumns(sb.from('device_brands').select('id,display_name,icon_id,enabled,sort_order',{count:'exact'}),['display_name'],search);if(activeOnly)q=q.eq('enabled',true);return q.order('sort_order').order('display_name').order('id')},{offset,size,current})
}
export async function intakeBrands(current){
 if(!catalogAvailable())return null
 return (await readComplete(()=>sb.from('device_brands').select('id,display_name,icon_id,enabled,sort_order',{count:'exact'}).eq('enabled',true).order('sort_order').order('id'),{current,maxRows:500})).data
}
