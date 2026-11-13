// Every arrow of the flowchart that a person performs on a student, as data. Nothing else may change a student's status.
// (The two arrows done by the SE Team for many students at once - "Generate student list" -> 1A - are in allocation.js.)
//
//   from(state)  - which students the action applies to          roles - who may do it
//   to           - the new status code (select_status) / tag2    needsRemarks - a note is required
import { HttpError } from '../common/http.js';

const DMS = ['DISTRICT', 'SUPER_ADMIN'], DMS_ONLY = ['DISTRICT'], RC = ['REGION', 'SUPER_ADMIN'], SRC = ['STATE', 'SUPER_ADMIN'];

export const ACTIONS = {
  // Section 4 - Admission at DMS
  WILLING:     { label: 'Willing - Selected (2A)', roles: DMS, from: s => s.code === '1A', to: { code: '2A' } },
  NOT_WILLING: { label: 'Not Willing (6A)', roles: DMS, from: s => s.code === '1A', to: { code: '6A' }, needsRemarks: true },
  RECONSIDER:  { label: 'Request reconsideration - Waiting (1B)', roles: DMS, from: s => s.code === '6A', to: { code: '1B' }, needsRemarks: true },
  // Section 6 - Joining, Non-Joining & TC
  // Joined / Not joined: only the DMS user marks these, straight from the Pending list (1A) or the Selected list (2A).
  JOINED_HM:   { label: 'Relieved and joined DMS - Joined by HM (3A)', roles: DMS_ONLY, from: s => ['1A', '2A'].includes(s.code), to: { code: '3A' } },
  NOT_JOINED:  { label: 'Not joined - Pending Approval (7A)', roles: DMS_ONLY, from: s => ['1A', '2A'].includes(s.code), to: { code: '7A' }, needsRemarks: true },
  RC_READMIT:  { label: 'Re-admit student - Joined by RC (3B)', roles: RC, from: s => s.code === '7A', to: { code: '3B' }, needsRemarks: true },
  RC_APPROVE_NOT_JOINED: { label: 'Approve "Not Joined" (7B)', roles: RC, from: s => s.code === '7A', to: { code: '7B' }, needsRemarks: true },
  TC_REQUEST:  { label: 'Request TC - TC-Waiting (8A)', roles: DMS, from: s => ['3A', '3B'].includes(s.code), to: { code: '8A', tag2: 'TC-RC' }, needsRemarks: true },
  TC_RC_APPROVE: { label: 'RC: approve TC request', roles: RC, from: s => s.code === '8A' && s.tag2 === 'TC-RC', to: { tag2: 'TC-SRC' } },
  TC_STATE_APPROVE: { label: 'State Regional Coordinator: approve TC - TC Issued (8B)', roles: SRC, from: s => s.code === '8A' && s.tag2 === 'TC-SRC', to: { code: '8B', tag2: 'TC-DONE' } },
};

/** The actions this role may take on a student in this state (used by the screens to show buttons). */
export const availableActions = (role, state) => Object.entries(ACTIONS).filter(([, a]) => a.roles.includes(role) && a.from(state)).map(([key, a]) => ({ key, label: a.label, needsRemarks: !!a.needsRemarks }));

/** Validates one action and returns the patch of status columns, or throws. */
export function planAction(role, state, key, remarks) {
  const a = ACTIONS[key];
  if (!a) throw new HttpError('Unknown action');
  if (!a.roles.includes(role)) throw new HttpError('Your role cannot do this step of the admission process', 403);
  if (!a.from(state)) throw new HttpError(`This step is not possible now: the student is at ${state.code || 'no status'}`, 409);
  const note = String(remarks || '').trim();
  if (a.needsRemarks && !note) throw new HttpError('Remarks are required for this step');
  const after = { code: state.code, tag2: state.tag2, ...a.to };
  return { after, tag1: key, remark1: note || null };
}

/** The statuses a super admin may force when correcting a mistake. Any pair of known codes is accepted. */
export const VALID_CODES = ['', '1A', '1B', '2A', '6A', '3A', '3B', '7A', '7B', '8A', '8B'];
