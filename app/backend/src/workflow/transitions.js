import { HttpError } from '../common/http.js';
import { STATUS } from './statuses.js';

const DMS = ['DISTRICT'], DMS_ONLY = DMS, RC = ['REGION', 'SUPER_ADMIN'], SRC = ['STATE', 'SUPER_ADMIN'], SE = ['SUPER_ADMIN'];
// Every step of the TC approval is done only by the role that owns it: the super admin cannot approve in the RC or SC step, and the RC / SC cannot approve in the admin step.
const TC_RC = ['REGION'], TC_SC = ['STATE'], TC_ADMIN = ['SUPER_ADMIN'];

const TWO_LETTERS = ['HM', 'STUDENT'];
// A TC request carries three files: the student unwilling letter, the HM letter and the reason letter.
export const TC_LETTERS = ['STUDENT', 'HM', 'REASON'];

export const ACTIONS = {

  WILLING:     { label: 'Selected', roles: DMS, from: s => s.code === '1A', to: { code: '2A' } },
  NOT_WILLING: { label: 'Not Willing', roles: DMS, from: s => s.code === '1A', to: { code: '6A' }, needsRemarks: true, letters: TWO_LETTERS },
  // Requesting a reconsideration empties the select status (null): the student shows on no screen and is picked again by the next list. There is no "Waiting (reconsidered)" status and no approval step.
  RECONSIDER:  { label: 'Request reconsideration', roles: DMS, from: s => s.code === '6A', to: { code: '' }, needsRemarks: true },

  JOINED_HM:   { label: 'Joined', roles: DMS_ONLY, from: s => s.code === '2A', to: { code: '3A' } },
  NOT_JOINED:  { label: 'Not Joined', roles: DMS_ONLY, from: s => s.code === '2A', to: { code: '7A' }, needsRemarks: true, letters: TWO_LETTERS },
  RC_READMIT:  { label: 'Re-admit student', roles: RC, from: s => s.code === '7A', to: { code: '3B' }, needsRemarks: true },
  RC_APPROVE_NOT_JOINED: { label: 'Approve Not Joined', roles: RC, from: s => s.code === '7A', to: { code: '7B' }, needsRemarks: true },
  RC_REJECT_NOT_JOINED: { label: 'Reject Not Joined', roles: RC, from: s => s.code === '7A', to: { code: '2A' }, needsRemarks: true },

  // TC process: 8A requested by the HM -> 8B approved by the RC -> 8C approved by the SC -> 8D approved by the super admin (TC issued).
  // A rejection at any step moves the student to 8Z and back to the HM, who resubmits (8A again) and the same RC -> SC -> admin steps run once more.
  TC_REQUEST:  { label: 'Request TC', roles: DMS, from: s => ['3A', '3B'].includes(s.code), to: { code: '8A', tag2: 'TC-RC' }, needsRemarks: true, letters: TC_LETTERS, letterStage: 'TC_REQUEST' },
  TC_RESUBMIT: { label: 'Resubmit TC request', roles: DMS, from: s => s.code === '8Z', to: { code: '8A', tag2: 'TC-RC' }, needsRemarks: true, letters: TC_LETTERS, letterStage: 'TC_REQUEST', keepLetters: true },
  TC_WITHDRAW: { label: 'Withdraw TC request', roles: DMS, from: s => s.code === '8Z', to: s => ({ code: s.prev || '3A', tag2: '' }), needsRemarks: true },

  TC_RC_APPROVE: { label: 'Approve (RC)', roles: TC_RC, from: s => s.code === '8A', to: { code: '8B', tag2: 'TC-SC' } },
  TC_RC_REJECT: { label: 'Reject (RC)', roles: TC_RC, from: s => s.code === '8A', to: { code: '8Z', tag2: 'TC-REJ-RC' }, needsRemarks: true },
  TC_RC_NOTE: { label: 'Save remark', roles: TC_RC, from: s => s.code === '8A', to: {}, needsRemarks: true, note: true },

  TC_SC_APPROVE: { label: 'Approve (SC)', roles: TC_SC, from: s => s.code === '8B', to: { code: '8C', tag2: 'TC-ADMIN' } },
  TC_SC_REJECT: { label: 'Reject (SC)', roles: TC_SC, from: s => s.code === '8B', to: { code: '8Z', tag2: 'TC-REJ-SC' }, needsRemarks: true },
  TC_SC_NOTE: { label: 'Save remark', roles: TC_SC, from: s => s.code === '8B', to: {}, needsRemarks: true, note: true },

  TC_ADMIN_APPROVE: { label: 'Approve and issue TC', roles: TC_ADMIN, from: s => s.code === '8C', to: { code: '8D', tag2: 'TC-DONE' } },
  TC_ADMIN_REJECT: { label: 'Reject (Admin)', roles: TC_ADMIN, from: s => s.code === '8C', to: { code: '8Z', tag2: 'TC-REJ-ADMIN' }, needsRemarks: true },
  TC_ADMIN_NOTE: { label: 'Save remark', roles: TC_ADMIN, from: s => s.code === '8C', to: {}, needsRemarks: true, note: true },
};

export const availableActions = (role, state) => Object.entries(ACTIONS).filter(([, a]) => a.roles.includes(role) && a.from(state)).map(([key, a]) => ({ key, label: a.label, needsRemarks: !!a.needsRemarks, needsLetter: !!a.letters, letters: a.letters || [], keepLetters: !!a.keepLetters, note: !!a.note }));

export function planAction(role, state, key, remarks) {
  const a = ACTIONS[key];
  if (!a) throw new HttpError('Unknown action');
  if (!a.roles.includes(role)) throw new HttpError('Your role cannot do this step of the admission process', 403);
  if (!a.from(state)) throw new HttpError(`This step is not possible now: the student is at "${(STATUS[state.code]?.label) || 'Not listed'}"`, 409);
  const note = String(remarks || '').trim();
  if (a.needsRemarks && !note) throw new HttpError('Remarks are required for this step');
  const after = { code: state.code, tag2: state.tag2, ...(typeof a.to === 'function' ? a.to(state) : a.to) };
  return { after, tag1: key, remark1: note || null, needsLetter: !!a.letters, letters: a.letters || [], letterStage: a.letterStage || key, keepLetters: !!a.keepLetters };
}

// Correction (super admin) offers only the statuses the student can move to next, never the whole list.
export const nextCodes = state => {
  const next = Object.values(ACTIONS).filter(a => a.from(state)).map(a => (typeof a.to === 'function' ? a.to(state) : a.to).code).filter(Boolean);
  return [...new Set(next)].filter(c => c !== state.code);
};

// The screen sends the status it was showing. If someone else (another login, another tab) changed the student since, nothing is applied.
export function assertFresh(expect, state) {
  if (!expect || typeof expect !== 'object') return;
  if (String(expect.code ?? '') !== String(state.code ?? '') || String(expect.tag2 ?? '') !== String(state.tag2 ?? ''))
    throw new HttpError(`This student was just changed by someone else and is now at \"${STATUS[state.code]?.label || 'Not listed'}\". Nothing was applied; the screen has been refreshed.`, 409, { stale: true });
}

export const VALID_CODES = ['', '1A', '2A', '6A', '3A', '3B', '7A', '7B', '8A', '8B', '8C', '8D', '8Z'];
