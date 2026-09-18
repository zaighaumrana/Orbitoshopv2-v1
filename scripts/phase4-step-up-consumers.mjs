// Emit narrowly transformed copies of applied Phase 3 functions for a NEW
// migration. Never alter applied migrations. Also usable as a lineage check.
import fs from 'node:fs'
const targets=new Set(['create_retail_sale','create_repair_adjustment','cancel_repair','deliver_repair','create_retail_return','settle_udhar','mark_repair_component_not_needed'])
const definitions=new Map()
for(const name of fs.readdirSync('supabase/migrations').sort().filter(n=>n.includes('phase3')&&n.endsWith('.sql'))){
  const sql=fs.readFileSync('supabase/migrations/'+name,'utf8')
  for(const match of sql.matchAll(/create or replace function public\.(\w+)\(([\s\S]*?)^\$\$;/gm)){
    if(targets.has(match[1]))definitions.set(match[1],{sql:match[0],file:name})
  }
}
if(definitions.size!==targets.size)throw new Error('Missing canonical consumer')
let output='\n-- Phase 3 consumers: only authorization predicates replaced.\n'
for(const [name,{sql,file}] of definitions){
  const signature=sql.slice(0,sql.indexOf('returns'))
  const args=[...signature.matchAll(/\b(p_\w+)\s+(uuid|jsonb|boolean|text|bigint|integer|numeric)/g)].map(m=>m[1])
  const claim=purpose=>`app_private.claim_step_up('${purpose}',p_request_id,'${name}',jsonb_build_array(${args.join(',')}))`
  let count=0
  let changed=sql.replace(/select sua\.id into step_up_id\s+from public\.step_up_authorizations sua[\s\S]*?limit 1;/g,block=>{
    const purpose=block.match(/sua\.purpose\s*=\s*'([^']+)'/)?.[1]
    if(!purpose)throw new Error('Unknown purpose')
    count++;return `step_up_id := ${claim(purpose)};`
  })
  changed=changed.replace("not app_private.has_step_up('discount')",()=>{count++;return claim('discount')+' is null'})
  if(count!==(name==='create_retail_sale'?2:1))throw new Error('Unexpected consumer count for '+name)
  output+=`\n-- Source: ${file}\n${changed}\n`
}
process.stdout.write(output.replaceAll('\r',''))
