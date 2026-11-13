// Pure tests of the flowchart rules (no database).   node src/workflow/workflow.test.js
import assert from 'node:assert';
import { planAction, availableActions } from './transitions.js';
import { stateOf, seatEffect, holdsSeat, groupOf } from './statuses.js';
import { planList } from './allocation.js';
import { computeRanks } from './rank.js';

// state = current status code (select_status) + TC stage (tag2). S('2A','3A') keeps the old two-argument form: the LAST code given is the current one.
const S = (a = '', b = '', tag2 = '') => ({ code: b || a, tag2 });
const run = (role, state, key, remarks = 'ok') => planAction(role, state, key, remarks).after;
const fails = (fn, status) => { try { fn(); } catch (e) { assert.equal(e.status, status ?? e.status); return; } assert.fail('expected an error'); };

// --- Section 4: Admission at DMS
assert.deepEqual(run('DISTRICT', S('1A'), 'WILLING'), S('2A'));
assert.equal(run('DISTRICT', S('1A'), 'NOT_WILLING').code, '6A');
assert.equal(run('DISTRICT', S('6A'), 'RECONSIDER').code, '1B');
fails(() => run('DISTRICT', S('6A'), 'WILLING'), 409);                    // a Not Willing student cannot be marked willing directly
fails(() => run('DISTRICT', S('1B'), 'WILLING'), 409);                    // 1B must be listed again first
fails(() => planAction('DISTRICT', S('1A'), 'NOT_WILLING', ''), 400);     // reason required
// --- Section 6: joining
assert.equal(run('DISTRICT', S('2A'), 'JOINED_HM').code, '3A');
assert.equal(run('DISTRICT', S('2A'), 'NOT_JOINED').code, '7A');
assert.equal(run('REGION', S('2A', '7A'), 'RC_READMIT').code, '3B');
assert.equal(run('REGION', S('2A', '7A'), 'RC_APPROVE_NOT_JOINED').code, '7B');
fails(() => run('DISTRICT', S('2A', '7A'), 'RC_READMIT'), 403);           // only the RC re-admits
fails(() => run('REGION', S('2A'), 'RC_READMIT'), 409);
// --- TC: DMS -> RC -> State Regional Coordinator
let st = run('DISTRICT', S('2A', '3A'), 'TC_REQUEST'); assert.deepEqual([st.code, st.tag2], ['8A', 'TC-RC']);
fails(() => run('STATE', st, 'TC_STATE_APPROVE'), 409);                   // the RC must approve first
st = run('REGION', st, 'TC_RC_APPROVE'); assert.equal(st.tag2, 'TC-SRC');
fails(() => run('REGION', st, 'TC_RC_APPROVE'), 409);
st = run('STATE', st, 'TC_STATE_APPROVE'); assert.deepEqual([st.code, st.tag2], ['8B', 'TC-DONE']);
fails(() => run('DISTRICT', S('2A', '3B'), 'JOINED_HM'), 409);
// --- seats: taken at 3A/3B, kept during 8A, released at 8B; held while 1A/2A/7A
assert.equal(seatEffect(S('2A'), S('2A', '3A')), 'JOIN');
assert.equal(seatEffect(S('2A', '7A'), S('2A', '3B')), 'JOIN');
assert.equal(seatEffect(S('2A', '3A'), S('2A', '8A')), null);
assert.equal(seatEffect(S('2A', '8A'), S('2A', '8B')), 'RELEASE');
assert.equal(seatEffect(S('2A'), S('2A', '7B')), null);
assert([S('1A'), S('2A'), S('2A', '7A')].every(holdsSeat) && ![S('1B'), S('6A'), S('2A', '7B'), S('2A', '8B'), S('2A', '3A')].some(holdsSeat));
// --- who sees which buttons
assert.deepEqual(availableActions('DISTRICT', S('1A')).map(a => a.key).sort(), ['JOINED_HM', 'NOT_JOINED', 'NOT_WILLING', 'WILLING']);
// Joined / Not joined from Pending (1A), by the DMS user alone
assert.equal(run('DISTRICT', S('1A'), 'JOINED_HM').code, '3A'); assert.equal(run('DISTRICT', S('1A'), 'NOT_JOINED').code, '7A');
fails(() => run('SUPER_ADMIN', S('1A'), 'JOINED_HM'), 403); fails(() => run('REGION', S('2A'), 'NOT_JOINED'), 403); fails(() => run('DISTRICT', S('1B'), 'JOINED_HM'), 409);
assert.deepEqual(availableActions('REGION', S('1A')), []);
assert.deepEqual(availableActions('STATE', S('2A', '8A', 'TC-SRC')).map(a => a.key), ['TC_STATE_APPROVE']);
assert.equal(groupOf(S('6A')), 'notwilling');

// --- Sections 3 and 5: generating lists
const seat = (community, status = 'VACANT', extra = {}) => ({ newDistrict: 'ERODE', newUdiseCode: 'U1', newSchoolName: 'DMS ERODE', gender: 'Boy', medium: 'Tamil', community, vacancyStatus: status, classLevel: 9, ...extra });
let n = 0;
const stu = (o = {}) => ({ id: ++n, district: 'ERODE', gender: 'Boy', medium: 'Tamil', community: 'BC', disabilityStatus: false, orank: n, emis: 1000 + n, ...o });
const names = r => r.assignments.map(a => a.id).sort((x, y) => x - y);

let students = [stu(), stu(), stu({ community: 'SC' }), stu({ disabilityStatus: true, community: 'ST' }), stu({ gender: 'Girl' }), stu({ district: 'SALEM' })];
let seats = [seat('GT-PWD'), seat('GT'), seat('BC'), seat('SC')];
let plan = planList(students, seats, 9);
assert.deepEqual(names(plan), [1, 3, 4, 2].sort((a, b) => a - b), 'PWD seat -> the disabled student, GT -> best rank, then BC and SC by community');
assert.equal(plan.cells.find(c => c.community === 'GT-PWD').chosen, 1);
assert(!names(plan).includes(5) && !names(plan).includes(6), 'other gender / other district are never listed');
// 1st list is applied: 1A students hold seats, so a second run lists nobody new
const listed = new Map(plan.assignments.map(a => [a.id, a.cell]));
students = students.map(s => listed.has(s.id) ? { ...s, selectStatus: '1A', selectedCategory: listed.get(s.id).community, newDistcName: 'ERODE', newUdiseCode: 'U1' } : s);
assert.equal(planList(students, seats, 9).assignments.length, 0, 'balance is zero while the first list is pending');
// V connector: a student who is Not Willing (6A) frees the place; 6A is never listed again, the next best student gets it
const more = [...students, stu({ community: 'BC' }), stu({ community: 'BC' })];
const bcStudent = more.find(s => s.selectedCategory === 'BC');
const after6A = more.map(s => s.id === bcStudent.id ? { ...s, selectStatus: '6A' } : s);
plan = planList(after6A, seats, 9);
assert.deepEqual(names(plan), [more[6].id], 'the freed BC seat goes to the next eligible BC student');
assert(!names(plan).includes(bcStudent.id));
// W connector: a reconsidered student (1B) competes again in the next list
const after1B = after6A.map(s => s.id === bcStudent.id ? { ...s, selectStatus: '1B' } : s);
plan = planList(after1B, seats, 9);
assert.deepEqual(names(plan), [bcStudent.id], '1B is considered again, and being better ranked he gets the seat');
assert.equal(plan.assignments[0].relisted, true);
// 7B and 8B free seats (JOINED row released) and the students are not listed again
assert.equal(planList(after6A.map(s => s.id === bcStudent.id ? { ...s, selectStatus: '7B' } : s), seats, 9).assignments.length, 1);
// a JOINED seat is not open
assert.equal(planList(students.slice(0, 2), [seat('GT', 'JOINED')], 9).assignments.length, 0);
// shortfall is reported when there are not enough students
assert.equal(planList([stu()], [seat('GT'), seat('GT')], 9).totals.shortfall, 1);

// --- ranks
const ranks = computeRanks([{ id: 1, total: 400, nmss: 0, emis: 5 }, { id: 2, total: 380, nmss: 30, emis: 4 }, { id: 3, total: 410, emis: 3 }]);
// scores are 400, 410 and 410; students 2 and 3 tie, so the higher total (3) comes first
assert.deepEqual([ranks.get(3), ranks.get(2), ranks.get(1)], [1, 2, 3], 'score decides; ties are broken by total, then NMMS, then EMIS');
console.log('Workflow rules OK');

// ---- import sheets: 9th/10th only; select_status = code, admit_status = its description
{
  const { mapStudentRow } = await import('./importMap.js'), { STATUS } = await import('./statuses.js');
  const base = { district: 'Madurai', Emis: 123456, Name: 'A B', Gender: 'Girl', community: 'bc', medium: 'tamil' };
  const ok = mapStudentRow({ ...base, select_status: '3a', admit_status: 'anything typed' }, 9).value;
  assert.equal(ok.selectStatus, '3A'); assert.equal(ok.admitStatus, 'Joined by HM', 'admit_status is always the description of select_status');
  for (const [code, d] of Object.entries(STATUS)) { const v = mapStudentRow({ ...base, select_status: code }, 10).value; assert.equal(v.selectStatus, code); assert.equal(v.admitStatus, d.label); }
  const none = mapStudentRow(base, 9).value; assert.equal(none.selectStatus, null); assert.equal(none.admitStatus, null);
  assert.ok(mapStudentRow({ ...base, select_status: '9Z' }, 9).error, 'unknown status code is rejected');
  assert.ok(!('mark3' in ok) && !('regno' in ok), 'no class 11 columns');
  const sc = await import('../common/studentStore.js');
  assert.deepEqual(sc.CLASSES, [9, 10]); assert.throws(() => sc.parseClass(11)); assert.throws(() => sc.studentTable(11));
  console.log('Import sheets OK');
}
