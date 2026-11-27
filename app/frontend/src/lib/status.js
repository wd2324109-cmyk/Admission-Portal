export const CODE = {
  '1A': 'Waiting', '2A': 'Selected', '6A': 'Not Willing',
  '3A': 'Joined by HM', '3B': 'Joined by RC', '7A': 'Not Joined - Pending', '7B': 'Not Joined - Approved',
  '8A': 'TC Requested', '8B': 'TC - RC Approved', '8C': 'TC - SC Approved', '8D': 'TC Issued', '8Z': 'TC Rejected - Resubmit',
};
export const ALL_CODES = ['', '1A', '2A', '6A', '3A', '3B', '7A', '7B', '8A', '8B', '8C', '8D', '8Z'];
export const stageOf = c => CODE[c] || c || 'start';
export const admitOf = r => (r.statusCode ? CODE[r.statusCode] : r.admitStatus) || '—';

export const GROUP_CLASS_TONE = { PENDING: 'warn', Selected: 'info', NotAdmitted: 'bad', Admitted: 'ok', TCIssued: 'tc' };
export const GROUP_CLASS = { notlisted: 'PENDING', waiting: 'PENDING', selected: 'Selected', notwilling: 'NotAdmitted', joined: 'Admitted', notjoined: 'NotAdmitted', tc: 'TCIssued' };

export const GROUPS = [
  ['notlisted', 'Not listed', '#8a97a8', 'users'], ['waiting', 'Waiting', '#c08a1e', 'clock'], ['selected', 'Selected', '#2f6a9e', 'star'],
  ['joined', 'Joined', '#2a7d5f', 'ok'], ['notwilling', 'Not Willing', '#b84a4a', 'no'], ['notjoined', 'Not Joined', '#d08a45', 'no'], ['tc', 'TC', '#5b5f97', 'doc'],
];

export const DMS_GROUPS = GROUPS.filter(([k]) => k !== 'notlisted').map(g => (g[0] === 'waiting' ? ['waiting', 'Pending', g[2], g[3]] : g));
const LISTED_GROUPS = GROUPS.filter(([k]) => k !== 'notlisted');
export const groupsFor = user => (user.role === 'DISTRICT' ? DMS_GROUPS : user.role === 'SUPER_ADMIN' ? GROUPS : LISTED_GROUPS);

const noTc = list => list.filter(([k]) => k !== 'tc');
export const DMS_TABS = noTc(DMS_GROUPS).map(([k, l]) => [k, l]);
export const TABS = [['all', 'All'], ...noTc(GROUPS).map(([k, l]) => [k, l])];
export const tabsFor = user => (user.role === 'DISTRICT' ? DMS_TABS : user.role === 'SUPER_ADMIN' ? TABS : TABS.filter(([k]) => k !== 'notlisted'));

export const LETTER_KINDS = { HM: 'HM letter', STUDENT: 'Student unwilling letter', REASON: 'Reason letter', TC: 'TC request letter' };

export const SEAT_TAG = { RESERVED: ['Reserved', 'info'], JOINED: ['Joined', 'ok'], VACANT: ['Vacant', 'outline'] };
export const TC_STAGE = { JOINED: ['Joined · TC not requested', 'ok'], REGION: ['Waiting for the Regional Coordinator (RC)', 'warn'], STATE: ['Waiting for the State Coordinator (SC)', 'info'], ADMIN: ['Waiting for the Super Admin', 'info'], DONE: ['TC Issued', 'tc'], REJECTED: ['Rejected · resubmit', 'bad'] };
export const TC_TABS = [['', 'All'], ['JOINED', 'Joined'], ['REGION', 'Waiting for RC'], ['STATE', 'Waiting for SC'], ['ADMIN', 'Waiting for Admin'], ['DONE', 'TC Issued'], ['REJECTED', 'Rejected']];
export const TC_REJECTED_BY = { RC: 'the Regional Coordinator', SC: 'the State Coordinator', ADMIN: 'the Super Admin' };
export const TC_OUTCOME = { REQUESTED: ['Requested', 'info'], RESUBMITTED: ['Resubmitted', 'info'], APPROVED: ['Approved', 'ok'], REJECTED: ['Rejected', 'bad'], NOTE: ['Remark saved', 'neutral'], WITHDRAWN: ['Withdrawn', 'neutral'] };

export const DOC_NAMES = { WILLING: 'Willing letter', TC: 'Transfer Certificate (TC)', COMMUNITY: 'Community certificate', PWD: 'PWD letter' };
export const DOC_SHORT = { WILLING: 'Willing letter', TC: 'TC', COMMUNITY: 'Community', PWD: 'PWD letter' };
export const DOC_STATUS = { VERIFIED: ['Verified', 'ok'], PENDING: ['Awaiting verification', 'warn'], REJECTED: ['Rejected', 'bad'] };
export const DOC_STATES = { VERIFIED: ['Verified', 'ok'], PENDING: ['Awaiting verification', 'warn'], REJECTED: ['Rejected - resubmit', 'bad'], INCOMPLETE: ['Incomplete', 'neutral'], NOT_SUBMITTED: ['Not submitted', 'neutral'] };
export const DOC_TABS = [['', 'All'], ['NOT_SUBMITTED', 'Not submitted'], ['INCOMPLETE', 'Incomplete'], ['PENDING', 'Awaiting verification'], ['REJECTED', 'Rejected'], ['VERIFIED', 'Verified']];

export const displayName = user => (user?.name || '').trim() || user?.username || '';
export const ROLE_NAME = { SUPER_ADMIN: 'SE TEAM (SUPER ADMIN)', STATE: 'STATE REGIONAL COORDINATOR', REGION: 'REGIONAL COORDINATOR', DISTRICT: 'DMS (DISTRICT)' };
export const scopeOf = user => (['SUPER_ADMIN', 'STATE'].includes(user.role) ? 'All districts' : (user.region || user.district || '—').split(',').map(x => x.trim()).filter(Boolean).join(', '));

export const classesFor = user => (user.role === 'SUPER_ADMIN' ? [9, 10] : (user.classes || []).filter(c => [9, 10].includes(c)));
export const firstClass = user => classesFor(user)[0] || 9;
