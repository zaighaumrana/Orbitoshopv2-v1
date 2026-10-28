import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {tmpdir} from 'node:os';import {resolve,join,dirname,basename} from 'node:path';import {spawnSync} from 'node:child_process';
import {upgradeBackend,parseUpgradeArgs} from '../scripts/upgrade-backend.mjs';
import {createByoUpgradeGuide,powershellValue} from '../../orbito/src/byo-upgrade-guide.js';
import {assessBackend} from '../scripts/backend-inventory.ts';
const root=resolve(import.meta.dirname,'..'),catalog=JSON.parse(fs.readFileSync(join(root,'scripts/backend-release-catalog.json')));
const [sourceSha,source]=Object.entries(catalog).find(([,r])=>r.release_id==='support-v6'),[targetSha,target]=Object.entries(catalog).find(([,r])=>r.approved_for_new);
const ref='abcdefghijklmnopqrst',platform='zyxwvutsrqponmlkjihg',sourceId='99800000-0000-4000-8000-000000000001',binding='fixture-client-1';
const identity={client_id:1,project_ref:ref,source_id:sourceId,client_binding:binding};
const observation={shop:{...identity,owner_ready:true,owner_busy:false,invalid_config_receipts:0},migrations:source.migration_manifest,functions:source.function_manifest.map(f=>({...f,present:true,source_sha256:null})),runtime_ready:true};
test('real read-only assessment and copied inventory/assessment blocks succeed in fresh terminals without inherited variables',async()=>{
 const temp=fs.mkdtempSync(join(tmpdir(),'retrasell-guide-repair-'));
 try{
  const repo=join(temp,'Shop (reviewed)'),privateDir=join(temp,'Private client files');fs.mkdirSync(join(repo,'scripts'),{recursive:true});fs.mkdirSync(privateDir);
  for(const script of ['release-preflight','inspect-backend','upgrade-backend'])fs.writeFileSync(join(repo,'scripts',script+'.mjs'),'// synthetic native transport only');
  let writes=0;const query=async sql=>{assert.ok(sql.startsWith('select '),'Assessment must never issue SQL writes');if(sql.includes('schema_migrations'))return observation.migrations;if(sql.includes('from public.shop_config'))return [observation.shop];return [{runtime:{owner_account:'active',checks:{database:true}}}];};
  const invoke=args=>{if(args[0]==='--version')return '2.120.0';if(args.includes('--help'))return '--linked --project-ref --file --output-format --use-api --env-file';if(args[0]==='projects')return JSON.stringify([{id:ref}]);if(args[0]==='functions'&&args[1]==='list')return JSON.stringify(observation.functions);writes++;throw Error('Unexpected provider write');};
  const reportFile=join(privateDir,'fixture-assessment.json'),journal=join(privateDir,'upgrade-journal.json');
  const assessment=await upgradeBackend(['--mode','byo','--project-ref',ref,'--client-id','1','--from-sha',sourceSha,'--journal',journal,'--report',reportFile,'--cli','synthetic.exe','--review'],{query,invoke,report:()=>{}});
  assert.equal(assessment.contract,'retrasell-byo-upgrade-assessment-v1');assert.equal(assessment.plan.steps.length,1);assert.equal(writes,0);assert.equal(fs.existsSync(journal),false);assert.ok(fs.existsSync(reportFile));
  const policies=Object.entries(catalog).map(([sha256,p])=>({...p,sha256}));
  const inventory={...identity,read_only:true,...assessBackend(policies,Object.fromEntries(policies.map(p=>[p.release_id,{migrations:p.migration_manifest,functions:p.function_manifest}])),{...observation,origin:'customer-authorized-cli'})};
  const guide=createByoUpgradeGuide({id:1,name:'Fixture',pairing_mode:'byo',supabase_url:`https://${ref}.supabase.co`},{platformUrl:`https://${platform}.supabase.co`,source:sourceSha,inventory:{clientId:1,mode:'byo',...identity,catalog:policies},detail:{clientId:1,operations:{source:{source_id:sourceId}},provisioning:{connection:{project_ref:ref,client_binding:binding}}},workflow:{draft:{'upgrade-guide-shop-path':{value:repo},'upgrade-guide-private-path':{value:privateDir}}}});
  assert.equal(guide.blockers.length,0);
  for(const [index,fixture,success]of [[5,inventory,/PASS: inventory saved and identity checked/],[6,assessment,/PASS: read-only assessment created and identity\/source\/target\/plan checked/]]){
   const command=guide.stages[index].commands[0],json=Buffer.from(JSON.stringify(fixture)).toString('base64');
   // Fresh PowerShell process, real paths with spaces/parentheses, no stage variables.
   // Only native node transport is doubled; generated assertions and file parsing run.
   const harness=`$Fixture = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${json}'))
function Read-Host { return '' }
function node {
 $a = @($args)
 $global:LASTEXITCODE = 0
 if ($a[0] -eq 'scripts/release-preflight.mjs') { return }
 $i = [Array]::IndexOf($a,'--report')
 if ($i -lt 0) { throw 'No report output supplied' }
 [IO.File]::WriteAllText($a[$i+1],$Fixture,[Text.UTF8Encoding]::new($false))
}
try {
${command}
} catch { Write-Output ('STOP: '+$_.Exception.Message); exit 1 }
`;
   const harnessFile=join(temp,'fresh-terminal-'+index+'.ps1');fs.writeFileSync(harnessFile,harness);
   const p=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',harnessFile],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1e6});
   assert.equal(p.status,0,(p.stdout+p.stderr).slice(-1500));assert.match(p.stdout,success);assert.doesNotMatch(p.stdout,/STOP:/);assert.equal(fs.existsSync(journal),false);
   // Every guide block is syntactically parsed; none of the apply/tool/git commands run.
  }
  const commands=guide.stages.flatMap(s=>s.commands),encoded=Buffer.from(JSON.stringify(commands)).toString('base64');
  const parse=`$commands = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json
foreach ($command in $commands) { $tokens=$null; $errors=$null; [Management.Automation.Language.Parser]::ParseInput($command,[ref]$tokens,[ref]$errors) | Out-Null; if ($errors.Count) { Write-Output $errors; exit 1 } }
Write-Output 'PASS: generated blocks parsed'
`;
  const parseFile=join(temp,'parse-only.ps1');fs.writeFileSync(parseFile,parse);
  const parsed=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',parseFile],{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1e6});assert.equal(parsed.status,0,parsed.stdout+parsed.stderr);assert.match(parsed.stdout,/PASS: generated blocks parsed/);
 }finally{assert.equal(dirname(resolve(temp)),resolve(tmpdir()));assert.ok(basename(temp).startsWith('retrasell-guide-repair-'));fs.rmSync(temp,{recursive:true,force:true});}
});

test('invalid upgrade inputs give specific actionable diagnostics and a nonzero CLI exit',()=>{
 const good=['--mode','byo','--project-ref',ref,'--client-id','1','--from-sha',sourceSha,'--journal','C:/Private/original.json','--review'];
 for(const [flag,pattern]of [['--project-ref',/Missing Shop project/],['--client-id',/Missing client ID/],['--from-sha',/Missing source SHA/],['--journal',/Missing journal path/]]){
  const a=[...good],at=a.indexOf(flag);a.splice(at,2);assert.throws(()=>parseUpgradeArgs(a),pattern);
 }
 assert.throws(()=>parseUpgradeArgs(good.slice(0,-1)),/No operation selected/);assert.throws(()=>parseUpgradeArgs([...good,'--apply']),/never both/);
 const invalid=[...good];invalid[invalid.indexOf('--client-id')+1]='0';assert.throws(()=>parseUpgradeArgs(invalid),/Invalid client ID/);
 const p=spawnSync(process.execPath,['scripts/upgrade-backend.mjs','--mode','byo'],{cwd:root,encoding:'utf8',windowsHide:true});assert.notEqual(p.status,0);assert.match(p.stderr,/Missing Shop project/);assert.doesNotMatch(p.stderr,/Specify exact BYO|secret|password/i);
});
