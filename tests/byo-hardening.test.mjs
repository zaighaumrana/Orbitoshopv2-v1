import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTurnstileSecret,validatePublicConfig} from '../scripts/byo-public-config.mjs';
import {billingUsagePage} from '../src/admin/pages/billing-usage.js';
import {activePaperRequest,paperProgress} from '../src/admin/pages/paper-history.js';
const ref='abcdefghijklmnopqrst',site='synthetic-public-site';
const jwt=(role='anon',project=ref)=>'x.'+Buffer.from(JSON.stringify({role,ref:project,exp:Date.now()/1000+3600})).toString('base64url')+'.x';
const config=()=>({VITE_SUPABASE_URL:`https://${ref}.supabase.co`,VITE_SUPABASE_ANON:jwt(),VITE_TURNSTILE_SITE_KEY:site});
test('static Turnstile guard rejects public/private equality, unrelated credentials, placeholders and Cloudflare test keys without echoing values',()=>{
 for(const secret of [site,'https://private.invalid','eyJ.private.jwt','sb_secret_sensitive','REPLACE_WITH_SECRET','1x00000000000000000000AA','1x0000000000000000000000000000000AA',' bad-secret-value','"quoted-private"','']){
  assert.throws(()=>validateTurnstileSecret(secret,site),e=>e.message.length>20&&(!secret||!e.message.includes(secret)));
 }
 assert.equal(validateTurnstileSecret('synthetic-private-value',site),undefined); // static only
});
test('public input pins customer project and anon role, denies privileged/extra/placeholder values',()=>{
 assert.equal(validatePublicConfig(config(),ref).VITE_SUPABASE_URL,`https://${ref}.supabase.co`);
 for(const patch of [{VITE_SUPABASE_URL:'https://bcdefghijklmnopqrstu.supabase.co'},{VITE_SUPABASE_ANON:jwt('service_role')},{VITE_SUPABASE_ANON:jwt('anon','bcdefghijklmnopqrstu')},{TURNSTILE_SECRET:'synthetic-private'},{VITE_TURNSTILE_SITE_KEY:'REPLACE_WITH_SITE_KEY'}])assert.throws(()=>validatePublicConfig({...config(),...patch},ref));
});
test('paper action follows active lifecycle, reports sync evidence precisely and permits new requests only after terminal states',()=>{
 const result={available:true,projection:{currency:'PKR',paper_resupply_enabled:true},paper_requests:[]};
 for(const status of ['requested','approved','dispatched','fulfilled','rejected','cancelled']){
  result.paper_requests=[{request_id:'synthetic-request',status,sync_version:0,communication:[]}];
  const html=billingUsagePage(result);const active=['requested','approved','dispatched'].includes(status);
  assert.equal(!!activePaperRequest(result.paper_requests),active);assert.equal(/data-action="paper-resupply" disabled/.test(html),active);assert.match(html,/Saved locally · awaiting Platform sync/);
 }
 assert.match(paperProgress({sync_version:1,platform_updated_at:'2026-10-21T10:00:00Z'}),/Confirmed by Platform/);
 assert.match(paperProgress({sync_version:0,platform_updated_at:'2026-10-21'}),/awaiting Platform/);
 assert.match(billingUsagePage(result,false,Date.now(),{accepted:true,error:true,checkedAt:'2026-10-21'}),/Submission acknowledged locally/);
 assert.doesNotMatch(billingUsagePage(result,false,Date.now(),{error:true}),/permanent failure|synchronized successfully/);
});
