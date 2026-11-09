// Disposable native PostgreSQL only. Applies the real canonical migrations, then exercises register shifts.
//   Windows/author machine:  set PG_BIN="C:\Program Files\PostgreSQL\18\bin"   &&  node tests/register-shifts-sql.mjs
//   Existing scratch server: RS_PG_PORT=55439 RS_PG_EXTERNAL=1 node tests/register-shifts-sql.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'

const shop = path.resolve(import.meta.dirname, '..')
const external = process.env.RS_PG_EXTERNAL === '1'
const port = Number(process.env.RS_PG_PORT || 55441)
const bin = process.env.PG_BIN || ''
const exe = process.platform === 'win32' ? '.exe' : ''
const tool = name => (bin ? path.join(bin, name + exe) : name)
const db = 'rs_shift_test'
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'retrasell-shift-pg-'))
const data = path.join(scratch, 'data')
let started = false
let passed = 0
const ok = name => { passed++; console.log('  ok -', name) }

const psqlArgs = (database, extra = []) => ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', database, '-At', ...extra]
const run = (exeName, args, input) => spawnSync(tool(exeName), args, { encoding: 'utf8', input, maxBuffer: 50e6 })
function sql(database, input, { fail = false, raw = false } = {}) {
  const r = run('psql', psqlArgs(database), input)
  if (fail) { assert.notEqual(r.status, 0, 'expected the statement to fail:\n' + input.slice(0, 300)); return r.stderr }
  if (r.status !== 0) throw new Error(`psql failed:\n${r.stderr}\n--- SQL:\n${input.slice(0, 600)}`)
  return raw ? r.stdout : r.stdout.trim()
}

const uid = n => '90000000-0000-4000-8000-' + String(n).padStart(12, '0')
const U = { owner: 1, support: 2, manager: 3, cashier: 4, technician: 5, cashier2: 6 }
const rid = () => crypto.randomUUID()
function as(who, query, { role = 'authenticated', fail = false, commit = true } = {}) {
  const sub = who ? uid(who) : ''
  const body = `begin;set local role ${role};select set_config('request.jwt.claim.sub','${sub}',true);` +
    `select set_config('request.jwt.claims','{"sub":"${sub}","role":"${role}"}',true);${query};${commit ? 'commit' : 'rollback'};`
  if (fail) return sql(db, body, { fail: true })
  return sql(db, body, { raw: true }).split('\n').slice(2).join('\n').trim()   // first two lines are the set_config results
}
const json = (who, query, opts) => JSON.parse(as(who, query, opts))
const open = (who, cash = 0, id = rid()) => json(who, `select public.open_register_shift('${id}',${cash})`)
const close = (who, shiftId, counted, note = '', id = rid()) => json(who, `select public.close_register_shift('${id}','${shiftId}',${counted},${lit(note)})`)
const lit = s => `'${String(s).replaceAll("'", "''")}'`
const errorCode = stderr => (/ERROR:\s+([0-9A-Z]{5}):/.exec(stderr) || [])[1]
const approx = (a, b, label) => assert.ok(Math.abs(Number(a) - Number(b)) < 0.005, `${label}: expected ${b}, got ${a}`)
const authorize = (who, purpose) => json(0, `select public.verify_override_pin_guarded('${uid(who)}','1234','${purpose}')`, { role: 'service_role' })

try {
  // ── disposable server ──
  if (!external) {
    let r = run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C'])
    assert.equal(r.status, 0, r.stderr)
    r = spawnSync(tool('pg_ctl'), ['-D', data, '-l', path.join(scratch, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { stdio: 'ignore' })
    assert.equal(r.status, 0, 'pg_ctl start failed'); started = true
  }
  sql('postgres', "do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; if not exists(select 1 from pg_roles where rolname='authenticator') then create role authenticator nologin; end if; end $$;")
  sql('postgres', `drop database if exists ${db}`); sql('postgres', `create database ${db}`)
  sql(db, `create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean default false,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now(),not_after timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
grant usage on schema auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
create schema extensions;create extension pgcrypto with schema extensions;grant usage on schema extensions to anon,authenticated,service_role;`)

  const dir = path.join(shop, 'supabase/migrations')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  assert.ok(files.some(f => f.includes('register_shifts')), 'the register_shifts migration is missing')
  for (const f of files) sql(db, 'begin;' + fs.readFileSync(path.join(dir, f), 'utf8') + '\ncommit;')
  console.log(`Applied ${files.length} migrations`)

  // ── fixtures ──
  sql(db, `update public.shop_config set repair_module_enabled=true,inventory_module_enabled=true,suspended=false,onboarding_version=2,platform_client_id=42 where id=1;
insert into auth.users(id,email,email_confirmed_at) select ('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'fixture-'||n||'@example.invalid',now() from generate_series(1,6)n;
insert into public.employees(id,name,role,status) values(3,'Manager','Manager','Active'),(4,'Cashier One','Cashier','Active'),(5,'Technician','Technician','Active'),(6,'Cashier Two','Cashier','Active');
insert into public.app_users(auth_user_id,employee_id,email,display_name,role)
 select u.id,case when n>2 then n end,u.email,'Fixture '||n,case n when 1 then 'Business Owner' when 2 then 'Orbito Support' when 3 then 'Manager' when 4 then 'Cashier' when 5 then 'Technician' else 'Cashier' end
 from auth.users u cross join lateral (select right(u.id::text,12)::int n) x;
insert into public.shop_security(id,override_pin_hash) values(1,extensions.crypt('1234',extensions.gen_salt('bf')))
 on conflict (id) do update set override_pin_hash=excluded.override_pin_hash;`)

  console.log('Install and capability')
  const caps = JSON.parse(sql(db, "select public.shop_backend_capabilities()")).capabilities
  assert.equal(caps['register-shifts'], true); assert.ok(Object.values(caps).every(v => v === true), 'every capability must be true'); ok('register-shifts capability is true and no other capability regressed')
  const cfg = json(U.owner, 'select public.get_app_config()')
  assert.equal(cfg.read_contracts.register_shifts, 1); assert.equal(cfg.read_contracts.inventory_retirement, 1); ok('get_app_config exposes read_contracts.register_shifts without dropping existing contracts')
  assert.equal(sql(db, "select count(*) from pg_constraint where conname='step_up_authorizations_purpose_check' and pg_get_constraintdef(oid) like '%shift-close%'"), '1'); ok("'shift-close' is an allowed PIN purpose")

  console.log('Opening')
  const ownerOpen = open(U.owner, 500); assert.equal(ownerOpen.shift.role, 'Business Owner'); assert.equal(ownerOpen.shift.openingCash, 500); assert.equal(ownerOpen.alreadyOpen, false); ok('owner can open a register')
  const reqId = rid(); const first = open(U.cashier, 2000, reqId); assert.equal(first.shift.operatorName, 'Fixture 4'); assert.equal(first.alreadyOpen, false); ok('cashier can open a register with opening cash')
  const replay = json(U.cashier, `select public.open_register_shift('${reqId}',2000)`); assert.equal(replay.idempotentReplay, true); assert.equal(replay.shift.id, first.shift.id); ok('same request id replays the same shift')
  const again = open(U.cashier, 9999); assert.equal(again.alreadyOpen, true); assert.equal(again.shift.id, first.shift.id); assert.equal(again.shift.openingCash, 2000); ok('opening again on another device converges on the open shift')
  for (const [who, label] of [[U.manager, 'Manager'], [U.technician, 'Technician']]) { assert.equal(errorCode(as(who, `select public.open_register_shift('${rid()}',0)`, { fail: true })), '42501'); ok(label + ' cannot open a register') }
  assert.ok(as(U.support, `select public.open_register_shift('${rid()}',0)`, { fail: true }).length > 0); ok('Orbito Support cannot open a register')
  assert.ok(errorCode(as(U.cashier2, `select public.open_register_shift('${rid()}',-1)`, { fail: true })) === '22023'); ok('negative opening cash is rejected')
  assert.ok(errorCode(as(U.cashier2, `select public.open_register_shift(null,0)`, { fail: true })) === '22023'); ok('missing request id is rejected')
  assert.ok(errorCode(as(U.cashier2, `select public.open_register_shift('${reqId}',10)`, { fail: true })) === '22023'); ok('another operator cannot reuse a request id')
  assert.equal(errorCode(sql(db, `insert into public.register_shifts(operator_auth_user_id,operator_name,operator_role,open_request_id) values('${uid(4)}','x','Cashier','${rid()}')`, { fail: true })), '23505'); ok('database allows only one open register per operator')
  const mine = json(U.cashier, 'select public.get_my_open_register_shift()'); assert.equal(mine.shift.id, first.shift.id); ok('get_my_open_register_shift returns the open register')
  assert.equal(json(U.cashier2, 'select public.get_my_open_register_shift()').shift, null); ok('...and null when none is open')

  console.log('Concurrency')
  const concurrentUser = U.cashier2; const slowId = rid()
  const slow = spawn(tool('psql'), psqlArgs(db), { stdio: ['pipe', 'pipe', 'pipe'] }); let slowOut = ''; slow.stdout.on('data', d => { slowOut += d })
  slow.stdin.end(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${uid(concurrentUser)}',true);select set_config('request.jwt.claims','{"sub":"${uid(concurrentUser)}"}',true);select public.open_register_shift('${slowId}',100);select pg_sleep(1.5);commit;`)
  await new Promise(r => setTimeout(r, 500))
  const raced = json(concurrentUser, `select public.open_register_shift('${rid()}',200)`)
  await new Promise(r => slow.on('close', r))
  assert.equal(raced.alreadyOpen, true); assert.equal(raced.shift.openingCash, 100)
  assert.equal(sql(db, `select count(*) from public.register_shifts where operator_auth_user_id='${uid(concurrentUser)}' and ended_at is null`), '1'); ok('two simultaneous opens produce exactly one open register')
  const cash2 = JSON.parse(slowOut.split('\n').filter(l => l.startsWith('{"shift"'))[0]).shift
  as(concurrentUser, `select public.close_register_shift('${rid()}','${cash2.id}',100,'')`)

  console.log('Row security and write protection')
  assert.equal(as(U.cashier, 'select count(*) from public.register_shifts'), '1'); ok('a cashier sees only their own shifts')
  assert.equal(Number(as(U.manager, 'select count(*) from public.register_shifts')) >= 2, true); ok('a manager sees everyone')
  assert.equal(as(U.technician, 'select count(*) from public.register_shifts'), '0'); ok('a technician sees none')
  assert.ok(as(U.cashier, `insert into public.register_shifts(operator_auth_user_id,operator_name,operator_role,open_request_id) values('${uid(4)}','x','Cashier','${rid()}')`, { fail: true }).includes('permission denied')); ok('browser roles cannot insert directly')
  assert.ok(as(U.owner, `update public.register_shifts set opening_cash=1`, { fail: true }).includes('permission denied')); ok('browser roles cannot update directly')
  assert.ok(as(U.owner, `delete from public.register_shifts`, { fail: true }).includes('permission denied')); ok('browser roles cannot delete')
  assert.ok(as(0, `select public.open_register_shift('${rid()}',0)`, { role: 'anon', fail: true }).includes('permission denied')); ok('anonymous callers cannot execute the RPCs')
  assert.ok(as(U.cashier, `select app_private.register_shift_summary('${uid(4)}',now(),now(),0)`, { fail: true }).includes('permission denied')); ok('the summary helper is not callable from the browser')

  console.log('Summary figures (seeded money data)')
  const sid = first.shift.id
  const t = () => sql(db, "select clock_timestamp()::text")
  const sale = (who, total, discount, at, qty) => { const id = sql(db, `insert into public.sales(customer_name,total_bill,discount,created_by_auth_user_id,created_at) values('Fixture',${total},${discount},'${uid(who)}','${at}') returning id`); sql(db, `insert into public.sale_lines(sale_id,item_kind,line_number,line_total,name_snapshot,quantity,unit_price) values(${id},'other',1,${total},'Item',${qty},${total / qty})`); return Number(id) }
  const pay = (ref, amount, method, at, who = U.cashier) => sql(db, `insert into public.payments(request_id,${ref.sale ? 'sale_id' : 'repair_root_ticket_id'},amount,method,source,created_by_auth_user_id,created_at) values('${rid()}',${ref.sale || ref.ticket},${amount},'${method}','test','${uid(who)}','${at}')`)
  const ticket = (extra, at, who = U.cashier) => Number(sql(db, `insert into public.tickets(ticket_number,customer_name,device_brand,device_model,created_by_auth_user_id,created_at${extra.cols || ''}) values('T'||floor(random()*1e9),'Fixture','B','M','${uid(who)}','${at}'${extra.vals || ''}) returning id`))
  const approval = (ref, amount, at, who = U.cashier) => { const step = sql(db, `insert into public.step_up_authorizations(auth_user_id,purpose,expires_at) values('${uid(who)}','udhar',now()+interval '1 hour') returning id`); sql(db, `insert into public.credit_approvals(request_id,${ref.sale ? 'sale_id' : 'repair_root_ticket_id'},approved_amount,approved_by_auth_user_id,step_up_authorization_id,created_at) values('${rid()}',${ref.sale || ref.ticket},${amount},'${uid(who)}','${step}','${at}')`) }

  const t1 = t(); const s1 = sale(U.cashier, 1000, 50, t1, 2); pay({ sale: s1 }, 1000, 'Cash', t1)                       // cash sale
  const t2 = t(); const s2 = sale(U.cashier, 800, 0, t2, 1); pay({ sale: s2 }, 800, 'Raast', t2)                         // online sale
  const t3 = t(); const s3 = sale(U.cashier, 2000, 0, t3, 1); pay({ sale: s3 }, 500, 'Cash', t3); pay({ sale: s3 }, 200, 'JazzCash', t3); approval({ sale: s3 }, 1300, t3) // credit sale, partly paid at creation
  const t4 = t(); pay({ sale: s3 }, 300, 'Cash', t4); pay({ sale: s3 }, 100, 'EasyPaisa', t4)                            // credit repaid later
  const t5 = t(); const r1 = ticket({ cols: ',final_total', vals: ',3000' }, t5); pay({ ticket: r1 }, 1000, 'Cash', t5)   // repair advance (not credit)
  const t6 = t(); pay({ ticket: r1 }, 500, 'Bank Transfer', t6)
  const t7 = t(); pay({ ticket: r1 }, 400, 'Cash', t7)
  const t8 = t(); const r2 = ticket({ cols: ",final_total,status,delivered_at,delivered_by_auth_user_id", vals: `,1000,'Delivered','${t8}','${uid(U.cashier)}'` }, t5)
  const t9 = t()
  sql(db, `begin;
with r as (insert into public.returns(original_sale_id,refund_amount,created_by_auth_user_id,created_at) values(${s1},200,'${uid(U.cashier)}','${t9}') returning id),
 l as (insert into public.return_lines(return_id,sale_line_id,quantity,refund_amount) select r.id,(select id from public.sale_lines where sale_id=${s1} limit 1),1,200 from r returning return_id)
insert into public.refunds(request_id,sale_id,return_id,amount,method,reason,created_by_auth_user_id,created_at) select '${rid()}',${s1},r.id,200,'Cash','Return','${uid(U.cashier)}','${t9}' from r;
commit;`)
  sql(db, `insert into public.refunds(request_id,sale_id,amount,method,reason,created_by_auth_user_id,created_at) values('${rid()}',${s2},100,'JazzCash','Goodwill','${uid(U.cashier)}','${t9}')`)
  sale(U.owner, 999, 0, t(), 1); pay({ sale: s1 }, 999, 'Cash', t(), U.owner)                                             // someone else's activity must not leak in

  const live = json(U.cashier, `select public.get_register_shift_summary('${sid}')`); const s = live.summary
  assert.equal(live.live, true)
  approx(s.openingCash, 2000, 'opening'); approx(s.cash.sales, 1000, 'cash sales'); approx(s.cash.repair, 1400, 'cash repair'); approx(s.cash.udharAtCreation, 500, 'cash credit at creation'); approx(s.cash.udharRepaid, 300, 'cash credit repaid'); approx(s.cash.total, 3200, 'cash total'); ok('cash buckets: sales, repair, credit at creation, credit repaid')
  const ch = Object.fromEntries(s.online.channels.map(c => [c.method, Number(c.amount)])); assert.deepEqual(ch, { Raast: 800, JazzCash: 200, EasyPaisa: 100, 'Bank Transfer': 500 }); approx(s.online.total, 1600, 'online total'); ok('online channels are separate and never counted as register cash')
  approx(s.udhar.given, 1300, 'credit given'); approx(s.udhar.paidAtCreationCash, 500, 'credit paid cash'); approx(s.udhar.paidAtCreationOnline, 200, 'credit paid online'); approx(s.udhar.repaidCash, 300, 'repaid cash'); approx(s.udhar.repaidOnline, 100, 'repaid online'); ok('credit (udhar): given, paid at creation (cash/online), repaid later (cash/online)')
  assert.equal(s.returns.count, 1); approx(s.returns.total, 200, 'returns total'); approx(s.returns.cash, 200, 'refund cash'); approx(s.returns.online, 100, 'refund online'); ok('returns and refunds split by cash and online')
  approx(s.invoiced.retail, 3800, 'retail'); approx(s.invoiced.repair, 4000, 'repair'); approx(s.invoiced.total, 7800, 'invoiced'); assert.equal(s.itemsSold, 4); approx(s.discounts, 50, 'discounts'); ok('invoiced retail/repair, items sold and discounts')
  assert.equal(s.tickets.created, 2); assert.equal(s.tickets.handedBack, 1); assert.equal(s.tickets.openNow, 1); ok('tickets generated, phones handed back and open tickets')
  approx(s.expectedCash, 5000, 'expected cash'); ok('expected cash = 2000 opening + 3200 cash - 200 cash refund = 5000 (online and credit excluded)')
  assert.equal(json(U.owner, `select public.get_register_shift_summary('${sid}')`).summary.expectedCash, 5000); assert.equal(json(U.manager, `select public.get_register_shift_summary('${sid}')`).live, true); ok('owner and manager can read any live summary')
  assert.equal(errorCode(as(U.technician, `select public.get_register_shift_summary('${sid}')`, { fail: true })), '42501'); assert.equal(errorCode(as(U.cashier2, `select public.get_register_shift_summary('${sid}')`, { fail: true })), '22023'); ok("a technician cannot, and another cashier cannot read someone else's summary")

  console.log('Closing: cashier shortfall rules')
  const R = rid()
  assert.equal(errorCode(as(U.cashier, `select public.close_register_shift('${R}','${sid}',4700,'')`, { fail: true })), '22023'); ok('short with no reason is rejected')
  assert.equal(errorCode(as(U.cashier, `select public.close_register_shift('${R}','${sid}',4700,'Gave change twice')`, { fail: true })), '42501'); ok('short with a reason but no PIN approval is rejected')
  assert.equal(errorCode(as(U.cashier, `select public.close_register_shift('${R}','${sid}',-5,'x')`, { fail: true })), '22023'); ok('negative counted cash is rejected')
  assert.equal(json(0, `select public.verify_override_pin_guarded('${uid(4)}','0000','shift-close')`, { role: 'service_role' }).ok, false); ok('a wrong PIN does not authorize')
  assert.equal(errorCode(as(0, `select public.verify_override_pin_guarded('${uid(4)}','1234','not-a-purpose')`, { role: 'service_role', fail: true })), '42501'); ok('an unknown PIN purpose is refused')
  assert.equal(authorize(U.cashier, 'shift-close').ok, true); ok("the override PIN authorizes the 'shift-close' purpose")
  const shortClose = close(U.cashier, sid, 4700, 'Gave change twice', R)
  assert.equal(shortClose.shift.difference, -300); assert.equal(shortClose.shift.countedCash, 4700); assert.equal(shortClose.shift.expectedCash, 5000); assert.equal(shortClose.shift.approvedBy, 'override PIN'); assert.equal(shortClose.shift.closeReason, 'operator'); assert.equal(shortClose.shift.note, 'Gave change twice'); ok('short close with reason and fresh PIN succeeds and records difference -300, reason and approval')
  const row = sql(db, `select (step_up_authorization_id is not null)::text||'|'||closed_by_auth_user_id::text from public.register_shifts where id='${sid}'`); assert.equal(row, `true|${uid(4)}`); ok('the PIN authorization and closer are recorded')
  const replayClose = json(U.cashier, `select public.close_register_shift('${R}','${sid}',4700,'Gave change twice')`); assert.equal(replayClose.idempotentReplay, true); ok('retrying the same close replays the stored result')
  assert.equal(errorCode(as(U.cashier, `select public.close_register_shift('${rid()}','${sid}',5000,'')`, { fail: true })), '22023'); ok('a different request cannot close it again')
  assert.equal(errorCode(sql(db, `update public.register_shifts set note='changed' where id='${sid}'`, { fail: true })), '42501'); assert.equal(errorCode(sql(db, `delete from public.register_shifts where id='${sid}'`, { fail: true })), '42501'); ok('a closed shift can never be edited or deleted, even by the database owner')
  const t10 = t(); pay({ sale: s1 }, 777, 'Cash', t10)
  const frozen = json(U.owner, `select public.get_register_shift_summary('${sid}')`); assert.equal(frozen.live, false); assert.equal(frozen.summary.expectedCash, 5000); ok('a closed shift keeps its snapshot even when new money is recorded later')

  console.log('Closing: match, overage, owner')
  const exact = open(U.cashier, 1000).shift; const exactClose = close(U.cashier, exact.id, 1000); assert.equal(exactClose.shift.difference, 0); assert.equal(exactClose.shift.approvedBy, null); ok('an exact count closes with no reason or PIN')
  const over = open(U.cashier, 1000).shift; const overClose = close(U.cashier, over.id, 1250); assert.equal(overClose.shift.difference, 250); assert.equal(overClose.shift.approvedBy, null); ok('counting more than expected closes without approval and records the overage')
  const spent = sql(db, "select count(*) from public.step_up_authorizations where consumed_at is not null and purpose='shift-close'")
  const ownerClose = close(U.owner, ownerOpen.shift.id, 100, ''); assert.equal(ownerClose.shift.expectedCash, 1499); assert.equal(ownerClose.shift.difference, -1399); assert.equal(ownerClose.shift.approvedBy, 'owner (own adjustment)'); assert.equal(sql(db, "select count(*) from public.step_up_authorizations where consumed_at is not null and purpose='shift-close'"), spent); ok('the owner may count less: no reason, no PIN, recorded as their own adjustment')
  const second = open(U.cashier, 1000).shift
  assert.equal(errorCode(as(U.cashier, `select public.close_register_shift('${rid()}','${second.id}',900,'Short again')`, { fail: true })), '42501'); ok('each short close needs its own fresh PIN (the earlier approval was consumed)')
  assert.equal(authorize(U.cashier, 'shift-close').ok, true); const secondClose = close(U.cashier, second.id, 900, 'Short again'); assert.equal(secondClose.shift.difference, -100); ok('...and succeeds once a new PIN is entered')
  assert.equal(authorize(U.cashier, 'inventory').ok, true)
  const third = open(U.cashier, 1000).shift
  assert.equal(errorCode(as(U.cashier, `select public.close_register_shift('${rid()}','${third.id}',900,'Wrong purpose')`, { fail: true })), '42501'); ok("a PIN approved for a different purpose does not unlock closing")
  assert.equal(errorCode(as(U.cashier2, `select public.close_register_shift('${rid()}','${third.id}',1000,'')`, { fail: true })), '22023'); ok("one operator cannot close another operator's register")

  console.log('Force close')
  assert.equal(errorCode(as(U.cashier, `select public.force_close_register_shift('${rid()}','${third.id}','')`, { fail: true })), '42501'); ok('a cashier cannot force-close')
  const ownerShift = open(U.owner, 300).shift
  assert.equal(errorCode(as(U.manager, `select public.force_close_register_shift('${rid()}','${ownerShift.id}','')`, { fail: true })), '42501'); ok("a manager cannot force-close the owner's register")
  const FR = rid(); const forced = json(U.manager, `select public.force_close_register_shift('${FR}','${third.id}','Left open overnight')`)
  assert.equal(forced.shift.closeReason, 'manager_forced'); assert.equal(forced.shift.countedCash, null); assert.equal(forced.shift.difference, null); assert.equal(forced.shift.note, 'Left open overnight'); assert.ok(forced.shift.summary.expectedCash !== undefined); ok('a manager can force-close a cashier register without a count; the snapshot is still stored')
  assert.equal(sql(db, `select closed_by_auth_user_id::text from public.register_shifts where id='${third.id}'`), uid(3)); ok('who force-closed it is recorded')
  assert.equal(json(U.manager, `select public.force_close_register_shift('${FR}','${third.id}','')`).idempotentReplay, true); assert.equal(errorCode(as(U.owner, `select public.force_close_register_shift('${rid()}','${third.id}','')`, { fail: true })), '22023'); ok('force close is idempotent and cannot be repeated by another request')
  assert.equal(json(U.owner, `select public.force_close_register_shift('${rid()}','${ownerShift.id}','')`).shift.note, 'Closed by management without a cash count.'); ok('the owner can force-close and gets the default note')

  console.log('History and paging')
  const total = Number(sql(db, 'select count(*) from public.register_shifts'))
  const page1 = json(U.owner, `select public.list_register_shifts(null,3)`); assert.equal(page1.items.length, 3); assert.ok(page1.nextCursor)
  const page2 = json(U.owner, `select public.list_register_shifts(null,3,'${page1.nextCursor.startedAt}','${page1.nextCursor.id}')`)
  assert.ok(page2.items.every(x => !page1.items.some(y => y.id === x.id))); ok('keyset paging returns non-overlapping pages')
  const seen = new Set(); let cursor = null
  for (let n = 0; n < 50; n++) { const q = cursor ? `'${cursor.startedAt}','${cursor.id}'` : 'null,null'; const pg = json(U.owner, `select public.list_register_shifts(null,2,${q})`); pg.items.forEach(x => seen.add(x.id)); cursor = pg.nextCursor; if (!cursor) break }
  assert.equal(seen.size, total); ok('walking every page visits every shift exactly once')
  assert.ok(json(U.cashier, `select public.list_register_shifts(null,100)`).items.every(x => x.operatorId === uid(4))); ok('a cashier lists only their own shifts')
  assert.equal(errorCode(as(U.cashier, `select public.list_register_shifts('${uid(1)}',10)`, { fail: true })), '42501'); ok("a cashier cannot list another operator's shifts")
  assert.equal(json(U.manager, `select public.list_register_shifts('${uid(4)}',100)`).items.length >= 4, true); ok('a manager can filter by operator')
  assert.equal(errorCode(as(U.owner, `select public.list_register_shifts(null,10,now(),null)`, { fail: true })), '22023'); ok('an incomplete page position is rejected')
  assert.equal(errorCode(as(U.technician, `select public.list_register_shifts(null,10)`, { fail: true })), '42501'); ok('a technician cannot list shifts')
  assert.ok(json(U.owner, `select public.list_register_shifts(null,100000)`).items.length <= 100); ok('the page size is capped at 100')

  console.log(`\nALL ${passed} SQL CHECKS PASSED`)
}
catch (error) {
  console.error('\nFAILED:', error?.stack || error)
  process.exitCode = 1
}
finally {
  if (started) spawnSync(tool('pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'], { stdio: 'ignore' })
}
