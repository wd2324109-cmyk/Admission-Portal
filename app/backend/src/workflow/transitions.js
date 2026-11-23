import { HttpError } from '../common/http.js';
import { STATUS } from './statuses.js';

const DMS = ['DISTRICT'], DMS_ONLY = DMS, RC = ['REGION', 'SUPER_ADMIN'], SRC = ['STATE', 'SUPER_ADMIN'], SE = ['SUPER_ADMIN'];

const TWO_LETTERS = ['HM', 'STUDENT'], TC_LETTER = ['TC'];

export const ACTIONS = {

  WILLING:     { label: 'Selected', roles: DMS, from: s => s.code === '1A', to: { code: '2A' } },
  NOT_WILLING: { label: 'Not Willing', roles: DMS, from: s => s.code === '1A', to: { code: '6A' }, needsRemarks: true, letters: TWO_LETTERS },
  RECONSIDER:  { label: 'Request reconsideration', roles: DMS, from: s => s.code === '6A', to: { code: '1B' }, needsRemarks: true },
  RECONSIDER_SELECT: { label: 'Selected', roles: SE, from: s => s.code === '1B', to: { code: '2A' }, needsRemarks: true },
  RECONSIDER_REJECT: { label: 'Not Selected', roles: SE, from: s => s.code === '1B', to: { code: '6A' }, needsRemarks: true },

  JOINED_HM:   { label: 'Joined', roles: DMS_ONLY, from: s => s.code === '2A', to: { code: '3A' } },
  NOT_JOINED:  { label: 'Not Joined', roles: DMS_ONLY, from: s => s.code === '2A', to: { code: '7A' }, needsRemarks: true, letters: TWO_LETTERS },
  RC_READMIT:  { label: 'Re-admit student', roles: RC, from: s => s.code === '7A', to: { code: '3B' }, needsRemarks: true },
  RC_APPROVE_NOT_JOINED: { label: 'Approve Not Joined', roles: RC, from: s => s.code === '7A', to: { code: '7B' }, needsRemarks: true },
  RC_REJECT_NOT_JOINED: { label: 'Reject Not Joined', roles: RC, from: s => s.code === '7A', to: { code: '2A' }, needsRemarks: true },
  TC_REQUEST:  { label: 'Request TC', roles: DMS, from: s => ['3A', '3B'].includes(s.code), to: { code: '8A', tag2: 'TC-RC' }, needsRemarks: true, letters: TC_LETTER },
  TC_RC_APPROVE: { label: 'Approve TC request', roles: RC, from: s => s.code === '8A' && s.tag2 === 'TC-RC', to: { tag2: 'TC-SRC' } },
  TC_RC_REJECT: { label: 'Reject TC request', roles: RC, from: s => s.code === '8A' && s.tag2 === 'TC-RC', to: s => ({ code: s.prev || '3A', tag2: '' }), needsRemarks: true },
  TC_STATE_APPROVE: { label: 'Approve TC request', roles: SRC, from: s => s.code === '8A' && s.tag2 === 'TC-SRC', to: { code: '8B', tag2: 'TC-DONE' } },
  TC_STATE_REJECT: { label: 'Reject TC request', roles: SRC, from: s => s.code === '8A' && s.tag2 === 'TC-SRC', to: s => ({ code: s.prev || '3A', tag2: '' }), needsRemarks: true },
};

export const availableActions = (role, state) => Object.entries(ACTIONS).filter(([, a]) => a.roles.includes(role) && a.from(state)).map(([key, a]) => ({ key, label: a.label, needsRemarks: !!a.needsRemarks, needsLetter: !!a.letters, letters: a.letters || [] }));

export function planAction(role, state, key, remarks) {
  const a = ACTIONS[key];
  if (!a) throw new HttpError('Unknown action');
  if (!a.roles.includes(role)) throw new HttpError('Your role cannot do this step of the admission process', 403);
  if (!a.from(state)) throw new HttpError(`This step is not possible now: the student is at "${(STATUS[state.code]?.label) || 'Not listed'}"`, 409);
  const note = String(remarks || '').trim();
  if (a.needsRemarks && !note) throw new HttpError('Remarks are required for this step');
  const after = { code: state.code, tag2: state.tag2, ...(typeof a.to === 'function' ? a.to(state) : a.to) };
  return { after, tag1: key, remark1: note || null, needsLetter: !!a.letters, letters: a.letters || [] };
}

// Correction (super admin) offers only the statuses the student can move to next, never the whole list.
export const nextCodes = state => {
  const next = Object.values(ACTIONS).filter(a => a.from(state)).map(a => (typeof a.to === 'function' ? a.to(state) : a.to).code).filter(Boolean);
  if (state.code === '8A') next.push('8B');
  return [...new Set(next)];
};

// The screen sends the status it was showing. If someone else (another login, another tab) changed the student since, nothing is applied.
export function assertFresh(expect, state) {
  if (!expect || typeof expect !== 'object') return;
  if (String(expect.code ?? '') !== String(state.code ?? '') || String(expect.tag2 ?? '') !== String(state.tag2 ?? ''))
    throw new HttpError(`This student was just changed by someone else and is now at \"${STATUS[state.code]?.label || 'Not listed'}\". Nothing was applied; the screen has been refreshed.`, 409, { stale: true });
}

export const VALID_CODES = ['', '1A', '1B', '2A', '6A', '3A', '3B', '7A', '7B', '8A', '8B'];
