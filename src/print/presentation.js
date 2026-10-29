// Owner decision M3-OA-01 supersedes D05's former per-print opt-in.
// Presentation only: no settings, storage, money, document IDs or command state.
const footer = '<div data-product-attribution style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;margin-top:10px;padding-top:6px;border-top:1px dotted #aaa;color:#333;font:9px/1.4 Arial,sans-serif;text-align:center;break-inside:avoid"><img src="/brand/logos/retrasell-horizontal-primary.svg" alt="RetraSell" width="84" height="18" style="display:block;width:84px;height:18px;object-fit:contain"><span>Powered by RetraSell</span></div>';
export function withPrintAttribution(html) {
  // Builders, preview and queue may all see this document; brand it only once.
  if (/<[^>]+\bdata-product-attribution(?:\s|[=>])/i.test(html)) return html;
  // Move an exact legacy footer attribution to the end, retaining its text once.
  // Restrict this to the known footer element, never transaction fields.
  const body = html.replace(/<div class="c sm">\s*Powered by RetraSell\s*<\/div>/g, '');
  return body + footer;
}
