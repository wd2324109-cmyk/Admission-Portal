import assert from 'node:assert';
import { planAction, availableActions, nextCodes, assertFresh } from './transitions.js';
import { stateOf, seatEffect, holdsSeat, groupOf } from './statuses.js';
import { planList } from './allocation.js';
import { computeRanks, rankRemaining } from './rank.js';
import { requiredFor, summarize, planSubmit, planReview } from './documents.js';

const S = (a = '', b = '', tag2 = '') => ({ code: b || a, tag2 });
const run = (role, state, key, remarks = 'ok') => planAction(role, state, key, remarks).after;
const fails = (fn, status) => { try { fn(); } catch (e) { assert.equal(e.status, status ?? e.status); return; } assert.fail('expected an error'); };

assert.deepEqual(run('DISTRICT', S('1A'), 'WILLING'), S('2A'));
assert.equal(run('DISTRICT', S('1A'), 'NOT_WILLING').code, '6A');
assert.equal(run('DISTRICT', S('6A'), 'RECONSIDER').code, '1B');
fails(() => run('DISTRICT', S('6A'), 'WILLING'), 409);
fails(() => run('DISTRICT', S('1B'), 'WILLING'), 409);
fails(() => planAction('DISTRICT', S('1A'), 'NOT_WILLING', ''), 400);

assert.equal(run('DISTRICT', S('2A'), 'JOINED_HM').code, '3A');
assert.equal(run('DISTRICT', S('2A'), 'NOT_JOINED').code, '7A');
assert.equal(run('REGION', S('2A', '7A'), 'RC_READMIT').code, '3B');
assert.equal(run('REGION', S('2A', '7A'), 'RC_APPROVE_NOT_JOINED').code, '7B');
fails(() => run('DISTRICT', S('2A', '7A'), 'RC_READMIT'), 403);
fails(() => run('REGION', S('2A'), 'RC_READMIT'), 409);

let st = run('DISTRICT', S('2A', '3A'), 'TC_REQUEST'); assert.deepEqual([st.code, st.tag2], ['8A', 'TC-RC']);
fails(() => run('STATE', st, 'TC_STATE_APPROVE'), 409);
st = run('REGION', st, 'TC_RC_APPROVE'); assert.equal(st.tag2, 'TC-SRC');
fails(() => run('REGION', st, 'TC_RC_APPROVE'), 409);
st = run('STATE', st, 'TC_STATE_APPROVE'); assert.deepEqual([st.code, st.tag2], ['8B', 'TC-DONE']);
fails(() => run('DISTRICT', S('2A', '3B'), 'JOINED_HM'), 409);

assert.equal(seatEffect(S('2A'), S('2A', '3A')), 'JOIN');
assert.equal(seatEffect(S('2A', '7A'), S('2A', '3B')), 'JOIN');
assert.equal(seatEffect(S('2A', '3A'), S('2A', '8A')), null);
assert.equal(seatEffect(S('2A', '8A'), S('2A', '8B')), 'RELEASE');
assert.equal(seatEffect(S('2A'), S('2A', '7B')), null);
assert([S('1A'), S('2A'), S('2A', '7A')].every(holdsSeat) && ![S('1B'), S('6A'), S('2A', '7B'), S('2A', '8B'), S('2A', '3A')].some(holdsSeat));

assert.deepEqual(availableActions('DISTRICT', S('1A')).map(a => a.key).sort(), ['NOT_WILLING', 'WILLING']);
assert.deepEqual(availableActions('DISTRICT', S('2A')).map(a => a.key).sort(), ['JOINED_HM', 'NOT_JOINED']);

fails(() => run('DISTRICT', S('1A'), 'JOINED_HM'), 409); fails(() => run('DISTRICT', S('1A'), 'NOT_JOINED', 'x'), 409);
fails(() => run('SUPER_ADMIN', S('2A'), 'JOINED_HM'), 403); fails(() => run('SUPER_ADMIN', S('1A'), 'WILLING'), 403); fails(() => run('SUPER_ADMIN', S('1A'), 'NOT_WILLING', 'x'), 403); fails(() => run('SUPER_ADMIN', S('6A'), 'RECONSIDER', 'x'), 403); fails(() => run('SUPER_ADMIN', S('3A'), 'TC_REQUEST', 'x'), 403); fails(() => run('REGION', S('2A'), 'NOT_JOINED'), 403); fails(() => run('DISTRICT', S('1B'), 'JOINED_HM'), 409);
assert.deepEqual(availableActions('REGION', S('1A')), []);
assert.deepEqual(availableActions('STATE', S('2A', '8A', 'TC-SRC')).map(a => a.key).sort(), ['TC_STATE_APPROVE', 'TC_STATE_REJECT']);
assert.equal(groupOf(S('6A')), 'notwilling');
// Reconsideration: the super admin decides with Selected / Not Selected only
assert.deepEqual(availableActions('SUPER_ADMIN', S('1B')).map(a => a.label).sort(), ['Approve', 'Not Selected']);
assert.equal(run('SUPER_ADMIN', S('1B'), 'RECONSIDER_SELECT').code, '', 'approved reconsideration clears the select status');
assert.equal(run('SUPER_ADMIN', S('1B'), 'RECONSIDER_REJECT').code, '6A');
fails(() => run('DISTRICT', S('1B'), 'RECONSIDER_SELECT'), 403); fails(() => run('SUPER_ADMIN', S('1A'), 'RECONSIDER_SELECT'), 409); fails(() => planAction('SUPER_ADMIN', S('1B'), 'RECONSIDER_REJECT', ''), 400);
assert.deepEqual(availableActions('SUPER_ADMIN', S('1A')), []);

// Correction offers the next status only
assert.deepEqual(nextCodes(S('1A')).sort(), ['2A', '6A']);
assert.deepEqual(nextCodes(S('1B')).sort(), ['6A']);
assert.deepEqual(nextCodes(S('6A')), ['1B']);
assert.deepEqual(nextCodes(S('2A')).sort(), ['3A', '7A']);
assert.deepEqual(nextCodes(S('2A', '3A')), ['8A']);
assert.deepEqual(nextCodes(S('2A', '7A')).sort(), ['2A', '3B', '7B']);
assert.deepEqual(nextCodes({ code: '8A', tag2: 'TC-RC', prev: '3B' }).sort(), ['3B', '8B']);
assert.deepEqual(nextCodes(S('2A', '8B', 'TC-DONE')), []);
assert.deepEqual(nextCodes(S('')), []);
// Ranks of a later batch start after the last listed student's rank
{ const rows = [{ id: 1, selectStatus: '2A', orank: 1, total: 500 }, { id: 2, selectStatus: '6A', orank: 2, total: 480 }, { id: 3, selectStatus: '1A', orank: 3, total: 470 },
    { id: 4, selectStatus: '', orank: 4, total: 300 }, { id: 5, selectStatus: '', orank: null, total: 420 }, { id: 6, selectStatus: '', orank: null, total: 440 }];
  assert.deepEqual(rankRemaining(rows).sort((a, b) => a[0] - b[0]), [[4, 6], [5, 5], [6, 4]], 'unlisted students are ranked by score from the rank after the last listed student (3)'); }

// Stale screens: a second login / double click must not apply a later step by mistake
assertFresh({ code: '1A', tag2: '' }, S('1A')); assertFresh(undefined, S('2A'));
fails(() => assertFresh({ code: '1A', tag2: '' }, S('2A')), 409);
fails(() => assertFresh({ code: '8A', tag2: 'TC-RC' }, S('2A', '8A', 'TC-SRC')), 409);


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

const listed = new Map(plan.assignments.map(a => [a.id, a.cell]));
students = students.map(s => listed.has(s.id) ? { ...s, selectStatus: '1A', selectedCategory: listed.get(s.id).community, newDistcName: 'ERODE', newUdiseCode: 'U1' } : s);
assert.equal(planList(students, seats, 9).assignments.length, 0, 'balance is zero while the first list is pending');

const more = [...students, stu({ community: 'BC' }), stu({ community: 'BC' })];
const bcStudent = more.find(s => s.selectedCategory === 'BC');
const after6A = more.map(s => s.id === bcStudent.id ? { ...s, selectStatus: '6A' } : s);
plan = planList(after6A, seats, 9);
assert.deepEqual(names(plan), [more[6].id], 'the freed BC seat goes to the next eligible BC student');
assert(!names(plan).includes(bcStudent.id));

const after1B = after6A.map(s => s.id === bcStudent.id ? { ...s, selectStatus: '1B' } : s);
plan = planList(after1B, seats, 9);
assert.deepEqual(names(plan), [bcStudent.id], '1B is considered again, and being better ranked he gets the seat');
assert.equal(plan.assignments[0].relisted, true);

assert.equal(planList(after6A.map(s => s.id === bcStudent.id ? { ...s, selectStatus: '7B' } : s), seats, 9).assignments.length, 1);

assert.equal(planList(students.slice(0, 2), [seat('GT', 'JOINED')], 9).assignments.length, 0);

assert.equal(planList([stu()], [seat('GT'), seat('GT')], 9).totals.shortfall, 1);

const ranks = computeRanks([{ id: 1, total: 400, nmss: 0, emis: 5 }, { id: 2, total: 380, nmss: 30, emis: 4 }, { id: 3, total: 410, emis: 3 }]);

assert.deepEqual([ranks.get(3), ranks.get(2), ranks.get(1)], [1, 2, 3], 'score decides; ties are broken by total, then NMMS, then EMIS');
console.log('Workflow rules OK');

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

assert.equal(planAction('DISTRICT', S('1A'), 'NOT_WILLING', 'x').needsLetter, true);
assert.equal(planAction('DISTRICT', S('1A'), 'WILLING').needsLetter, false);
assert.equal(planAction('DISTRICT', S('2A'), 'NOT_JOINED', 'x').needsLetter, true);
assert.equal(planAction('DISTRICT', S('2A'), 'JOINED_HM').needsLetter, false);
assert.deepEqual(availableActions('REGION', S('2A', '7A')).map(a => a.key).sort(), ['RC_APPROVE_NOT_JOINED', 'RC_READMIT', 'RC_REJECT_NOT_JOINED']);
assert.equal(groupOf(S('2A', '7A')), 'notjoined'); assert.equal(groupOf(S('2A', '7B')), 'notjoined');
assert.equal(run('REGION', S('2A', '7A'), 'RC_REJECT_NOT_JOINED').code, '2A');
fails(() => run('DISTRICT', S('2A', '7A'), 'RC_REJECT_NOT_JOINED'), 403); fails(() => planAction('REGION', S('2A', '7A'), 'RC_REJECT_NOT_JOINED', ''), 400);
st = { ...S('2A', '8A', 'TC-RC'), prev: '3B' };
assert.deepEqual(availableActions('REGION', st).map(a => a.key).sort(), ['TC_RC_APPROVE', 'TC_RC_REJECT']);
assert.deepEqual([run('REGION', st, 'TC_RC_REJECT').code, run('REGION', st, 'TC_RC_REJECT').tag2], ['3B', '']);
assert.equal(run('REGION', S('2A', '8A', 'TC-RC'), 'TC_RC_REJECT').code, '3A');
fails(() => run('DISTRICT', st, 'TC_RC_REJECT'), 403); fails(() => planAction('REGION', st, 'TC_RC_REJECT', ''), 400);
assert.equal(run('STATE', { ...S('2A', '8A', 'TC-SRC'), prev: '3A' }, 'TC_STATE_REJECT').code, '3A');
fails(() => run('STATE', st, 'TC_STATE_REJECT'), 409);
console.log('Reject / letter rules OK');

{
  const { STATUS, GROUPS, GROUP_SQL } = await import('./statuses.js');
  assert.equal(STATUS['7A'].label, 'Not Joined - Pending'); assert.equal(STATUS['7B'].label, 'Not Joined - Approved');
  assert(!('notjoinedpending' in GROUPS) && !('notjoinedpending' in GROUP_SQL), 'there is no separate Not Joined - Pending group');
  assert.equal(GROUP_SQL.notjoined, `select_status in ('7A','7B')`);
  console.log('Not Joined group OK');
}

assert.deepEqual(availableActions('DISTRICT', S('2A', '3A')).map(a => a.key), ['TC_REQUEST']);
assert.deepEqual(availableActions('DISTRICT', S('2A', '3B')).map(a => a.key), ['TC_REQUEST']);
assert.deepEqual(availableActions('REGION', S('2A', '3A')).map(a => a.key), []);
assert.deepEqual(availableActions('SUPER_ADMIN', S('2A', '3A')).map(a => a.key), []);

assert.equal(planAction('DISTRICT', S('2A', '3A'), 'TC_REQUEST', 'reason').needsLetter, true);
assert.deepEqual(planAction('DISTRICT', S('2A', '3A'), 'TC_REQUEST', 'reason').letters, ['TC']);
assert.deepEqual(availableActions('DISTRICT', S('2A', '3A'))[0].letters, ['TC']);
assert.deepEqual(planAction('DISTRICT', S('2A'), 'NOT_JOINED', 'x').letters, ['HM', 'STUDENT']);
assert.equal(planAction('REGION', S('2A', '8A', 'TC-RC'), 'TC_RC_APPROVE').needsLetter, false, 'only the DMS request carries a letter');
{
  const { STAGE_KINDS, KINDS } = await import('../common/letters.js');
  assert.deepEqual(STAGE_KINDS.TC_REQUEST, ['TC']); assert.equal(KINDS.TC, 'TC request letter');
  for (const [key, a] of Object.entries((await import('./transitions.js')).ACTIONS)) for (const k of a.letters || []) assert(KINDS[k], `${key}: unknown letter kind ${k}`);
}
console.log('TC request rules OK');

{
  const pwd = { disabilityStatus: true }, plain = { disabilityStatus: false };
  assert.deepEqual(requiredFor(plain), ['WILLING', 'TC', 'COMMUNITY']);
  assert.deepEqual(requiredFor(pwd), ['WILLING', 'TC', 'COMMUNITY', 'PWD'], 'the PWD letter is mandatory for a PWD student only');
  const d = (status) => ({ status });
  assert.equal(summarize({}, requiredFor(plain)).state, 'NOT_SUBMITTED');
  assert.equal(summarize({ WILLING: d('PENDING') }, requiredFor(plain)).state, 'PENDING');
  assert.equal(summarize({ WILLING: d('VERIFIED'), TC: d('VERIFIED') }, requiredFor(plain)).state, 'INCOMPLETE');
  assert.equal(summarize({ WILLING: d('VERIFIED'), TC: d('REJECTED') }, requiredFor(plain)).state, 'REJECTED');
  const all = { WILLING: d('VERIFIED'), TC: d('VERIFIED'), COMMUNITY: d('VERIFIED') };
  assert.equal(summarize(all, requiredFor(plain)).state, 'VERIFIED');
  assert.equal(summarize(all, requiredFor(pwd)).state, 'INCOMPLETE', 'a PWD student is not done without the PWD letter');

  const sub = (o = {}) => planSubmit({ code: '3A', student: plain, type: 'TC', doc: undefined, ...o });
  assert.equal(sub().resubmission, false);
  assert.equal(sub({ doc: d('PENDING') }).resubmission, true); assert.equal(sub({ doc: d('REJECTED') }).resubmission, true);
  fails(() => sub({ doc: d('VERIFIED') }), 409);
  fails(() => sub({ code: '2A' }), 409); fails(() => sub({ code: '8A' }), 409);
  fails(() => sub({ type: 'PWD' }), 400); assert.equal(sub({ type: 'PWD', student: pwd }).resubmission, false);
  fails(() => sub({ type: 'AADHAAR' }), 400);

  assert.equal(planReview({ doc: d('PENDING'), decision: 'VERIFIED', remarks: '' }).note, null);
  assert.equal(planReview({ doc: d('PENDING'), decision: 'REJECTED', remarks: ' blurry ' }).note, 'blurry');
  fails(() => planReview({ doc: d('PENDING'), decision: 'REJECTED', remarks: '' }), 400);
  fails(() => planReview({ doc: d('VERIFIED'), decision: 'REJECTED', remarks: 'x' }), 409);
  fails(() => planReview({ doc: d('REJECTED'), decision: 'VERIFIED' }), 409);
  fails(() => planReview({ doc: undefined, decision: 'VERIFIED' }), 404); fails(() => planReview({ doc: d('PENDING'), decision: 'MAYBE' }), 400);
  console.log('Document rules OK');
}
