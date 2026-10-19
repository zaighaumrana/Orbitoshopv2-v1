// Local, deterministic, source-only release. Never reads .env or contacts Supabase.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=resolve(import.meta.dirname,'..');
const sha=value=>createHash('sha256').update(value).digest('hex');
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]).sort();}
export function buildRelease(sourceRoot=root,{support=false}={}){
// Frozen fingerprints of the shipped ZIP release, not ZIP-generation code.
// Reuse a recorded stage checksum only when its approved inputs are unchanged.
const legacy=JSON.parse(readFileSync(resolve(root,'scripts/managed-release-v1-checksums.json'),'utf8'));
const base=resolve(sourceRoot,'supabase/functions');
const config=readFileSync(resolve(sourceRoot,'supabase/config.toml'),'utf8');
const sourceFile=p=>{const raw=readFileSync(p,'utf8');const content=support?raw.replaceAll('\r\n','\n'):raw;return {path:relative(base,p).replaceAll('\\','/'),content,sha256:sha(content)};};
const shared=walk(resolve(base,'_shared')).filter(p=>p.endsWith('.ts')).map(sourceFile);
const functions=['account-admin','login','password-reset-request','public-track','verify-pin','platform-bridge',...(support?['support-tickets']:[])].map(name=>{
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
const migrations=readdirSync(resolve(sourceRoot,'supabase/migrations')).filter(p=>/^\d+_.+\.sql$/.test(p) && (support || p.split('_')[0]<='20261003121000')).sort().map(file=>{
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
 const support=process.argv.includes('--support');
 const output=resolve(process.argv.slice(2).find(arg=>arg!=='--support') || (support?'../orbito/supabase/releases/shop-release-support-v2.json':'../orbito/supabase/functions/_shared/shop-release.json'));
 if(support && output===resolve('../orbito/supabase/functions/_shared/shop-release.json'))throw Error('Support release must be staged separately until explicitly approved.');
 if(output.endsWith('shop-release-support-v1.json'))throw Error('The reviewed Support v1 candidate is immutable. Build a new version.');
 if(output===resolve(root,'../orbito/supabase/functions/_shared/shop-release.json')&&existsSync(output))throw Error('The accepted release is frozen. Write a new versioned artifact for owner review.');
 const artifact=buildRelease(root,{support});
 if(existsSync(output)&&JSON.parse(readFileSync(output,'utf8')).sha256!==artifact.sha256)throw Error('Existing release fingerprint differs. Choose a new versioned artifact path; pinned packages are immutable.');
 mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(artifact)+'\n');
 console.log(`Source-only release: ${artifact.migrations.length} migrations, ${artifact.functions.length} functions, ${artifact.sha256}`);
}
