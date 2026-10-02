// Local, deterministic, source-only release. Never reads .env or contacts Supabase.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const output=resolve(process.argv[2] || '../orbito/supabase/functions/_shared/shop-release.json');
const sha=value=>createHash('sha256').update(value).digest('hex');
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]).sort();}
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
// ZIP STORE; paths and timestamps are stable. Include shared relative imports.
function zip(files){let offset=0;const chunks=[],central=[];
 for(const [path,content] of files){const name=Buffer.from(path),data=Buffer.from(content),crc=crc32(data),header=Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26);
  chunks.push(header,name,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(33,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=header.length+name.length+data.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...chunks,directory,end]);
}
const base=resolve(root,'supabase/functions');
const config=readFileSync(resolve(root,'supabase/config.toml'),'utf8');
const shared=walk(resolve(base,'_shared')).filter(p=>p.endsWith('.ts')).map(p=>[relative(base,p).replaceAll('\\','/'),readFileSync(p,'utf8')]);
const functions=['account-admin','login','password-reset-request','public-track','verify-pin','platform-bridge'].map(name=>{
 const files=[...shared,...walk(resolve(base,name)).filter(p=>p.endsWith('.ts')).map(p=>[relative(base,p).replaceAll('\\','/'),readFileSync(p,'utf8')])].sort(([a],[b])=>a.localeCompare(b));
 const bytes=zip(files);const section=config.split(`[functions.${name}]`)[1]?.split('[functions.')[0];
 if(!section?.match(/verify_jwt\s*=\s*(true|false)/))throw Error('Explicit gateway configuration required: '+name);
 return {name,entrypoint:name+'/index.ts',verify_jwt:section.includes('verify_jwt = true'),sha256:sha(bytes),zip:bytes.toString('base64')};
});
const migrations=readdirSync(resolve(root,'supabase/migrations')).filter(p=>/^\d+_.+\.sql$/.test(p)).sort().map(file=>{
 const sql=readFileSync(resolve(root,'supabase/migrations',file),'utf8').replaceAll('\r\n','\n');return {version:file.split('_')[0],name:file.slice(file.indexOf('_')+1,-4),sql,sha256:sha(sql)};
});
const artifact={contract:'orbito-managed-release-v1',migrations,functions};
artifact.sha256=sha(JSON.stringify(artifact));
writeFileSync(output,JSON.stringify(artifact)+'\n');
console.log(`Source-only release: ${migrations.length} migrations, ${functions.length} functions, ${artifact.sha256}`);
