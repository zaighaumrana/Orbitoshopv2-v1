import metadata from './metadata.json'
import { customerDocument, readPublicPublication, legalConfigurationReady } from './readiness.js'
import terms from '../../docs/legal/TERMS_OF_SERVICE.md?raw'
import privacy from '../../docs/legal/PRIVACY_NOTICE.md?raw'
import dpa from '../../docs/legal/DATA_PROCESSING_ADDENDUM.md?raw'
import guide from '../../docs/user-guide/ORBITOSHOP_USER_GUIDE.md?raw'
import quickStart from '../../docs/user-guide/QUICK_START_GUIDE.md?raw'
import { escapeHTML as esc } from '../html.js'
import { renderDocument } from './render.js'
import './legal.css'

const texts = {terms,privacy,dpa,guide,'quick-start':quickStart}
const requested = new URLSearchParams(location.search).get('doc')
const key = Object.prototype.hasOwnProperty.call(texts, requested) ? requested : 'guide'
const doc = metadata.documents[key]
async function showPage() {
const publication = legalConfigurationReady()
  ? await readPublicPublication(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON)
  : null
const {text,finalized} = customerDocument(key,texts[key],publication)
if (!finalized) {
  location.replace('/legal.html?doc=guide')
  return
}
const legalAvailable = customerDocument('terms',texts.terms,publication).finalized
const {body,contents} = renderDocument(text)
try { document.documentElement.dataset.theme = localStorage.getItem('retailos-theme') || 'light' } catch {}
document.title = doc.title
document.getElementById('legal-page').innerHTML = `
  <a class="legal-skip" href="#document">Skip to document</a>
  <header class="legal-header"><a href="/">Return to app</a><button id="legal-theme" class="secondary-button">Switch theme</button></header>
  <nav class="legal-links" aria-label="${['terms','privacy','dpa'].includes(key) ? 'Legal documents' : 'Help guides'}">${Object.entries(metadata.documents).filter(([slug]) => ['terms','privacy','dpa'].includes(key) ? legalAvailable && ['terms','privacy','dpa'].includes(slug) : ['guide','quick-start'].includes(slug)).map(([slug,item])=>`<a href="/legal.html?doc=${slug}" ${slug === key ? 'aria-current="page"' : ''}>${esc(item.title)}</a>`).join('')}</nav>
  ${finalized ? `<p class="muted">Version ${esc(doc.version)} · Effective ${esc(doc.effectiveDate)}</p>` : ''}
  <div class="legal-reading"><aside><details open><summary>On this page</summary><nav aria-label="On this page">${contents.map(item=>`<a href="#${item.id}">${esc(item.title)}</a>`).join('')}</nav></details></aside>
  <article id="document" tabindex="-1">${body}</article></div>
  <footer><p>${['terms','privacy','dpa'].includes(key) ? 'Legal &amp; Privacy' : 'Help &amp; User Guide'}</p><a href="#legal-page">Back to top</a></footer>`
document.getElementById('legal-theme').onclick = () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
}
}
void showPage()
