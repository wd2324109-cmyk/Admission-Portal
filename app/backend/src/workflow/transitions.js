// Every arrow of the flowchart that a person performs on a student, as data. Nothing else may change a student's status.
// (The two arrows done by the SE Team for many students at once - "Generate student list" -> 1A - are in allocation.js.)
//
//   from(state)  - which students the action applies to          roles - who may do it
//   to           - the new status code (select_status) / tag2    needsRemarks - a note is required
import { HttpError } from '../common/http.js';
import { STATUS } from './statuses.js';

const DMS = ['DISTRICT'], DMS_ONLY = DMS, RC = ['REGION', 'SUPER_ADMIN'], SRC = ['STATE', 'SUPER_ADMIN'];
// `letters` = the letter files that must be uploaded together with the step (keys of common/letters.js KINDS).
const TWO_LETTERS = ['HM', 'STUDENT'], TC_LETTER = ['TC'];

export const ACTIONS = {
  // Section 4 - Admission at DMS
  WILLING:     { label: 'Selected', roles: DMS, from: s => s.code === '1A', to: { code: '2A' } },
  NOT_WILLING: { label: 'Not Willing', roles: DMS, from: s => s.code === '1A', to: { code: '6A' }, needsRemarks: true, letters: TWO_LETTERS },
  RECONSIDER:  { label: 'Request reconsideration', roles: DMS, from: s => s.code === '6A', to: { code: '1B' }, needsRemarks: true },
  // Section 6 - Joining, Non-Joining & TC
  // Every status marking at the DMS (willing, not willing, reconsider, joined, not joined, TC request) is done by the DMS user only, not by the super admin.
  // Order of the DMS steps: Waiting (1A) -> Selected / Not Willing -> Joined / Not Joined. Joined / Not Joined are marked only on a Selected student (2A).
  JOINED_HM:   { label: 'Joined', roles: DMS_ONLY, from: s => s.code === '2A', to: { code: '3A' } },
  NOT_JOINED:  { label: 'Not Joined', roles: DMS_ONLY, from: s => s.code === '2A', to: { code: '7A' }, needsRemarks: true, letters: TWO_LETTERS },
  RC_READMIT:  { label: 'Re-admit student', roles: RC, from: s => s.code === '7A', to: { code: '3B' }, needsRemarks: true },
  RC_APPROVE_NOT_JOINED: { label: 'Approve Not Joined', roles: RC, from: s => s.code === '7A', to: { code: '7B' }, needsRemarks: true },
  RC_REJECT_NOT_JOINED: { label: 'Reject Not Joined', roles: RC, from: s => s.code === '7A', to: { code: '2A' }, needsRemarks: true },   // back to Selected: the DMS marks Joined / Not Joined again
  TC_REQUEST:  { label: 'Request TC', roles: DMS, from: s => ['3A', '3B'].includes(s.code), to: { code: '8A', tag2: 'TC-RC' }, needsRemarks: true, letters: TC_LETTER },   // the TC request letter is submitted with the request
  TC_RC_APPROVE: { label: 'Approve TC request', roles: RC, from: s => s.code === '8A' && s.tag2 === 'TC-RC', to: { tag2: 'TC-SRC' } },
  TC_RC_REJECT: { label: 'Reject TC request', roles: RC, from: s => s.code === '8A' && s.tag2 === 'TC-RC', to: s => ({ code: s.prev || '3A', tag2: '' }), needsRemarks: true },   // the student goes back to Joined
  TC_STATE_APPROVE: { label: 'Approve TC request', roles: SRC, from: s => s.code === '8A' && s.tag2 === 'TC-SRC', to: { code: '8B', tag2: 'TC-DONE' } },
  TC_STATE_REJECT: { label: 'Reject TC request', roles: SRC, from: s => s.code === '8A' && s.tag2 === 'TC-SRC', to: s => ({ code: s.prev || '3A', tag2: '' }), needsRemarks: true },
};

/** The actions this role may take on a student in this state (used by the screens to show buttons). */
export const availableActions = (role, state) => Object.entries(ACTIONS).filter(([, a]) => a.roles.includes(role) && a.from(state)).map(([key, a]) => ({ key, label: a.label, needsRemarks: !!a.needsRemarks, needsLetter: !!a.letters, letters: a.letters || [] }));

/** Validates one action and returns the patch of status columns, or throws. */
export function planAction(role, state, key, remarks) {
  const a = ACTIONS[key];
  if (!a) throw new HttpError('Unknown action');
  if (!a.roles.includes(role)) throw new HttpError('Your role cannot do this step of the admission process', 403);
  if (!a.from(state)) throw new HttpError(`This step is not possible now: the student is at "${(STATUS[state.code]?.label) || 'Not listed'}"`, 409);
  const note = String(remarks || '').trim();
  if (a.needsRemarks && !note) throw new HttpError('Remarks are required for this step');
  const after = { code: state.code, tag2: state.tag2, ...(typeof a.to === 'function' ? a.to(state) : a.to) };   // state.prev = the Joined code the student had before the TC request
  return { after, tag1: key, remark1: note || null, needsLetter: !!a.letters, letters: a.letters || [] };
}

/** The statuses a super admin may force when correcting a mistake. Any pair of known codes is accepted. */
export const VALID_CODES = ['', '1A', '1B', '2A', '6A', '3A', '3B', '7A', '7B', '8A', '8B'];
