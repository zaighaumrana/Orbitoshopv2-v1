// Customer-available release integrity. No private Platform source or provider calls.
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildRelease} from './build-platform-release.mjs';
import {installationPlan} from './backend-plan.mjs';
const root=resolve(import.meta.dirname,'..'),hash=x=>createHash('sha256').update(x).digest('hex');
const json=p=>JSON.parse(readFileSync(p,'utf8'));
export class ReleasePreflightError extends Error {}
const fail=message=>{throw new ReleasePreflightError('Preflight blocked: '+message)};
export function customerReleasePreflight(shop=root,expectedSha){
 try{
  const manifest=json(resolve(shop,'scripts/byo-release-manifest.json')),catalog=json(resolve(shop,'scripts/backend-release-catalog.json')),policy=catalog[manifest.sha256];
  if(expectedSha&&!/^[a-f0-9]{64}$/.test(expectedSha))fail('use the complete approved target SHA-256 displayed by Platform.');
  if(!/^[a-f0-9]{64}$/.test(manifest.sha256)||expectedSha&&manifest.sha256!==expectedSha||manifest.review_status!=='approved-shared'||!policy?.supported||!policy.approved_for_new||policy.release_id!==manifest.release_id||Object.values(catalog).filter(c=>c.approved_for_new).length!==1)fail('wrong or unapproved Shop checkout. Obtain the reviewed Shop development source or its explicitly approved immutable commit and match the target shown in Platform. Do not edit release metadata.');
  const release=buildRelease(shop,{support:true});
  if(release.sha256!==manifest.sha256||release.migrations.length!==manifest.migrations||release.functions.length!==manifest.functions)fail(`Shop source differs from approved ${manifest.release_id} (${manifest.migrations} migrations / ${manifest.functions} functions). Restore the reviewed checkout; never regenerate the immutable release to bypass this check.`);
  const migrationManifest=release.migrations.map(({version,name,sha256})=>({version,name,sha256})),functionManifest=release.functions.map(({name,verify_jwt,sha256})=>({name,verify_jwt,sha256}));
  if(policy.migrations!==manifest.migrations||policy.functions!==manifest.functions||policy.backend_source_commit!==manifest.backend_source_commit||JSON.stringify([...policy.requirements||[]].sort())!==JSON.stringify(release.requirements.requirements.map(r=>r.id).sort())||JSON.stringify(migrationManifest)!==JSON.stringify(policy.migration_manifest)||JSON.stringify(functionManifest)!==JSON.stringify(policy.function_manifest))fail('customer catalog provenance differs from the approved source. Restore the reviewed metadata.');
  const directories=readdirSync(resolve(shop,'supabase/functions'),{withFileTypes:true}).filter(d=>d.isDirectory()&&d.name!=='_shared').map(d=>d.name).sort();
  if(JSON.stringify(directories)!==JSON.stringify(release.functions.map(f=>f.name).sort()))fail('unaccounted Shop function source. Reconcile the reviewed checkout before continuing.');
  installationPlan(release,'byo');
  if(!/^[a-f0-9]{40}$/.test(manifest.backend_source_commit||''))fail('approved backend source revision missing. Restore the reviewed manifest.');
  const git=(...args)=>execFileSync('git',['-C',shop,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  try{
   if(!/github\.com[:/]zaighaumrana\/Orbitoshopv2-v1(?:\.git)?\s*$/i.test(git('remote','get-url','origin')))fail('this is not the approved Shop repository. Select the reviewed customer checkout.');
   git('merge-base','--is-ancestor',manifest.backend_source_commit,'HEAD');
   git('diff','--quiet',manifest.backend_source_commit,'--','supabase/migrations','supabase/functions','supabase/config.toml','scripts/backend-requirements.json');
  }catch(error){if(error instanceof ReleasePreflightError)throw error;fail('approved committed backend source cannot be established. Fetch the reviewed Shop history and preserve local changes; do not reset or adopt unknown source.');}
  return {release,manifest,catalog};
 }catch(error){if(error instanceof ReleasePreflightError)throw error;fail('Shop release files are missing or invalid. Run from the reviewed Shop checkout with Node 24 and Git. No provider operation started.');}
}
export function pairedReleasePreflight(shop,platform){
 try{
  const manifest=json(resolve(shop,'scripts/byo-release-manifest.json')),active=json(resolve(platform,'supabase/releases/active-shop-release.json'));
  const release=json(resolve(platform,'supabase/releases/shop-release-'+active.release_id+'.json')),{sha256,...body}=release;
  const source=readdirSync(resolve(shop,'supabase/migrations')).filter(f=>/^\d+_.+\.sql$/.test(f)).sort(),expected=release.migrations.map(m=>m.version+'_'+m.name+'.sql');
  if(active.release_id!==manifest.release_id||active.sha256!==manifest.sha256||sha256!==active.sha256||hash(JSON.stringify(body))!==sha256||JSON.stringify(source)!==JSON.stringify(expected))fail(`incompatible release workspaces. Shop expects ${manifest.release_id} (${source.length} source migrations); Platform selects ${active.release_id} (${expected.length} packaged migrations). Shop: ${shop}. Platform: ${platform}. Check RETRASELL_PLATFORM_SOURCE and use reviewed compatible Platform development source or its explicitly approved immutable commit. Preserve local changes; do not regenerate packages. External customers: use node scripts/release-preflight.mjs instead; private Platform source is not required.`);
  const fresh=json(resolve(platform,'supabase/releases/approved-shop-releases.json')).filter(c=>c.approved_for_new);
  if(fresh.length!==1||fresh[0].release_id!==active.release_id||fresh[0].sha256!==active.sha256||!fresh[0].supported)fail('incompatible release workspaces: Platform approval catalog and active selector disagree. Restore the reviewed compatible Platform source; do not edit historical packages.');
  return {shop,platform,release_id:active.release_id,sha256};
 }catch(error){if(error instanceof ReleasePreflightError)throw error;fail(`paired Platform release files are unavailable at ${platform}. Check the sibling checkout or RETRASELL_PLATFORM_SOURCE. External customers use node scripts/release-preflight.mjs; do not obtain private Platform access merely for a customer upgrade.`);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);if(args.length&&(args.length!==2||args[0]!=='--expected-sha'))fail('use node scripts/release-preflight.mjs [--expected-sha APPROVED_TARGET_SHA256].');
  const {manifest}=customerReleasePreflight(root,args[1]);console.log(`PASS customer release preflight: ${manifest.release_id}, ${manifest.migrations} migrations, ${manifest.functions} functions, SHA-256 ${manifest.sha256}. Local source integrity only; installed Shop evidence and Platform approval remain required.`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
