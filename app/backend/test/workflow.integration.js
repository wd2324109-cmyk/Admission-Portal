import assert from 'node:assert';
import { spawn, execFileSync } from 'node:child_process';
import * as XLSX from 'xlsx';
import pg from 'pg';

const env = { ...process.env, PORT: '4555', JWT_SECRET: process.env.JWT_SECRET || 'x'.repeat(8) + 'abcdefghijklmnopqrstuvwxyz0123456789', SEED_ADMIN_PASSWORD: 'Admin-Pass-12345', SEED_STATE_PASSWORD: 'State-Pass-12345' };
const run = (...a) => execFileSync('node', a, { env, stdio: 'pipe' }).toString();
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
await pool.query('drop schema public cascade; create schema public');
run('src/dbSetup.js'); run('src/seed.js');
const server = spawn('node', ['src/server.js'], { env, stdio: 'pipe' });
await new Promise(r => setTimeout(r, 1500));
const B = 'http://localhost:4555/api';
const call = async (token, method, path, body) => { const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body && JSON.stringify(body) }); const d = await r.json().catch(() => ({})); return { status: r.status, ...d, data: d }; };
const ok = async (...a) => { const r = await call(...a); assert(r.status < 300, `${a[1]} ${a[2]} -> ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
const pdf = n => ({ fileName: n + '.pdf', fileData: Buffer.from('%PDF-1.4\n' + n).toString('base64') }), LETTERS = { HM: pdf('hm'), STUDENT: pdf('student') };
const xlsx = rows => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'S'); return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }); };
const login = async (username, password) => (await ok(null, 'POST', '/auth/login', { username, password })).token;

try {
  const admin = await login('superadmin', env.SEED_ADMIN_PASSWORD);

  const mk = (i, o = {}) => ({ Emis: 1000 + i, Name: `Student ${i}`, district: 'ERODE', Gender: i % 2 ? 'Boy' : 'Girl', community: i % 3 ? 'BC' : 'SC', medium: 'Tamil', Disability_status: 'No',
    Father_name: 'F', Mother_name: 'M', Phone: '9000000000', 'mark1-quertly': 300 + i, 'mark2-half': 320 + i, 'Total-highest of two': 320 + i, pass: 'Pass', ...o });
  const students = Array.from({ length: 12 }, (_, i) => mk(i + 1)).concat([{ ...mk(99), Emis: 'abc' }]);
  let r = await ok(admin, 'POST', '/import/students', { classLevel: 9, fileData: xlsx(students) });
  assert.equal(r.imported, 12); assert.equal(r.rejectedCount, 1);
  r = await ok(admin, 'POST', '/import/dge', { classLevel: 9, fileData: xlsx([{ Emis: 1012, nmss: 50, Trust: '5' }, { Emis: 1011, nmss: 10, Trust: '0' }]) });
  assert.equal(r.imported, 2);
  r = await ok(admin, 'POST', '/import/kalai', { classLevel: 9, fileData: xlsx([{ Emis: 1010, 'Other marks': 200 }]) });
  assert.equal(r.imported, 1);
  assert.equal((await call(admin, 'POST', '/lists/generate', { classLevel: 9 })).status, 409, 'a list needs vacancies and ranks first');
  assert.equal((await ok(admin, 'POST', '/rank/generate', { classLevel: 9 })).ranked, 12);

  r = await ok(admin, 'POST', '/import/vacancies', { classLevel: 9, fileData: xlsx([
    { New_district: 'ERODE', New_udise_code: 'U1', New_school_name: 'DMS ERODE', gender: 'Boy', medium: 'Tamil', community: 'GT', vacancies: 2 },
    { New_district: 'ERODE', New_udise_code: 'U1', New_school_name: 'DMS ERODE', gender: 'Girl', medium: 'Tamil', community: 'GT', vacancies: 1 }]) });
  assert.equal(r.seats, 3); const dmsPw = r.newUsers[0].password, dmsName = r.newUsers[0].username;

  const rc = await ok(admin, 'POST', '/users', { username: 'rc_erode', role: 'REGION', region: 'ERODE,SALEM', classes: [9] });
  const dms = await login(dmsName, dmsPw), rcTok = await login('rc_erode', rc.password), state = await login('state_coordinator', env.STATE_PASSWORD || 'State-Pass-12345');
  assert.equal((await call(dms, 'GET', '/students?class=9')).rows.length, 0, 'before a list the DMS sees nobody');

  r = await ok(admin, 'POST', '/lists/generate', { classLevel: 9 });
  assert.equal(r.listed, 3); assert.equal(r.listNumber, 1);
  let list = await ok(dms, 'GET', '/students?class=9&view=waiting'); assert.equal(list.total, 3);
  assert.equal((await call(admin, 'POST', '/lists/generate', { classLevel: 9 })).listed ?? 0, 0, 'no balance: nothing new');
  const byName = n => list.rows.find(s => s.name === n);
  const ranked = list.rows.sort((a, b) => a.orank - b.orank), [s1, s2, s3] = ranked;
  const act = async (tok, s, action, remarks = 'note') => call(tok, 'POST', `/students/9/${s.id}/action`, { action, remarks });

  assert.equal((await act(rcTok, s1, 'WILLING')).status, 403, 'the RC cannot decide willingness');
  await ok(dms, 'POST', `/students/9/${s1.id}/action`, { action: 'WILLING' });
  await ok(dms, 'POST', `/students/9/${s2.id}/action`, { action: 'NOT_WILLING', remarks: 'moved away', letters: LETTERS });
  await ok(dms, 'POST', `/students/9/${s3.id}/action`, { action: 'WILLING' });
  assert.equal((await act(dms, s2, 'WILLING')).status, 409);

  await ok(dms, 'POST', `/students/9/${s1.id}/action`, { action: 'JOINED_HM' });
  await ok(dms, 'POST', `/students/9/${s3.id}/action`, { action: 'NOT_JOINED', remarks: 'no relieving order', letters: LETTERS });
  await ok(rcTok, 'POST', `/students/9/${s3.id}/action`, { action: 'RC_APPROVE_NOT_JOINED', remarks: 'verified' });
  let cells = await ok(dms, 'GET', '/vacancies?class=9'); assert.equal(cells.reduce((n, c) => n + c.joined, 0), 1);

  r = await ok(admin, 'POST', '/lists/generate', { classLevel: 9 }); assert(r.listed >= 1 && r.listNumber === 2, JSON.stringify(r));
  const all = await ok(admin, 'GET', '/students?class=9&view=notwilling'); assert(all.rows.some(s => s.id === s2.id), '6A stays 6A');

  await ok(dms, 'POST', `/students/9/${s2.id}/action`, { action: 'RECONSIDER', remarks: 'family reconsidered' });
  const asked = await ok(dms, 'GET', `/students/9/${s2.id}`);
  assert.equal(asked.statusCode, '', 'a reconsideration request leaves the select status empty'); assert(!asked.selectStatus && !asked.admitStatus, 'select_status and admit_status are null');
  for (const v of ['waiting', 'notwilling', 'selected']) for (const who of [dms, admin]) assert(!(await ok(who, 'GET', `/students?class=9&view=${v}`)).rows.some(s => s.id === s2.id), `a reconsidered student shows on no tab (${v})`);

  await ok(dms, 'POST', `/students/9/${s1.id}/action`, { action: 'TC_REQUEST', remarks: 'transfer' });
  assert.equal((await ok(dms, 'GET', '/vacancies?class=9')).reduce((n, c) => n + c.joined, 0), 1);
  assert.equal((await act(state, s1, 'TC_STATE_APPROVE')).status, 409, 'RC first');
  assert.equal((await ok(rcTok, 'GET', '/tc?class=9&stage=REGION')).rows.length, 1);
  await ok(rcTok, 'POST', `/students/9/${s1.id}/action`, { action: 'TC_RC_APPROVE' });
  assert.equal((await ok(state, 'GET', '/tc?class=9&stage=STATE')).rows.length, 1);
  await ok(state, 'POST', `/students/9/${s1.id}/action`, { action: 'TC_STATE_APPROVE' });
  assert.equal((await ok(dms, 'GET', '/vacancies?class=9')).reduce((n, c) => n + c.joined, 0), 0);

  assert.equal((await call(dms, 'GET', '/students?class=10')).status, 403, 'no access row for class 10');
  assert.equal((await call(dms, 'POST', '/lists/generate', { classLevel: 9 })).status, 403);

  assert.equal((await call(admin, 'POST', `/students/9/${s1.id}/override`, { code: '3B', remarks: 'TC was a mistake' })).status, 409, 'correction offers the next status only; TC Issued is the last one');
  const s1c = await ok(admin, 'GET', `/students/9/${s1.id}`); assert.deepEqual(s1c.nextStatuses, [], 'TC Issued is the last status');

  const slog = await ok(admin, 'GET', '/logs/students?class=9'), vlog = await ok(admin, 'GET', '/logs/vacancies?class=9');
  assert(slog.length >= 12 && vlog.length >= 2, `logs written (${slog.length}, ${vlog.length})`);
  assert(slog.some(l => l.updateStatusBefore === '3A' && l.updateStatusAfter === '8A'));

  const again = await login('superadmin', env.SEED_ADMIN_PASSWORD); assert.equal((await call(admin, 'GET', '/auth/session')).status, 200, 'a second sign-in does not end the first device'); assert.equal((await call(again, 'GET', '/auth/session')).status, 200);
  await ok(again, 'POST', '/auth/logout'); assert.equal((await call(again, 'GET', '/auth/session')).status, 401, 'signing out ends only that device'); assert.equal((await call(admin, 'GET', '/auth/session')).status, 200);
  const again2 = await login('superadmin', env.SEED_ADMIN_PASSWORD);

  const x = await fetch(B + '/export/master?class=9', { headers: { Authorization: 'Bearer ' + again2 } }); const wb = XLSX.read(Buffer.from(await x.arrayBuffer()));
  assert(Object.keys(XLSX.utils.sheet_to_json(wb.Sheets.Students)[0]).includes('mark1-quertly'));

  const { verify } = await import('../src/dbVerify.js'); const problems = await verify(pool); assert.deepEqual(problems, []);
  console.log('Whole flowchart OK: import -> rank -> vacancies -> list 1A -> 2A/6A -> 3A/7A -> 7B -> list 2 -> reconsider (null) -> 8A -> 8B -> correction; 10 tables unchanged');
} catch (e) { console.error(e); process.exitCode = 1; } finally { server.kill(); await pool.end(); }
