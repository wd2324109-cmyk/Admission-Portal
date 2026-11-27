// The remarks of a TC request, in the order they were given. They are read from the student log (tag1 = the step, remark1 = the remark), so nothing extra is stored
// and every earlier remark stays on record, including the ones that were edited.
export const TC_STEPS = {
  TC_REQUEST: ['HM', 'REQUESTED'], TC_RESUBMIT: ['HM', 'RESUBMITTED'], TC_WITHDRAW: ['HM', 'WITHDRAWN'],
  TC_RC_APPROVE: ['RC', 'APPROVED'], TC_RC_REJECT: ['RC', 'REJECTED'], TC_RC_NOTE: ['RC', 'NOTE'],
  TC_SC_APPROVE: ['SC', 'APPROVED'], TC_SC_REJECT: ['SC', 'REJECTED'], TC_SC_NOTE: ['SC', 'NOTE'],
  TC_ADMIN_APPROVE: ['ADMIN', 'APPROVED'], TC_ADMIN_REJECT: ['ADMIN', 'REJECTED'], TC_ADMIN_NOTE: ['ADMIN', 'NOTE'],
  // Steps logged by the earlier two-step TC flow (RC, then the State Regional Coordinator): kept so the remarks of old requests still show.
  TC_STATE_APPROVE: ['SC', 'APPROVED'], TC_STATE_REJECT: ['SC', 'REJECTED'],
};
export const TC_STEP_KEYS = Object.keys(TC_STEPS);
export const TC_ROLES = { HM: 'HM (DMS)', RC: 'Regional Coordinator', SC: 'State Coordinator', ADMIN: 'Super Admin' };
const ORDER = ['HM', 'RC', 'SC', 'ADMIN'];
// The login that edits the remark of each step.
export const STAGE_OF_ROLE = { DISTRICT: 'HM', REGION: 'RC', STATE: 'SC', SUPER_ADMIN: 'ADMIN' };

// logs: student log rows of the student, oldest first. A round starts at every request / resubmission.
// Per round and per stage only the latest remark is shown; the outcome is the latest decision of that stage (a saved remark alone is "NOTE", not yet a decision).
export function tcThread(logs, role) {
  const rounds = [];
  for (const l of logs) {
    const step = TC_STEPS[l.tag1];
    if (!step) continue;
    const [stage, outcome] = step;
    if (outcome === 'REQUESTED' || outcome === 'RESUBMITTED' || !rounds.length) rounds.push({ n: rounds.length + 1, byStage: new Map() });
    const r = rounds[rounds.length - 1], prev = r.byStage.get(stage);
    const text = String(l.remark1 ?? '').trim() || prev?.text || '';
    r.byStage.set(stage, { stage, label: TC_ROLES[stage], by: l.updatedBy, at: l.updatedAt, outcome: outcome === 'NOTE' && prev && prev.outcome !== 'NOTE' ? prev.outcome : outcome, text });
  }
  const out = rounds.map(r => ({ n: r.n, entries: ORDER.filter(s => r.byStage.has(s)).map(s => r.byStage.get(s)) }));
  // What the signed-in approver can start from when it is his turn again: his latest remark, from this round or an earlier one.
  const mine = STAGE_OF_ROLE[role];
  let draft = '';
  for (let i = out.length - 1; i >= 0 && !draft; i--) draft = out[i].entries.find(e => e.stage === mine)?.text || '';
  return { rounds: out, draft };
}
