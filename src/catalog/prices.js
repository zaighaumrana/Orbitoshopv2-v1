// Presentation/input boundary only. Preserve valid stored numbers without coercion.
// In particular, null/blank/boolean/string values must never become zero-priced sales.
export function quickPrice(value){
 const object=value!==null&&typeof value==='object'&&!Array.isArray(value)
 const price=object?value.price:value
 if(typeof price!=='number'||!Number.isFinite(price)||price<0)return null
 return {name:object&&typeof value.name==='string'?value.name:'',price}
}
export const quickPrices=values=>Array.isArray(values)?values.map(quickPrice).filter(Boolean):[]
