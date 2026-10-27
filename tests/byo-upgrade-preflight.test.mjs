import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';
import {customerReleasePreflight,pairedReleasePreflight} from '../scripts/release-preflight.mjs';
import {nativeCliCandidates,findNativeCli} from '../scripts/setup-byo.mjs';
import {inspectBackend} from '../scripts/inspect-backend.mjs';
import {upgradeBackend} from '../scripts/upgrade-backend.mjs';
const root=resolve(import.meta.dirname,'..'),platform=resolve(root,'../orbito');
const manifest=JSON.parse(readFileSync(join(root,'scripts/byo-release-manifest.json')));
const help='--linked --project-ref --file --output-format --use-api --env-file';
test('customer integrity needs no Platform input; one correct and one stale paired preflight',()=>{
 const result=customerReleasePreflight(root,manifest.sha256);assert.equal(result.release.migrations.length,39);assert.equal(result.release.functions.length,7);assert.equal(result.release.sha256,'c4d210d009de9c57acf0c9af7fc41053632a95439ea24a68aa6e22f724d6bada');
 assert.equal(pairedReleasePreflight(root,platform).sha256,manifest.sha256);
 assert.throws(()=>customerReleasePreflight(root,'0'.repeat(64)),/wrong or unapproved Shop checkout/);
 const temp=mkdtempSync(join(tmpdir(),'retrasell-stale-pair-'));
 try{
  const releases=join(temp,'supabase/releases');mkdirSync(releases,{recursive:true});
  const old=JSON.parse(readFileSync(join(platform,'supabase/releases/shop-release-support-v6.json')));
  writeFileSync(join(releases,'active-shop-release.json'),JSON.stringify({release_id:'support-v6',sha256:old.sha256}));
  // Only selector/inventory is needed to exercise the known-incompatible early stop.
  writeFileSync(join(releases,'shop-release-support-v6.json'),JSON.stringify({sha256:old.sha256,migrations:old.migrations.map(({version,name})=>({version,name}))}));
  assert.throws(()=>pairedReleasePreflight(root,temp),error=>/incompatible release workspaces/.test(error.message)&&/39 source migrations/.test(error.message)&&/38 packaged migrations/.test(error.message)&&/RETRASELL_PLATFORM_SOURCE/.test(error.message));
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('native PATH discovery selects a compatible executable and keeps explicit override support',()=>{
 const temp=mkdtempSync(join(tmpdir(),'retrasell-native-path-'));
 try{
  const first=join(temp,'first'),second=join(temp,'second');mkdirSync(first);mkdirSync(second);
  const name=process.platform==='win32'?'supabase.exe':'supabase',a=join(first,name),b=join(second,name);writeFileSync(a,'');writeFileSync(b,'');
  const candidates=nativeCliCandidates({Path:[first,second].join(process.platform==='win32'?';':':'),npm_config_cache:join(temp,'absent')},temp);
  assert.deepEqual(candidates,[a,b]);const calls=[];
  const invoke=(exe,args)=>{calls.push({exe,args});return args[0]==='--version'?(exe===a?'1.0.0':'2.120.0'):help;};
  assert.equal(findNativeCli(undefined,invoke,candidates),b);assert.equal(findNativeCli(b,invoke),b);
  assert.ok(calls.every(c=>!c.args.includes('npx')));assert.throws(()=>findNativeCli(undefined,()=>'',[]),/Scoop.*reopen PowerShell/);assert.throws(()=>findNativeCli('supabase.cmd',invoke),/native Supabase executable/);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('inspection reports exact inaccessible-project recovery; unknown upgrade source stops before CLI access',async()=>{
 let queries=0,invocations=0;
 const execute=(_exe,args)=>args[0]==='--version'?'2.120.0':args.includes('--help')?help:'[]';
 await assert.rejects(inspectBackend(['--project-ref','abcdefghijklmnopqrst','--client-id','1','--cli','synthetic.exe'],{execute,query:()=>{queries++;}}),/correct customer account|customer account/);assert.equal(queries,0);
 await assert.rejects(upgradeBackend(['--mode','byo','--project-ref','abcdefghijklmnopqrst','--client-id','1','--from-sha','0'.repeat(64),'--journal',join(tmpdir(),'not-written-upgrade.json'),'--review'],{invoke:()=>{invocations++;}}),/source release/);assert.equal(invocations,0);
});
