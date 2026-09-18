// Explicit opt-in, loopback-only disposable PostgreSQL fixture; never live Supabase.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
const db = process.env.PHASE4_TEST_DB
if (!/^phase4_[a-z0-9_]+$/.test(db || '')) throw new Error('Set PHASE4_TEST_DB to the disposable phase4_ fixture database')
const exec = promisify(execFile)
const psql = process.env.PHASE4_PSQL || 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
async function sql(query) {
  const { stdout } = await exec(psql, ['-X','-At','-h','127.0.0.1','-p','55434','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-c',query])
  return stdout
}
const actor = randomUUID()
const runClaim = request => sql(`begin;
  select set_config('request.jwt.claim.sub','${actor}',true);
  select 'CLAIM='||coalesce(app_private.claim_step_up('return','${request}','concurrency','{}')::text,'NONE');
  select pg_sleep(0.4); commit;`).then(out => out.match(/CLAIM=([^\r\n]+)/)?.[1])
try {
  await sql(`insert into auth.users(id) values('${actor}');
    insert into public.app_users(auth_user_id,email,display_name,role,status)
      values('${actor}','concurrency@example.invalid','Fixture','Business Owner','Active');
    insert into public.step_up_authorizations(auth_user_id,purpose,expires_at)
      values('${actor}','return',now()+interval '75 seconds');`)
  const unrelated = await Promise.all([runClaim(randomUUID()),runClaim(randomUUID())])
  assert.equal(unrelated.filter(id => id && id !== 'NONE').length, 1, 'One approval authorized concurrent distinct requests')
  await sql(`insert into public.step_up_authorizations(auth_user_id,purpose,expires_at)
    values('${actor}','return',now()+interval '75 seconds');`)
  const sameRequest = randomUUID()
  const identical = await Promise.all([runClaim(sameRequest),runClaim(sameRequest)])
  assert.notEqual(identical[0], 'NONE'); assert.equal(identical[0], identical[1], 'Concurrent idempotent retries diverged')
  console.log('PASS concurrent distinct claims: exactly one winner; identical retries: same approval')
} finally {
  await sql(`delete from auth.users where id='${actor}';`)
}
