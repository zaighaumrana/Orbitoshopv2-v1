import release from '../../scripts/byo-release-manifest.json' with {type:'json'};
import {escapeHTML as esc} from '../html.js';
export function backendUpgradeGuidance(){return `<details class="card"><summary>Backend release and customer-controlled upgrades</summary>
 <p>Approved fresh-install source: <strong>${esc(release.release_id)}</strong><br>Fingerprint: ${esc(release.sha256)}</p>
 <p>Installed source on this Shop: Unable to verify from this screen. A healthy older supported Shop may continue operating. Release availability does not authorize an upgrade or prove unhealthy service.</p>
 <p>For a BYO Shop, ask your customer administrator to run the reviewed read-only upgrade assessment with the exact project, client and source fingerprint. The Platform Master reviews pending operations and approves that exact plan. The administrator then confirms it separately in their own Supabase CLI, retaining its original private journal.</p>
 <p>The CLI shows the exact target/source, missing changes, checkpoint progress and verification limitations. An uncertain result requires review of the original operation. No administrative key, password, approval file or private journal should be pasted into this Shop screen or a Support request.</p>
 <p>Managed upgrades use the Master-approved Platform workflow. Final source and hosted acceptance remain separate from an installation receipt.</p>
 <a href="https://github.com/zaighaumrana/Orbitoshopv2-v1/blob/development/docs/CONTROLLED_BACKEND_UPGRADES.md" target="_blank" rel="noopener noreferrer">Reviewed customer upgrade procedure</a></details>`;}
