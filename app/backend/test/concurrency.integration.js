// Integration test. Needs a running API + database:
//   API=http://localhost:4000 ADMIN_PW=... DISTRICT_USER=... DISTRICT_PW=... node test/concurrency.integration.js
import assert from 'node:assert/strict';
import pg from 'pg';
import 'dotenv/config';

const API = process.env.API || 'http://localhost:4000';
const call = async (path, { token, method = 'GET', body } = {}) => {
  const r = await fetch(API + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const login = (u, p, force) => call('/auth/login', { method: 'POST', body: { username: u, password: p, ...(force && { force: true }) } });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let pass = 0; const ok = (name) => console.log('  ok -', name, ++pass && '');

const U = process.env.DISTRICT_USER, P = process.env.DISTRICT_PW, A = 'superadmin', AP = process.env.ADMIN_PW;
console.log('Multi-device session tests');
await pool.query('delete from user_sessions');

// 1. The same account signs in on 10 devices at the same instant: ALL succeed, each with its own session.
const burst = await Promise.all(Array.from({ length: 10 }, () => login(U, P)));
assert.equal(burst.filter(r => r.status === 200).length, 10);
const toks = burst.map(r => r.body.token);
assert.equal(new Set(toks).size, 10); ok('10 simultaneous logins on one account -> all 10 succeed');
const used = await Promise.all(toks.map(t => call('/dashboard', { token: t })));
assert(used.every(r => r.status === 200)); ok('all 10 devices can use the portal at the same time');

// 2. Logging out one device leaves the others untouched.
await call('/auth/logout', { token: toks[0], method: 'POST' });
assert.equal((await call('/auth/session', { token: toks[0] })).status, 401); ok('logged-out device is rejected');
assert((await Promise.all(toks.slice(1).map(t => call('/auth/session', { token: t })))).every(r => r.status === 200)); ok('the other 9 devices are unaffected');

// 3. One idle device expires by itself; the others stay signed in.
await pool.query(`update user_sessions set last_seen = now() - interval '2 hours' where id = (select id from user_sessions where user_id=(select id from users where username=$1) order by created_at limit 1)`, [U]);
const states = await Promise.all(toks.slice(1).map(t => call('/auth/session', { token: t })));
assert.equal(states.filter(r => r.status === 401 && r.body.code === 'SESSION_EXPIRED').length, 1);
assert.equal(states.filter(r => r.status === 200).length, 8); ok('one idle device expired, 8 others keep working');

// 4. Password change: this device stays, every other device is signed out.
const live = toks.slice(1).filter((_, i) => states[i].status === 200);
const NEWPW = P + 'x1!';
const cp = await call('/auth/change-password', { token: live[0], method: 'POST', body: { currentPassword: P, newPassword: NEWPW } });
assert.equal(cp.status, 200);
assert.equal((await call('/auth/session', { token: live[0] })).status, 200); ok('device that changed the password stays signed in');
assert((await Promise.all(live.slice(1).map(t => call('/auth/session', { token: t })))).every(r => r.status === 401)); ok('all other devices signed out after password change');
assert.equal((await login(U, P)).status, 401); assert.equal((await login(U, NEWPW)).status, 200); ok('new password works, old does not');
await call('/auth/change-password', { token: (await login(U, NEWPW)).body.token, method: 'POST', body: { currentPassword: NEWPW, newPassword: P } });

// 5. Two devices change the password at the same time: one wins, no corruption.
const [d1, d2] = [(await login(U, P)).body.token, (await login(U, P)).body.token];
const race = await Promise.all([d1, d2].map((t, i) => call('/auth/change-password', { token: t, method: 'POST', body: { currentPassword: P, newPassword: 'Racing-pass-' + i + '-xyz' } })));
assert.equal(race.filter(r => r.status === 200).length, 1); ok('simultaneous password changes from 2 devices -> exactly one applies');
const winner = race.findIndex(r => r.status === 200);
const wp = 'Racing-pass-' + winner + '-xyz';
assert.equal((await login(U, wp)).status, 200);
await call('/auth/change-password', { token: (await login(U, wp)).body.token, method: 'POST', body: { currentPassword: wp, newPassword: P } });   // restore
await pool.query('delete from user_sessions');

console.log('Data race tests');
// Super admin + district user (same district data), then hammer one student from many requests at once.
const admin = (await login(A, AP)).body.token, admin2 = (await login(A, AP)).body.token;   // same account, two devices
const { rows: [stu] } = await pool.query(`select id, class_level from students where select_status<>'' and admit_status='' and willing_status='WILLING' order by id limit 1`);
assert(stu, 'need a selected student (run selection first)');
const before = (await pool.query(`select sum(admitted)::int a, sum(vacancies)::int v from vacancies where class_level=$1`, [stu.class_level])).rows[0];
const base = (await pool.query('select coalesce(max(id),0)::int m from audit_logs')).rows[0].m;
const res = await Promise.all(Array.from({ length: 12 }, (_, i) => call('/students/' + stu.id, { token: i % 2 ? admin : admin2, method: 'PATCH', body: { admitStatus: 'Admitted' } })));
const wins = res.filter(r => r.status === 200).length;
const after = (await pool.query(`select sum(admitted)::int a, sum(vacancies)::int v from vacancies where class_level=$1`, [stu.class_level])).rows[0];
console.log('    statuses:', res.map(r => r.status).join(','));
assert.equal(wins, 1); ok('12 simultaneous "Admit" clicks from 2 devices of the same account -> exactly one succeeds');
assert.equal(after.a - before.a, 1); assert.equal(before.v - after.v, 1); ok('seat counted exactly once (admitted +1, vacancies -1)');
const logs = (await pool.query(`select count(*)::int n from audit_logs where id > $2 and action='ADMIT' and regno=(select regno from students where id=$1)`, [stu.id, base])).rows[0].n;
assert.equal(logs, 1); ok('exactly one ADMIT audit entry');

// Two simultaneous revokes of the same audit entry: only one may apply.
const { rows: [ent] } = await pool.query(`select id from audit_logs where id > ${base} and action='ADMIT' and revoked_at is null order by id desc limit 1`);
const rv = await Promise.all([1, 2, 3, 4].map(() => call('/logs/' + ent.id + '/revoke', { token: admin, method: 'POST', body: { remarks: 'test' } })));
console.log('    statuses:', rv.map(r => r.status).join(','));
assert.equal(rv.filter(r => r.status === 200).length, 1);
const fin = (await pool.query(`select sum(admitted)::int a, sum(vacancies)::int v from vacancies where class_level=$1`, [stu.class_level])).rows[0];
assert.deepEqual(fin, before); ok('4 simultaneous revokes -> applied once, seat counts back to original');

await call('/auth/logout', { token: admin, method: 'POST' });

console.log('Freeze access tests');
{
  const bcrypt = (await import('bcryptjs')).default;
  const adm = (await login(A, AP)).body.token;
  const list = await call('/users', { token: adm }); assert.equal(list.status, 200);
  const target = list.body.find(x => x.username === U), me = list.body.find(x => x.username === A);
  const devs = await Promise.all([1, 2, 3].map(() => login(U, P))); const dt = devs.map(r => r.body.token);
  assert((await Promise.all(dt.map(t => call('/auth/session', { token: t })))).every(r => r.status === 200));
  assert.equal((await call('/users', { token: dt[0] })).status, 403); ok('non-admin cannot see or use the user list');
  assert.equal((await call(`/users/${target.id}/freeze`, { token: adm, method: 'POST', body: {} })).status, 400); ok('freeze needs a reason');
  assert.equal((await call(`/users/${me.id}/freeze`, { token: adm, method: 'POST', body: { reason: 'x' } })).status, 409); ok('admin cannot freeze themself');
  const fr = await Promise.all([1, 2, 3].map(() => call(`/users/${target.id}/freeze`, { token: adm, method: 'POST', body: { reason: 'Under review' } })));
  assert.equal(fr.filter(r => r.status === 200).length, 1); ok('3 simultaneous freezes -> applied once');
  const after = await Promise.all(dt.map(t => call('/auth/session', { token: t })));
  assert(after.every(r => r.status === 401 && r.body.code === 'ACCOUNT_FROZEN')); ok('all 3 devices of the frozen user are blocked immediately');
  const bl = await login(U, P); assert.equal(bl.status, 403); assert.equal(bl.body.code, 'ACCOUNT_FROZEN'); ok('frozen user cannot sign in');
  assert.equal((await login(U, 'wrong-password')).status, 401); ok('wrong password still says nothing about frozen state');
  assert.equal((await call('/users', { token: adm })).body.find(x => x.username === U).frozenReason, 'Under review'); ok('list shows frozen state and reason');
  assert.equal((await call(`/users/${target.id}/unfreeze`, { token: adm, method: 'POST' })).status, 200);
  assert.equal((await login(U, P)).status, 200); ok('after unfreeze the user can sign in again');
  assert.equal((await call(`/users/${target.id}/unfreeze`, { token: adm, method: 'POST' })).status, 409);
  // two super admins freezing each other at the same time must never lock everyone out
  await pool.query(`insert into users (username, password_hash, role) values ('tmp_admin', $1, 'SUPER_ADMIN') on conflict do nothing`, [bcrypt.hashSync('Tmp-admin-pass-1', 4)]);
  const tmp = (await call('/users', { token: adm })).body.find(x => x.username === 'tmp_admin'); const tadm = (await login('tmp_admin', 'Tmp-admin-pass-1')).body.token;
  const duel = await Promise.all([call(`/users/${tmp.id}/freeze`, { token: adm, method: 'POST', body: { reason: 'duel' } }), call(`/users/${me.id}/freeze`, { token: tadm, method: 'POST', body: { reason: 'duel' } })]);
  console.log('    statuses:', duel.map(r => r.status).join(','));
  const active = (await pool.query(`select count(*)::int n from users where role='SUPER_ADMIN' and frozen_at is null`)).rows[0].n;
  assert(active >= 1); ok('two admins freezing each other at once -> at least one admin always remains');
  await pool.query(`update users set frozen_at=null, frozen_by=null, frozen_reason=null`);
  await pool.query(`delete from users where username='tmp_admin'`);
  await call('/auth/logout', { token: adm, method: 'POST' });
}
await pool.end();
console.log(`\nAll ${pass} checks passed`);
