// POS-only paging presentation; keeps the existing bounded page/count contract.
import {pageControls} from '../../bounded-read.js'
export function posPageControls(page,attribute,selector,expanded=false,ready=true){
  const name=selector==='inventory'?'Inventory':'Catalog'
  const action=expanded?'':`<button type="button" class="secondary-button" data-action="expand-pos-selector" data-selector="${selector}" aria-label="Expand ${name}" ${ready?'':'disabled'}>⛶ Expand view</button>`
  return pageControls(page,attribute).replace('rs-pagination"','rs-pagination rs-compact-pagination"')
    .replace('>Previous<',` aria-label="Previous ${name} page">‹<`).replace('>Next<',` aria-label="Next ${name} page">›<`)
    .replace(/(<span class="muted rs-pagination-summary">.*?<\/span>)/,`<span class="rs-pos-page-center">$1${action}</span>`)
}
