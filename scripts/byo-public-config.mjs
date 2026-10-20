// Static checks only. A real browser challenge is required to verify CAPTCHA.
export class ConfigurationError extends Error {}
const fail=message=>{throw new ConfigurationError(message)};
export function validatePublicConfig(config,ref){
 const keys=['VITE_SUPABASE_URL','VITE_SUPABASE_ANON','VITE_TURNSTILE_SITE_KEY'];
 if(!config||Array.isArray(config)||typeof config!=='object'||Object.keys(config).some(k=>!keys.includes(k))||keys.some(k=>typeof config[k]!=='string'||!config[k].trim()||/[\s<>"']/.test(config[k])))fail('Public JSON must contain only the three documented browser fields, with completed values. Never put private runtime settings here.');
 if(config.VITE_SUPABASE_URL!==`https://${ref}.supabase.co`)fail('Public frontend project differs from the exact pairing target. Correct the public JSON before installation.');
 let claims;try{claims=JSON.parse(Buffer.from(config.VITE_SUPABASE_ANON.split('.')[1],'base64url').toString())}catch{fail('Use the customer project’s public legacy anon JWT in the public JSON.');}
 if(claims.role!=='anon'||claims.ref!==ref||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000)fail('Public anon JWT is expired, privileged or belongs to another project. Use this customer project’s public legacy anon JWT.');
 if(!/^[A-Za-z0-9_-]{10,200}$/.test(config.VITE_TURNSTILE_SITE_KEY)||/^(?:[123]x0+|replace|your|example)/i.test(config.VITE_TURNSTILE_SITE_KEY))fail('Use the actual public Turnstile site key for this customer hostname, rather than a placeholder or testing key.');
 return config;
}
export function validateTurnstileSecret(secret,siteKey){
 if(typeof secret!=='string'||!secret.trim())fail('Missing server-only TURNSTILE_SECRET in the private runtime file.');
 if(siteKey&&secret===siteKey)fail('TURNSTILE_SECRET equals the public VITE_TURNSTILE_SITE_KEY. Copy the private secret from the same Cloudflare Turnstile widget into the private runtime file.');
 if(secret.length<10||secret.length>512||/[\s<>"']/.test(secret)||/^https?:|^eyJ|^sb_|^(?:[123]x0+)|^(?:replace|your[-_]|example|changeme|public[-_]|site[-_])/i.test(secret))fail('TURNSTILE_SECRET looks like a public key, testing key, placeholder or unrelated credential. Use the private secret from the customer’s Turnstile widget; values are never displayed.');
 // Do not assume a universal private-key format or contact Cloudflare with dummy
 // tokens: neither format nor an invalid-token response proves a matching pair.
}
