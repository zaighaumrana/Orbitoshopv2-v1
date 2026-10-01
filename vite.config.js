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
  const env=loadEnv(mode,process.cwd(),'VITE_');
  return {
  plugins: [{
    name: 'product-branding',
    buildStart() {
      const missing=['VITE_SUPABASE_URL','VITE_SUPABASE_ANON','VITE_TURNSTILE_SITE_KEY'].filter(k=>!(process.env[k]||env[k])?.trim());
      if(missing.length)throw new Error('Shop browser configuration missing: '+missing.join(', '));
    },
    transformIndexHtml: { order: 'pre', handler: html => html.replaceAll('%PRODUCT_NAME%', escapeHTML(PRODUCT_NAME)) },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/manifest.webmanifest') return next()
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(manifest)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest })
    },
  }],
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  esbuild: {
    target: 'es2020',
  }
};
})
