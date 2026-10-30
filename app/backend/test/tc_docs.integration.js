// Integration test for TC requests (tc_requests table), student documents (document store), undo, and the table list.
// Needs a running API + database, and a selection that has already been run:
//   API=http://localhost:4000 ADMIN_PW=... DISTRICT_USER=... DISTRICT_PW=... node test/tc_docs.integration.js
// Run it from the backend folder (it checks the files under ./uploads/documents).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import 'dotenv/config';

const API = process.env.API || 'http://localhost:4000';
const call = async (path, { token, method = 'GET', body } = {}) => {
  const r = await fetch(API + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const login = (u, p) => call('/auth/login', { method: 'POST', body: { username: u, password: p } });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let pass = 0; const ok = name => console.log('  ok -', name, ++pass && '');
const file = name => ({ fileName: name, fileData: Buffer.from('%PDF-1.4\n' + name + Math.random()).toString('base64') });
const U = process.env.DISTRICT_USER, P = process.env.DISTRICT_PW, A = 'superadmin', AP = process.env.ADMIN_PW;
const adm = (await login(A, AP)).body.token, dst = (await login(U, P)).body.token;
const one = async (sql, args) => (await pool.query(sql, args)).rows[0];
const seats = async c => one(`select sum(admitted)::int a, sum(vacancies)::int v from vacancies where class_level=$1`, [c]);

console.log('Database design');
const tables = (await pool.query(`select table_name t from information_schema.tables where table_schema = current_schema() order by 1`)).rows.map(r => r.t);
assert.deepEqual(tables, ['audit_logs', 'status_logs', 'students', 'tc_requests', 'users', 'vacancies']); ok('the database has exactly the 6 tables of the design');
const cols = async t => (await pool.query(`select column_name c from information_schema.columns where table_schema = current_schema() and table_name = $1 order by ordinal_position`, [t])).rows.map(r => r.c);
assert(!(await cols('users')).some(c => c.startsWith('frozen')) && !(await cols('students')).some(c => ['documents', 'tc'].includes(c))); ok('no extra columns on users or students');

// Admit three selected students of the district user's district.
const { rows: pick } = await pool.query(`select id, regno, name, class_level from students where lower(district) = lower((select district from users where username = $1))
  and select_status <> '' and admit_status = '' and willing_status = 'WILLING' order by id limit 3`, [U]);
assert.equal(pick.length, 3, 'need 3 selected, undecided students in the district (run selection first)');
for (const s of pick) assert.equal((await call('/students/' + s.id, { token: dst, method: 'PATCH', body: { admitStatus: 'Admitted' } })).status, 200);
const [S1, S2, S3] = pick, C = S1.class_level;

console.log('TC requests (tc_requests table)');
assert.equal((await call('/tc', { token: dst, method: 'POST', body: { studentId: S1.id, reason: ' ', ...file('a.pdf') } })).status, 400); ok('reason is required');
assert.equal((await call('/tc', { token: dst, method: 'POST', body: { studentId: S1.id, reason: 'Moving away', ...file('a.pdf') } })).status, 200); ok('district user raises a TC request');
assert.equal((await call('/tc', { token: dst, method: 'POST', body: { studentId: S1.id, reason: 'Again', ...file('a.pdf') } })).status, 409); ok('a second request while one is pending is refused');
const race = await Promise.all(Array.from({ length: 6 }, () => call('/tc', { token: dst, method: 'POST', body: { studentId: S2.id, reason: 'Race', ...file('r.pdf') } })));
assert.equal(race.filter(r => r.status === 200).length, 1);
assert.equal((await one(`select count(*)::int n from tc_requests where student_id = $1`, [S2.id])).n, 1); ok('6 simultaneous requests for one student -> exactly one row in tc_requests');
let list = (await call('/tc', { token: dst })).body;
const row1 = list.find(r => r.studentId === S1.id);
assert(row1 && row1.status === 'PENDING' && row1.reason === 'Moving away' && row1.id === S1.id && row1.regno === S1.regno && row1.requestedBy === U); ok('list shows the request with the same fields as before');
assert.equal((await call('/tc', { token: adm })).body.filter(r => r.studentId === S1.id).length, 1); ok('super admin sees one entry per student');
assert.equal((await call('/tc?status=PENDING', { token: adm })).body.every(r => r.status === 'PENDING'), true); ok('status filter works');
const lt = await fetch(`${API}/api/tc/${S1.id}/letter`, { headers: { Authorization: 'Bearer ' + dst } }); assert.equal(lt.status, 200); ok('TC letter can be opened');
assert.equal((await call(`/tc/${S1.id}/review`, { token: adm, method: 'POST', body: { decision: 'APPROVED' } })).status, 400); ok('a message is required to review');
assert.equal((await call(`/tc/${S1.id}/review`, { token: dst, method: 'POST', body: { decision: 'APPROVED', remarks: 'x' } })).status, 403); ok('district user cannot review');

const s0 = await seats(C);
const rv = await Promise.all([1, 2, 3, 4].map(() => call(`/tc/${S1.id}/review`, { token: adm, method: 'POST', body: { decision: 'APPROVED', remarks: 'Approved' } })));
assert.equal(rv.filter(r => r.status === 200).length, 1); ok('4 simultaneous approvals -> applied once');
assert.equal((await one(`select admit_status a from students where id=$1`, [S1.id])).a, 'TC Issued');
const s1 = await seats(C); assert.equal(s0.a - s1.a, 1); assert.equal(s1.v - s0.v, 1); ok('student is TC Issued and the seat is freed exactly once');
assert.equal((await call('/tc', { token: dst })).body.find(r => r.studentId === S1.id).status, 'APPROVED'); ok('list shows APPROVED');
assert.equal((await call(`/students/${S1.id}/revoke-admission`, { token: adm, method: 'POST', body: { remarks: 'x' } })).status, 400); ok('admission of a TC-issued student cannot be revoked');

// Undo the approval from the audit log.
const logs = async () => (await call('/logs?limit=200', { token: adm })).body;
let e = (await logs()).filter(x => x.action === 'TC_APPROVED' && x.regno === S1.regno).pop();
assert(e && e.canRevoke); assert.equal((await call(`/logs/${e.id}/revoke`, { token: adm, method: 'POST', body: { remarks: 'undo test' } })).status, 200);
assert.equal((await one(`select admit_status a from students where id=$1`, [S1.id])).a, 'Admitted');
assert.deepEqual(await seats(C), s0);
assert.equal((await call('/tc', { token: adm })).body.find(r => r.studentId === S1.id).status, 'PENDING'); ok('revoking the approval puts the student, the seat and the request back');

// Reject, then raise a new request (a student can have several over time).
assert.equal((await call(`/tc/${S1.id}/review`, { token: adm, method: 'POST', body: { decision: 'REJECTED', remarks: 'Not allowed' } })).status, 200);
assert.equal((await call('/tc', { token: dst })).body.find(r => r.studentId === S1.id).reviewRemarks, 'Not allowed'); ok('rejection message is saved');
assert.equal((await call('/tc', { token: dst, method: 'POST', body: { studentId: S1.id, reason: 'Second try', ...file('b.pdf') } })).status, 200);
assert.equal((await one(`select count(*)::int n from tc_requests where student_id=$1`, [S1.id])).n, 2);
const cur = (await call('/tc', { token: dst })).body.filter(r => r.studentId === S1.id);
assert.equal(cur.length, 1); assert.equal(cur[0].status, 'PENDING'); assert.equal(cur[0].reason, 'Second try'); ok('after a rejection a new request can be raised; the list shows the latest one');
assert.equal((await call(`/students/${S1.id}/revoke-admission`, { token: adm, method: 'POST', body: { remarks: 'x' } })).status, 409); ok('admission cannot be revoked while a TC request is pending');

// Approve again, then take the TC back (revert-tc) and undo that.
assert.equal((await call(`/tc/${S1.id}/review`, { token: adm, method: 'POST', body: { decision: 'APPROVED', remarks: 'ok' } })).status, 200);
assert.equal((await call(`/students/${S1.id}/revert-tc`, { token: adm, method: 'POST', body: { remarks: 'wrongly issued' } })).status, 200);
assert.equal((await one(`select admit_status a from students where id=$1`, [S1.id])).a, 'Admitted');
assert.equal((await one(`select status s from tc_requests where student_id=$1 order by id desc limit 1`, [S1.id])).s, 'CANCELLED'); ok('reverting a TC returns the student to Admitted and cancels the request');
e = (await logs()).filter(x => x.action === 'REVERT_TC' && x.regno === S1.regno).pop();
assert.equal((await call(`/logs/${e.id}/revoke`, { token: adm, method: 'POST', body: { remarks: 'undo' } })).status, 200);
assert.equal((await one(`select admit_status a from students where id=$1`, [S1.id])).a, 'TC Issued');
assert.equal((await one(`select status s from tc_requests where student_id=$1 order by id desc limit 1`, [S1.id])).s, 'APPROVED'); ok('undoing the revert restores the TC (student and request)');

console.log('Student documents (document store)');
const up = (id, type, t = dst) => call('/documents', { token: t, method: 'POST', body: { studentId: id, docType: type, ...file(type + '.pdf') } });
assert.equal((await up(S2.id, 'Not A Type')).status, 400); ok('invalid document type refused');
assert.equal((await up(S2.id, 'Birth Certificate')).status, 200); ok('district user uploads a document');
assert(fs.existsSync(`uploads/documents/${S2.id}.json`)); ok('its record is kept as a file, not in the database');
assert.equal((await up(S2.id, 'Birth Certificate')).status, 409); ok('uploading the same type twice is refused');
const dr = await Promise.all(Array.from({ length: 6 }, () => up(S2.id, 'Aadhaar Card')));
assert.equal(dr.filter(r => r.status === 200).length, 1);
const man = JSON.parse(fs.readFileSync(`uploads/documents/${S2.id}.json`, 'utf8'));
assert(man['Birth Certificate'] && man['Aadhaar Card']); ok('6 simultaneous uploads of one type -> one wins, and the other document is not lost');
const mix = await Promise.all([up(S2.id, 'Transfer Certificate'), up(S2.id, 'Application Form'), up(S2.id, 'Community Certificate')]);
assert(mix.every(r => r.status === 200));
assert.equal(Object.keys(JSON.parse(fs.readFileSync(`uploads/documents/${S2.id}.json`, 'utf8'))).length, 5); ok('3 different documents uploaded at the same moment -> all 3 are kept (5 in total)');
assert.equal((await up(S3.id, 'Aadhaar Card', adm)).status, 403); ok('super admin cannot upload');
let dl = (await call('/documents?studentId=' + S2.id, { token: dst })).body; assert.equal(dl.length, 5); assert(dl.every(d => d.studentId === S2.id && d.status === 'PENDING')); ok('document list');
const st = (await call('/documents/students', { token: dst })).body.find(r => r.studentId === S2.id);
assert(st && st.submitted === 3 && st.verified === 0 && st.pending === 5 && st.state === 'PENDING'); ok('student summary counts the 3 required documents');
assert.equal((await call('/documents/progress', { token: dst })).body[S2.id].submitted, 3); ok('progress for the student list');
const fr = await fetch(`${API}/api/documents/${dl[0].id}/file`, { headers: { Authorization: 'Bearer ' + dst } }); assert.equal(fr.status, 200); ok('a document file can be opened');

const find = type => dl.find(d => d.docType === type).id;
assert.equal((await call(`/documents/${find('Aadhaar Card')}/review`, { token: adm, method: 'POST', body: { decision: 'REJECTED' } })).status, 400); ok('rejecting needs remarks');
assert.equal((await call(`/documents/${find('Aadhaar Card')}/review`, { token: adm, method: 'POST', body: { decision: 'REJECTED', remarks: 'Blurred' } })).status, 200);
dl = (await call('/documents?studentId=' + S2.id, { token: dst })).body;
assert.equal(dl.find(d => d.docType === 'Aadhaar Card').status, 'REJECTED'); assert.equal(dl.find(d => d.docType === 'Aadhaar Card').remarks, 'Blurred'); ok('rejected with remarks');
assert.equal((await call(`/documents/${find('Aadhaar Card')}/replace`, { token: dst, method: 'POST', body: file('new.pdf') })).status, 200);
assert.equal((await call('/documents?studentId=' + S2.id, { token: dst })).body.find(d => d.docType === 'Aadhaar Card').status, 'PENDING'); ok('a rejected document can be resubmitted');

assert.equal((await call('/students?class=' + C + '&view=admitted&search=' + encodeURIComponent(S2.name) + '&docsOpen=1', { token: dst })).body.rows.some(r => r.id === S2.id), true); ok('student with open documents is listed by the "documents not done" filter');
const rvw = type => call(`/documents/${find(type)}/review`, { token: adm, method: 'POST', body: { decision: 'VERIFIED' } });
for (const t of ['Birth Certificate', 'Transfer Certificate', 'Application Form']) assert.equal((await rvw(t)).status, 200);
const vs = (await call('/documents/students', { token: adm })).body.find(r => r.studentId === S2.id);
assert.equal(vs.verified, 3); ok('the 3 required documents verified');
assert.equal((await call('/students?class=' + C + '&view=admitted&search=' + encodeURIComponent(S2.name) + '&docsOpen=1', { token: dst })).body.rows.some(r => r.id === S2.id), false); ok('fully verified student drops out of the "documents not done" filter');
assert.equal((await call(`/documents/${find('Birth Certificate')}/replace`, { token: dst, method: 'POST', body: file('x.pdf') })).status, 409); ok('a verified document cannot be edited');
e = (await logs()).filter(x => x.action === 'DOC_VERIFIED' && x.regno === S2.regno).pop();
assert((await call(`/logs/${e.id}/revoke`, { token: adm, method: 'POST', body: { remarks: 'undo' } })).status === 200);
assert.equal((await call('/documents?studentId=' + S2.id, { token: dst })).body.find(d => d.docType === 'Application Form').status, 'PENDING'); ok('revoking a verification puts the document back to pending');
assert.equal((await call('/documents', { token: (await login(U, P)).body.token })).status, 200);
assert.equal((await call('/documents/' + S3.id + '-0/file', { token: dst })).status, 404); ok('student without documents -> not found');

await pool.end();
console.log(`\nAll ${pass} checks passed`);
