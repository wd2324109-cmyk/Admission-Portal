import assert from 'node:assert';
import { tcThread } from './tcRemarks.js';

const L = (tag1, remark1, by, n) => ({ tag1, remark1, updatedBy: by, updatedAt: new Date(2026, 0, n) });
const logs = [
  L('TC_REQUEST', 'wants to move', 'dms1', 1),
  L('TC_RC_NOTE', 'letters look fine', 'rc1', 2),
  L('TC_RC_APPROVE', 'letters look fine, approved', 'rc1', 3),
  L('TC_SC_REJECT', 'reason letter unclear', 'sc1', 4),
  L('TC_RESUBMIT', 'new reason letter attached', 'dms1', 5),
  L('TC_RC_NOTE', 'checking again', 'rc1', 6),
];
const t = tcThread(logs, 'REGION');
assert.equal(t.rounds.length, 2, 'a request and its resubmission are two rounds');
assert.deepEqual(t.rounds[0].entries.map(e => [e.stage, e.outcome]), [['HM', 'REQUESTED'], ['RC', 'APPROVED'], ['SC', 'REJECTED']]);
assert.equal(t.rounds[0].entries[1].text, 'letters look fine, approved', 'only the latest remark of a stage is shown');
assert.deepEqual(t.rounds[1].entries.map(e => [e.stage, e.outcome, e.text]), [['HM', 'RESUBMITTED', 'new reason letter attached'], ['RC', 'NOTE', 'checking again']]);
assert.equal(t.draft, 'checking again', 'the RC starts from his own latest remark');
assert.equal(tcThread(logs, 'STATE').draft, 'reason letter unclear', 'the SC sees his own remark from the earlier round, not the RC\'s');
assert.equal(tcThread(logs.slice(0, 1), 'REGION').draft, '', 'an approver who has not remarked has no draft');
assert.equal(tcThread(logs, 'DISTRICT').draft, 'new reason letter attached');

// approving with an empty box keeps the remark that was saved before
const kept = tcThread([L('TC_REQUEST', 'r', 'd', 1), L('TC_RC_NOTE', 'noted', 'rc', 2), L('TC_RC_APPROVE', '', 'rc', 3)], 'REGION');
assert.deepEqual([kept.rounds[0].entries[1].outcome, kept.rounds[0].entries[1].text], ['APPROVED', 'noted']);
// a saved remark after an approval must not undo the decision
assert.equal(tcThread([L('TC_REQUEST', 'r', 'd', 1), L('TC_RC_APPROVE', 'ok', 'rc', 2), L('TC_RC_NOTE', 'x', 'rc', 3)], 'REGION').rounds[0].entries[1].outcome, 'APPROVED');
assert.deepEqual(tcThread([], 'REGION'), { rounds: [], draft: '' });
console.log('TC remarks OK');
