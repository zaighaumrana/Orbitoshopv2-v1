// Local, deterministic, source-only release. Never reads .env or contacts Supabase.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=resolve(import.meta.dirname,'..');
const sha=value=>createHash('sha256').update(value).digest('hex');
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]).sort();}
export function buildRelease(sourceRoot=root){
// Frozen fingerprints of the shipped ZIP release, not ZIP-generation code.
// Reuse a recorded stage checksum only when its approved inputs are unchanged.
const legacy=JSON.parse(readFileSync(resolve(root,'scripts/managed-release-v1-checksums.json'),'utf8'));
const base=resolve(sourceRoot,'supabase/functions');
const config=readFileSync(resolve(sourceRoot,'supabase/config.toml'),'utf8');
const sourceFile=p=>{const content=readFileSync(p,'utf8');return {path:relative(base,p).replaceAll('\\','/'),content,sha256:sha(content)};};
const shared=walk(resolve(base,'_shared')).filter(p=>p.endsWith('.ts')).map(sourceFile);
const functions=['account-admin','login','password-reset-request','public-track','verify-pin','platform-bridge'].map(name=>{
 const files=[...shared,...walk(resolve(base,name)).filter(p=>p.endsWith('.ts')).map(sourceFile)].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const section=config.split(`[functions.${name}]`)[1]?.split('[functions.')[0];
 const jwt=section?.match(/verify_jwt\s*=\s*(true|false)/);
 if(!jwt)throw Error('Explicit gateway configuration required: '+name);
 const fn={name,entrypoint:name+'/index.ts',verify_jwt:jwt[1]==='true',files};
 if(!files.some(f=>f.path===fn.entrypoint))throw Error('Included entrypoint required: '+name);
 const sha256=sha(JSON.stringify(fn));
 const previous=legacy.functions.find(f=>f.name===name && f.source_sha256===sha256);
 return {...fn,sha256,stage_sha256:previous?.stage_sha256 || sha256};
});
const migrations=readdirSync(resolve(sourceRoot,'supabase/migrations')).filter(p=>/^\d+_.+\.sql$/.test(p)).sort().map(file=>{
 const sql=readFileSync(resolve(sourceRoot,'supabase/migrations',file),'utf8').replaceAll('\r\n','\n');return {version:file.split('_')[0],name:file.slice(file.indexOf('_')+1,-4),sql,sha256:sha(sql)};
});
const migrationsSha=sha(JSON.stringify(migrations));
const functionsSha=sha(JSON.stringify(functions.map(f=>({name:f.name,sha256:f.sha256}))));
const sameFunctions=functions.length===legacy.functions.length && functions.every(f=>legacy.functions.some(old=>old.name===f.name && old.source_sha256===f.sha256));
const artifact={contract:'orbito-managed-release-v1',migrations,functions,stage_checksums:{migrations:migrationsSha===legacy.migrations_sha256?legacy.release_sha256:migrationsSha,functions:sameFunctions?legacy.release_sha256:functionsSha}};
artifact.sha256=sha(JSON.stringify(artifact));
return artifact;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=resolve(process.argv[2] || '../orbito/supabase/functions/_shared/shop-release.json');
 const artifact=buildRelease();writeFileSync(output,JSON.stringify(artifact)+'\n');
 console.log(`Source-only release: ${artifact.migrations.length} migrations, ${artifact.functions.length} functions, ${artifact.sha256}`);
}
