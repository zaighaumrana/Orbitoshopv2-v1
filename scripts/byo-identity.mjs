// Customer numbers are scoped to a Platform database, not permanent identities.
// The old protected installation is identified by its exact project, not id=1.
export const PROTECTED_SHOP_PROJECTS=new Set(['kxmovywgshyltwusghhj']);
export function validClientId(value){return /^[1-9][0-9]*$/.test(String(value))&&Number.isSafeInteger(Number(value))&&Number(value)<=2147483647}
export function validShopProject(ref){return /^[a-z]{20}$/.test(ref||'')&&!PROTECTED_SHOP_PROJECTS.has(ref)}
