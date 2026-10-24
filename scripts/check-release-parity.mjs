import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const platform=resolve(process.env.RETRASELL_PLATFORM_SOURCE||resolve(import.meta.dirname,'../../orbito'));
const {validateWorkspace}=await import(pathToFileURL(resolve(platform,'scripts/release-parity.mjs')).href);
console.log('PASS release parity '+JSON.stringify(await validateWorkspace(platform,resolve(import.meta.dirname,'..'))));
