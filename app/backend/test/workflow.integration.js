// End-to-end run of the flowchart against a REAL (empty, disposable) PostgreSQL database:   DATABASE_URL=... npm run test:integration
// It starts the API, imports data as Excel, ranks, lists, and walks students through every status of the chart.
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
const xlsx = rows => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'S'); return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }); };
const login = async (username, password) => (await ok(null, 'POST', '/auth/login', { username, password })).token;

try {
  const admin = await login('superadmin', env.SEED_ADMIN_PASSWORD);
  // Section 2: EMIS team students (header names exactly as in the database document), DGE and Kalai data
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
  // Section 3: the DMS furnishes vacancies
  r = await ok(admin, 'POST', '/import/vacancies', { classLevel: 9, fileData: xlsx([
    { New_district: 'ERODE', New_udise_code: 'U1', New_school_name: 'DMS ERODE', gender: 'Boy', medium: 'Tamil', community: 'GT', vacancies: 2 },
    { New_district: 'ERODE', New_udise_code: 'U1', New_school_name: 'DMS ERODE', gender: 'Girl', medium: 'Tamil', community: 'GT', vacancies: 1 }]) });
  assert.equal(r.seats, 3); const dmsPw = r.newUsers[0].password, dmsName = r.newUsers[0].username;
  // an RC for the region, with access to class 9
  const rc = await ok(admin, 'POST', '/users', { username: 'rc_erode', role: 'REGION', region: 'ERODE,SALEM', classes: [9] });
  const dms = await login(dmsName, dmsPw), rcTok = await login('rc_erode', rc.password), state = await login('state_coordinator', env.STATE_PASSWORD || 'State-Pass-12345');
  assert.equal((await call(dms, 'GET', '/students?class=9')).rows.length, 0, 'before a list the DMS sees nobody');
  // 1st list (1A)
  r = await ok(admin, 'POST', '/lists/generate', { classLevel: 9 });
  assert.equal(r.listed, 3); assert.equal(r.listNumber, 1);
  let list = await ok(dms, 'GET', '/students?class=9&view=waiting'); assert.equal(list.total, 3);
  assert.equal((await call(admin, 'POST', '/lists/generate', { classLevel: 9 })).listed ?? 0, 0, 'no balance: nothing new');
  const byName = n => list.rows.find(s => s.name === n);
  const ranked = list.rows.sort((a, b) => a.orank - b.orank), [s1, s2, s3] = ranked;
  const act = async (tok, s, action, remarks = 'note') => call(tok, 'POST', `/students/9/${s.id}/action`, { action, remarks });
  // Section 4
  assert.equal((await act(rcTok, s1, 'WILLING')).status, 403, 'the RC cannot decide willingness');
  await ok(dms, 'POST', `/students/9/${s1.id}/action`, { action: 'WILLING' });          // 2A
  await ok(dms, 'POST', `/students/9/${s2.id}/action`, { action: 'NOT_WILLING', remarks: 'moved away' });   // 6A  -> V
  await ok(dms, 'POST', `/students/9/${s3.id}/action`, { action: 'WILLING' });          // 2A
  assert.equal((await act(dms, s2, 'WILLING')).status, 409);
  // Section 6: joining
  await ok(dms, 'POST', `/students/9/${s1.id}/action`, { action: 'JOINED_HM' });        // 3A  -> seat JOINED
  await ok(dms, 'POST', `/students/9/${s3.id}/action`, { action: 'NOT_JOINED', remarks: 'no relieving order' });   // 7A
  await ok(rcTok, 'POST', `/students/9/${s3.id}/action`, { action: 'RC_APPROVE_NOT_JOINED', remarks: 'verified' }); // 7B -> V
  let cells = await ok(dms, 'GET', '/vacancies?class=9'); assert.equal(cells.reduce((n, c) => n + c.joined, 0), 1);
  // Section 5: fresh list fills the balance (V connector); 6A and 7B students are not listed again
  r = await ok(admin, 'POST', '/lists/generate', { classLevel: 9 }); assert(r.listed >= 1 && r.listNumber === 2, JSON.stringify(r));
  const all = await ok(admin, 'GET', '/students?class=9&view=notwilling'); assert(all.rows.some(s => s.id === s2.id), '6A stays 6A');
  // reconsideration (1B) and the W connector
  await ok(dms, 'POST', `/students/9/${s2.id}/action`, { action: 'RECONSIDER', remarks: 'family reconsidered' });
  assert.equal((await ok(dms, 'GET', `/students/9/${s2.id}`)).statusCode, '1B');
  // TC: DMS -> RC -> State Regional Coordinator
  await ok(dms, 'POST', `/students/9/${s1.id}/action`, { action: 'TC_REQUEST', remarks: 'transfer' });          // 8A, seat still JOINED
  assert.equal((await ok(dms, 'GET', '/vacancies?class=9')).reduce((n, c) => n + c.joined, 0), 1);
  assert.equal((await act(state, s1, 'TC_STATE_APPROVE')).status, 409, 'RC first');
  assert.equal((await ok(rcTok, 'GET', '/tc')).length, 1);
  await ok(rcTok, 'POST', `/students/9/${s1.id}/action`, { action: 'TC_RC_APPROVE' });
  assert.equal((await ok(state, 'GET', '/tc?stage=STATE')).length, 1);
  await ok(state, 'POST', `/students/9/${s1.id}/action`, { action: 'TC_STATE_APPROVE' });                        // 8B -> seat VACANT
  assert.equal((await ok(dms, 'GET', '/vacancies?class=9')).reduce((n, c) => n + c.joined, 0), 0);
  // scope and class access
  assert.equal((await call(dms, 'GET', '/students?class=10')).status, 403, 'no access row for class 10');
  assert.equal((await call(dms, 'POST', '/lists/generate', { classLevel: 9 })).status, 403);
  // super admin correction
  await ok(admin, 'POST', `/students/9/${s1.id}/override`, { code: '3B', remarks: 'TC was a mistake' });
  const fixed = await ok(admin, 'GET', `/students/9/${s1.id}`); assert.equal(fixed.statusCode, '3B'); assert.equal(fixed.selectStatus, '3B'); assert.equal(fixed.admitStatus, 'Joined by RC', 'admit_status holds the description of select_status');
  // the history is in the two log tables
  const slog = await ok(admin, 'GET', '/logs/students?class=9'), vlog = await ok(admin, 'GET', '/logs/vacancies?class=9');
  assert(slog.length >= 12 && vlog.length >= 3, `logs written (${slog.length}, ${vlog.length})`);
  assert(slog.some(l => l.updateStatusBefore === '3A' && l.updateStatusAfter === '8A'));
  // single device per user
  const again = await login('superadmin', env.SEED_ADMIN_PASSWORD); assert.equal((await call(admin, 'GET', '/auth/session')).status, 401); assert.equal((await call(again, 'GET', '/auth/session')).status, 200);
  // exports use the document's column names
  const x = await fetch(B + '/export/master?class=9', { headers: { Authorization: 'Bearer ' + again } }); const wb = XLSX.read(Buffer.from(await x.arrayBuffer()));
  assert(Object.keys(XLSX.utils.sheet_to_json(wb.Sheets.Students)[0]).includes('mark1-quertly'));
  // and the database still has exactly the 10 tables
  const { verify } = await import('../src/dbVerify.js'); const problems = await verify(pool); assert.deepEqual(problems, []);
  console.log('Whole flowchart OK: import -> rank -> vacancies -> list 1A -> 2A/6A -> 3A/7A -> 7B -> list 2 -> 1B -> 8A -> 8B -> correction; 10 tables unchanged');
} catch (e) { console.error(e); process.exitCode = 1; } finally { server.kill(); await pool.end(); }
