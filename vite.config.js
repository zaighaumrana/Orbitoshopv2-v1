import {validatePublicConfig,trackerPublicConfig} from './scripts/byo-public-config.mjs'
import { defineConfig, loadEnv } from 'vite'
import { readFileSync } from 'node:fs'
import { PRODUCT_NAME, SHORT_BRAND_NAME } from './src/config/brand.js'
import { escapeHTML } from './src/html.js'

// One source for JS copy, static HTML titles and install metadata, in dev/build.
const manifest = JSON.stringify({
  ...JSON.parse(readFileSync(new URL('./public/manifest.webmanifest', import.meta.url), 'utf8')),
  name: PRODUCT_NAME, short_name: SHORT_BRAND_NAME,
})

export default defineConfig(({mode}) => {
  const env=process.env.RETRASELL_CLEAN_PUBLIC_BUILD==='1'?{}:loadEnv(mode,process.cwd(),'VITE_');
  const config=Object.fromEntries(['VITE_SUPABASE_URL','VITE_SUPABASE_ANON','VITE_TURNSTILE_SITE_KEY'].map(k=>[k,process.env[k]||env[k]]));
  return {
  define: Object.fromEntries(Object.entries(config).map(([k,v])=>['import.meta.env.'+k,JSON.stringify(v)])),
  plugins: [{
    name: 'product-branding',
    buildStart() {
      const missing=['VITE_SUPABASE_URL','VITE_SUPABASE_ANON','VITE_TURNSTILE_SITE_KEY'].filter(k=>!(process.env[k]||env[k])?.trim());
      if(missing.length)throw new Error('Shop browser configuration missing: '+missing.join(', '));
      const ref=/^https:\/\/([a-z]{20})\.supabase\.co$/.exec(config.VITE_SUPABASE_URL)?.[1];
      if(!ref)throw Error('Exact customer Supabase URL required');
      validatePublicConfig(config,ref);
    },
    transformIndexHtml: { order: 'pre', handler: html => html.replaceAll('%PRODUCT_NAME%', escapeHTML(PRODUCT_NAME)) },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] === '/shop-public-config.js') {
          res.setHeader('Content-Type', 'application/javascript')
          res.setHeader('Cache-Control', 'no-store')
          res.end(trackerPublicConfig(config))
          return
        }
        if (req.url?.split('?')[0] !== '/manifest.webmanifest') return next()
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(manifest)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest })
      this.emitFile({ type: 'asset', fileName: 'shop-public-config.js', source: trackerPublicConfig(config) })
    },
  }],
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: { input: { app: 'index.html', legal: 'legal.html' } },
  },
  esbuild: {
    target: 'es2020',
  }
};
})
