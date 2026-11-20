// Domain vocabulary of the admission workflow (status codes, groups, roles). Presentation-only: the
// backend remains the source of truth for what each action does.

// The ten status codes of the selection flowchart.
export const CODE = {
  '1A': 'Waiting', '1B': 'Waiting (reconsidered)', '2A': 'Selected', '6A': 'Not Willing',
  '3A': 'Joined by HM', '3B': 'Joined by RC', '7A': 'Not Joined - Pending', '7B': 'Not Joined - Approved',
  '8A': 'TC-Waiting', '8B': 'TC Issued',
};
export const ALL_CODES = ['', '1A', '1B', '2A', '6A', '3A', '3B', '7A', '7B', '8A', '8B'];
export const stageOf = c => CODE[c] || c || 'start';
export const admitOf = r => (r.statusCode ? CODE[r.statusCode] : r.admitStatus) || '—';

// Badge tones: ok | info | warn | bad | tc | neutral | outline
export const GROUP_CLASS_TONE = { PENDING: 'warn', Selected: 'info', NotAdmitted: 'bad', Admitted: 'ok', TCIssued: 'tc' };
export const GROUP_CLASS = { notlisted: 'PENDING', waiting: 'PENDING', selected: 'Selected', notwilling: 'NotAdmitted', joined: 'Admitted', notjoined: 'NotAdmitted', tc: 'TCIssued' };

// Student groups: [key, label, chart colour, icon]. One Not Joined group: 7A = Not Joined - Pending (waiting for the RC), 7B = Not Joined - Approved.
export const GROUPS = [
  ['notlisted', 'Not listed', '#8a97a8', 'users'], ['waiting', 'Waiting', '#c08a1e', 'clock'], ['selected', 'Selected', '#2f6a9e', 'star'],
  ['joined', 'Joined', '#2a7d5f', 'ok'], ['notwilling', 'Not Willing', '#b84a4a', 'no'], ['notjoined', 'Not Joined', '#d08a45', 'no'], ['tc', 'TC', '#5b5f97', 'doc'],
];
// The DMS (district) works with Pending, Selected, Joined, Not Willing and Not Joined. TC is only a Dashboard count there:
// a TC is requested in the TC Requests screen.
export const DMS_GROUPS = GROUPS.filter(([k]) => k !== 'notlisted').map(g => (g[0] === 'waiting' ? ['waiting', 'Pending', g[2], g[3]] : g));
export const groupsFor = user => (user.role === 'DISTRICT' ? DMS_GROUPS : GROUPS);
// Student Details has no TC tab.
const noTc = list => list.filter(([k]) => k !== 'tc');
export const DMS_TABS = noTc(DMS_GROUPS).map(([k, l]) => [k, l]);
export const TABS = [['all', 'All'], ...noTc(GROUPS).map(([k, l]) => [k, l])];

// Needed for Not Willing and for Not Joined.
export const LETTER_KINDS = { HM: 'HM letter', STUDENT: 'Student unwilling letter' };

export const SEAT_TAG = { RESERVED: ['Reserved', 'info'], JOINED: ['Joined', 'ok'], VACANT: ['Vacant', 'outline'] };
export const TC_STAGE = { JOINED: ['Joined · TC not requested', 'ok'], REGION: ['Waiting for the Regional Coordinator', 'warn'], STATE: ['Waiting for the State Regional Coordinator', 'info'], DONE: ['TC Issued', 'tc'] };
export const TC_TABS = [['', 'All'], ['JOINED', 'Joined'], ['REGION', 'Waiting for RC'], ['STATE', 'Waiting for State RC'], ['DONE', 'TC Issued']];

// Document Verification: mandatory documents and their review states.
export const DOC_NAMES = { WILLING: 'Willing letter', TC: 'Transfer Certificate (TC)', COMMUNITY: 'Community certificate', PWD: 'PWD letter' };
export const DOC_SHORT = { WILLING: 'Willing letter', TC: 'TC', COMMUNITY: 'Community', PWD: 'PWD letter' };
export const DOC_STATUS = { VERIFIED: ['Verified', 'ok'], PENDING: ['Awaiting verification', 'warn'], REJECTED: ['Rejected', 'bad'] };
export const DOC_STATES = { VERIFIED: ['Verified', 'ok'], PENDING: ['Awaiting verification', 'warn'], REJECTED: ['Rejected - resubmit', 'bad'], INCOMPLETE: ['Incomplete', 'neutral'], NOT_SUBMITTED: ['Not submitted', 'neutral'] };
export const DOC_TABS = [['', 'All'], ['NOT_SUBMITTED', 'Not submitted'], ['INCOMPLETE', 'Incomplete'], ['PENDING', 'Awaiting verification'], ['REJECTED', 'Rejected'], ['VERIFIED', 'Verified']];

export const ROLE_NAME = { SUPER_ADMIN: 'SE TEAM (SUPER ADMIN)', STATE: 'STATE REGIONAL COORDINATOR', REGION: 'REGIONAL COORDINATOR', DISTRICT: 'DMS (DISTRICT)' };
export const scopeOf = user => (['SUPER_ADMIN', 'STATE'].includes(user.role) ? 'All districts' : user.region || user.district || '—');

export const classesFor = user => (user.role === 'SUPER_ADMIN' ? [9, 10] : (user.classes || []).filter(c => [9, 10].includes(c)));
export const firstClass = user => classesFor(user)[0] || 9;
