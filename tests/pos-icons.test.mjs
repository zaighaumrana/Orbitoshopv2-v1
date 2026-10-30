import test from 'node:test';import assert from 'node:assert/strict';
import {registry,metadata,artwork,resolveIcon,iconHTML,iconAllowed,normalizeBrand,brandIcon,brandChoices} from '../src/catalog/icons.js';
test('registry contract has 36 unique safe paths, aliases and terminating fallback chains',()=>{
 assert.equal(registry.schemaVersion,1);assert.equal(registry.assets.length,36);assert.equal(Object.keys(artwork).length,36);
 assert.equal(metadata.size,36);const paths=new Set(),aliases=new Set();
 for(const a of registry.assets){assert.match(a.id,new RegExp(registry.idPattern));assert.equal(a.path,a.category+'/'+a.filename);assert.ok(!a.path.includes('..'));assert.ok(!paths.has(a.path));paths.add(a.path);const seen=new Set();let id=a.id;while(id!=='generic.item'){assert.ok(!seen.has(id));seen.add(id);assert.ok(metadata.has(id));id=metadata.get(id).fallbackId}for(const alias of a.aliases){assert.equal(alias,normalizeBrand(alias));assert.ok(!aliases.has(alias));aliases.add(alias)}}
});
test('empty and incomplete artwork maps safely resolve context fallbacks and corrupt cycles',()=>{
 for(const category of Object.keys(registry.categories)){for(const id of [null,'future.unknown','https://evil.invalid/x.svg','<svg>']){assert.equal(resolveIcon(id,category,{}).id,registry.categories[category].fallbackId);assert.equal(resolveIcon(id,category,{}).svg,null)}}
 assert.equal(resolveIcon('brand.apple','accessory',{'accessory.generic':'local-placeholder'}).id,'accessory.generic');
 assert.deepEqual(resolveIcon('brand.apple','brand',{'generic.item':'local-terminal'}),{id:'generic.item',svg:'local-terminal'});
 const corrupt=new Map(metadata);corrupt.set('brand.apple',{category:'brand',fallbackId:'brand.apple'});assert.equal(resolveIcon('brand.apple','brand',{},corrupt).svg,null);
 assert.doesNotMatch(iconHTML('<img onerror=alert(1)>','brand'),/onerror|<img/);assert.match(iconHTML('brand.samsung','brand'),/aria-hidden="true"/);
 assert.equal(iconAllowed('brand.apple',['repair','generic']),false);
});
test('brand aliases are exact NFKC matches and manual text never creates a brand',()=>{
 assert.equal(brandIcon('  ＩＰＨＯＮＥ '),'brand.apple');assert.equal(brandIcon('i   phone'),'brand.apple');assert.equal(brandIcon('Mi'),'brand.xiaomi');
 assert.equal(brandIcon('Redmi'),'brand.redmi');assert.equal(brandIcon('POCO'),'brand.poco');assert.equal(brandIcon('Samsung-ish'),'brand.generic_phone');
 const rows=[{display_name:'Merchant Brand',icon_id:'brand.oppo',enabled:true},{display_name:'Retired Brand',icon_id:'brand.vivo',enabled:false}];
 assert.equal(brandIcon('Retired Brand',rows),'brand.vivo');assert.deepEqual(brandChoices(rows).map(b=>b.display_name),['Merchant Brand']);assert.equal(rows.length,2);
});

test('all 36 approved V1.0.1 local SVG bytes and trusted renderers match the production manifest',async()=>{
 const {readFileSync}=await import('node:fs'),{createHash}=await import('node:crypto');
 const manifest=JSON.parse(readFileSync(new URL('../src/catalog/production-manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.deliveryVersion,'1.0.1');assert.equal(manifest.assets.length,36);
 for(const a of manifest.assets){const bytes=readFileSync(new URL('../src/catalog/assets/'+a.registryPath,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);assert.equal(artwork[a.id],bytes.toString('utf8').trim());assert.equal(resolveIcon(a.id,metadata.get(a.id).category).id,a.id)}
});


test('Shop icon preferences filter offerings, escape labels and preserve saved hidden assignments',async()=>{
 const {setIconPreferences}=await import('../src/catalog/icon-preferences.js');const {iconSelector}=await import('../src/catalog/icons.js');
 try{
  setIconPreferences([{icon_id:'accessory.cable',display_name:'Cable <script>unsafe</script>',enabled_contexts:['inventory']},{icon_id:'unknown.url',display_name:'Ignored',enabled_contexts:['catalog']}]);
  assert.doesNotMatch(iconSelector('icon_id','',['accessory','generic'],'catalog'),/value="accessory.cable"/);
  const inventory=iconSelector('icon_id','',['accessory','generic'],'inventory');assert.match(inventory,/Cable &lt;script&gt;unsafe&lt;\/script&gt;/);assert.doesNotMatch(inventory,/<script>/);
  const retained=iconSelector('icon_id','accessory.cable');assert.match(retained,/value="accessory.cable" checked/);assert.match(retained,/value=""/);
  setIconPreferences();assert.match(iconSelector('icon_id'),/value="accessory.cable"/);
 }finally{setIconPreferences()}
});
