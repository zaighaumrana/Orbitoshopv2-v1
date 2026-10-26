import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const platform=resolve(process.env.RETRASELL_PLATFORM_SOURCE||resolve(import.meta.dirname,'../../orbito'));
const {validateWorkspace}=await import(pathToFileURL(resolve(platform,'scripts/release-parity.mjs')).href);
const args=process.argv.slice(2);
if(args.length&&(args.length!==2||args[0]!=='--candidate'||!/^support-v[0-9]+$/.test(args[1])))throw Error('Use --candidate RELEASE_ID, or no arguments for the approved active release');
console.log((args.length?'PASS local candidate parity ':'PASS release parity ')+JSON.stringify(await validateWorkspace(platform,resolve(import.meta.dirname,'..'),args[1])));
