import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
const runtime = new URL('../node_modules/.legal-test-runtime/node_modules/@electric-sql/pglite/dist/index.js',import.meta.url)
const migration = readFileSync(new URL('../supabase/migrations/20261002015159_legal_acceptance.sql',import.meta.url),'utf8')
const foundation = readFileSync(new URL('../supabase/migrations/20260903165753_phase2_auth_foundation.sql',import.meta.url),'utf8')

test('isolated PostgreSQL: Owner persistence, tenant binding, staff/anonymous denial, immutable evidence and version policy', {skip:!existsSync(runtime)}, async () => {
  const {PGlite} = await import(runtime.href)
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema app_private; create schema extensions;
      grant usage on schema auth, app_private to anon, authenticated;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function extensions.gen_random_uuid() returns uuid language sql as $$select gen_random_uuid()$$;
      create table public.app_users(auth_user_id uuid primary key, display_name text, role text, status text);
      create table public.shop_config(id integer primary key, suspended boolean);
      insert into public.shop_config values(1,false);
      insert into public.app_users values
        ('00000000-0000-0000-0000-000000000001','Owner Fixture','Business Owner','Active'),
        ('00000000-0000-0000-0000-000000000002','Staff Fixture','Cashier','Active');
    `)
    for (const name of ['current_app_role','current_client_access_allowed']) {
      const start = foundation.indexOf('create or replace function app_private.'+name+'()')
      await db.exec(foundation.slice(start,foundation.indexOf('$$;',start)+3))
    }
    await db.exec(migration)
    const owner = '00000000-0000-0000-0000-000000000001'
    const staff = '00000000-0000-0000-0000-000000000002'
    const identity = async (id,role='authenticated') => {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
      await db.exec('set role '+role)
    }
    const accept = (authority=true,revision='2026-09-27.1',terms='1.0') =>
      db.query('select public.accept_legal_terms($1,$2,$3,$4,$5) as result',[authority,revision,terms,'1.0','1.0'])
    const status = async()=> (await db.query('select public.get_legal_status() as result')).rows[0].result
    await identity('', 'anon')
    const publication = (await db.query('select public.get_legal_publication() as result')).rows[0].result
    assert.equal(publication.published,false)
    assert.equal(publication.terms_version,'[PLACEHOLDER: TERMS_VERSION]')
    assert.equal(publication.privacy_version,'[PLACEHOLDER: PRIVACY_VERSION]')
    assert.equal(publication.dpa_version,'[PLACEHOLDER: DPA_VERSION]')
    assert.deepEqual(Object.keys(publication).sort(),['dpa_version','privacy_version','published','required_revision','terms_version'])
    await assert.rejects(status,/permission denied/)
    await assert.rejects(()=>accept(),/permission denied/)
    await identity(staff)
    await assert.rejects(()=>accept(),/Business Owner/)
    await assert.rejects(status,/Owner access required/)
    for (const role of ['Manager','Technician','Orbito Support']) {
      await db.exec('reset role')
      await db.query('update public.app_users set role=$1 where auth_user_id=$2',[role,staff])
      await identity(staff)
      await assert.rejects(()=>accept(),/Business Owner/)
    }
    await identity(owner)
    assert.equal((await status()).accepted,false)
    assert.equal((await status()).published,false)
    await assert.rejects(()=>accept(),/being finalized/)
    await assert.rejects(()=>db.exec('update app_private.legal_policy set published=true'),/permission denied/)
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::int as n from app_private.legal_acceptances')).rows[0].n,0)
    // Publish finalized test-only versions in the disposable database, never production.
    await db.exec("update app_private.legal_policy set terms_version='1.0', privacy_version='1.0', dpa_version='1.0', published=true")
    for (const name of [null,'','   ','\t\n']) {
      await db.query('update public.app_users set display_name=$1 where auth_user_id=$2',[name,owner])
      await identity(owner)
      await assert.rejects(()=>accept(),/Business Owner name is required/)
      await db.exec('reset role')
    }
    await db.query('update public.app_users set display_name=$1 where auth_user_id=$2',['Owner Fixture',owner])
    await identity(owner)
    await assert.rejects(()=>accept(false),/Confirm your authority/)
    await assert.rejects(()=>accept(true,'old'),/Legal documents changed/)
    await assert.rejects(()=>accept(true,'2026-09-27.1','forged'),/Legal documents changed/)
    const accepted = (await accept()).rows[0].result
    assert.equal(accepted.accepted,true)
    assert.equal(accepted.receipt.accepted_name,'Owner Fixture')
    assert.equal((await status()).accepted,true)
    await accept()
    await assert.rejects(()=>db.exec("delete from app_private.legal_acceptances"),/permission denied/)
    await assert.rejects(()=>db.exec("update app_private.legal_policy set required_revision='bypass'"),/permission denied/)
    await assert.rejects(()=>db.exec("insert into app_private.legal_acceptances default values"),/permission denied/)
    await db.exec('reset role')
    const records = (await db.query('select * from app_private.legal_acceptances')).rows
    assert.equal(records.length,1)
    assert.equal(records[0].auth_user_id,owner)
    assert.equal(records[0].accepted_role,'Business Owner')
    assert.equal(records[0].required_revision,'2026-09-27.1')
    assert.equal(records[0].terms_version,'1.0')
    assert.equal(records[0].privacy_version,'1.0')
    assert.equal(records[0].dpa_version,'1.0')
    assert.equal(records[0].shop_id,(await db.query('select shop_id from app_private.legal_policy')).rows[0].shop_id)
    assert.ok(Math.abs(Date.now()-Date.parse(records[0].accepted_at)) < 60000)
    // Copy-only update preserves required revision: old acceptance remains valid.
    await db.exec("update app_private.legal_policy set terms_version='1.1'")
    await identity(owner)
    assert.equal((await status()).accepted,true)
    // Material update requires a new immutable receipt.
    await db.exec("reset role; update app_private.legal_policy set required_revision='2026-10.1'")
    await identity(owner)
    assert.equal((await status()).accepted,false)
    await accept(true,'2026-10.1','1.1')
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::int as n from app_private.legal_acceptances')).rows[0].n,2)
    await db.exec("update public.shop_config set suspended=true")
    await identity(owner)
    await assert.rejects(()=>accept(true,'2026-10.1','1.1'),/Owner access required/)
  } finally { await db.close() }
})
