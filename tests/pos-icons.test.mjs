import test from 'node:test';import assert from 'node:assert/strict';
import {registry,metadata,artwork,resolveIcon,iconHTML,iconAllowed,normalizeBrand,brandIcon,brandChoices} from '../src/catalog/icons.js';
test('registry contract has 36 unique safe paths, aliases and terminating fallback chains',()=>{
 assert.equal(registry.schemaVersion,1);assert.equal(registry.assets.length,36);assert.equal(Object.keys(artwork).length,0);
 assert.equal(metadata.size,36);const paths=new Set(),aliases=new Set();
 for(const a of registry.assets){assert.match(a.id,new RegExp(registry.idPattern));assert.equal(a.path,a.category+'/'+a.filename);assert.ok(!a.path.includes('..'));assert.ok(!paths.has(a.path));paths.add(a.path);const seen=new Set();let id=a.id;while(id!=='generic.item'){assert.ok(!seen.has(id));seen.add(id);assert.ok(metadata.has(id));id=metadata.get(id).fallbackId}for(const alias of a.aliases){assert.equal(alias,normalizeBrand(alias));assert.ok(!aliases.has(alias));aliases.add(alias)}}
});
test('empty and incomplete artwork maps safely resolve context fallbacks and corrupt cycles',()=>{
 for(const category of Object.keys(registry.categories)){for(const id of [null,'future.unknown','https://evil.invalid/x.svg','<svg>']){assert.equal(resolveIcon(id,category).id,registry.categories[category].fallbackId);assert.equal(resolveIcon(id,category).url,null)}}
 assert.equal(resolveIcon('brand.apple','accessory',{'accessory.generic':'local-placeholder'}).id,'accessory.generic');
 assert.deepEqual(resolveIcon('brand.apple','brand',{'generic.item':'local-terminal'}),{id:'generic.item',url:'local-terminal'});
 const corrupt=new Map(metadata);corrupt.set('brand.apple',{category:'brand',fallbackId:'brand.apple'});assert.equal(resolveIcon('brand.apple','brand',{},corrupt).url,null);
 assert.doesNotMatch(iconHTML('<img onerror=alert(1)>','brand'),/onerror|http|<img/);
 assert.equal(iconAllowed('brand.apple',['repair','generic']),false);
});
test('brand aliases are exact NFKC matches and manual text never creates a brand',()=>{
 assert.equal(brandIcon('  ＩＰＨＯＮＥ '),'brand.apple');assert.equal(brandIcon('i   phone'),'brand.apple');assert.equal(brandIcon('Mi'),'brand.xiaomi');
 assert.equal(brandIcon('Redmi'),'brand.redmi');assert.equal(brandIcon('POCO'),'brand.poco');assert.equal(brandIcon('Samsung-ish'),'brand.generic_phone');
 const rows=[{display_name:'Merchant Brand',icon_id:'brand.oppo',enabled:true},{display_name:'Retired Brand',icon_id:'brand.vivo',enabled:false}];
 assert.equal(brandIcon('Retired Brand',rows),'brand.vivo');assert.deepEqual(brandChoices(rows).map(b=>b.display_name),['Merchant Brand']);assert.equal(rows.length,2);
});
