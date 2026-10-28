import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import config from '../vite.config.js';
const sha=data=>createHash('sha256').update(data).digest('hex');
test('official artwork, local Inter and license are exact Platform reference bytes',()=>{
 for(const group of ['logos','app','favicons','fonts'])for(const file of readdirSync('public/brand/'+group)){
  const path='public/brand/'+group+'/'+file,reference=execFileSync('git',['-C','../orbito','show','864cdbc1c09184a72e33afe67aa4a4f516e78e68:'+path]);
  assert.equal(sha(readFileSync(path)),sha(reference),path);
 }
 for(const path of ['src/auth.js','src/features/login/login.css','src/features/login/background.js','src/features/login/ghost-fibers.js','src/style.css','public/sw.js'])assert.equal(readFileSync(path,'utf8').replaceAll('\r\n','\n'),execFileSync('git',['show','2dffa1ea:'+path],{encoding:'utf8'}).replaceAll('\r\n','\n'),path+' unchanged (checkout line endings normalized)');
 assert.equal(sha(readFileSync('public/vendor/JsBarcode-3.11.6.all.min.js')),'52e032534c3f98976ad95cb8c20baf80ed0cc83d42590602a8cf1db16e2e22ed');
 assert.match(readFileSync('public/vendor/JsBarcode-LICENSE.txt','utf8'),/MIT|Permission is hereby granted/);
});
test('dev and generated manifests agree on official identity without changing start URL or technical ID',()=>{
 const plugin=config({mode:'test'}).plugins.find(x=>x.name==='product-branding'),assets=[];let middleware,served;
 plugin.generateBundle.call({emitFile:asset=>assets.push(asset)});
 plugin.configureServer({middlewares:{use:fn=>middleware=fn}});
 middleware({url:'/manifest.webmanifest'},{setHeader(){},end:value=>served=value},()=>assert.fail('manifest missing'));
 const built=assets.find(x=>x.fileName==='manifest.webmanifest');assert.equal(served,built.source);
 const manifest=JSON.parse(served);assert.equal(manifest.name,'RetraSell POS');assert.equal(manifest.short_name,'RetraSell');assert.equal(manifest.start_url,'/');assert.equal(manifest.id,undefined);assert.equal(manifest.theme_color,'#0B1228');
 assert.deepEqual(manifest.icons.map(x=>[x.sizes,x.purpose]),[['192x192','any'],['512x512','any'],['512x512','maskable']]);
 for(const icon of manifest.icons)assert.ok(readFileSync('public'+icon.src).length>0);
 assert.ok(!readFileSync('public/sw.js','utf8').includes("addEventListener('fetch'"));
});
