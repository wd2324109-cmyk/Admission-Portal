export const STATUS = {
  '1A': { label: 'Waiting', note: 'On the selection list sent to the DMS' },
  '1B': { label: 'Waiting (reconsidered)', note: 'Not Willing, reconsidered on DMS request' },
  '2A': { label: 'Selected', note: 'Student is willing' },
  '6A': { label: 'Not Willing', note: 'Student is not willing (unwilling letter uploaded)' },
  '3A': { label: 'Joined by HM', note: 'Relieved and joined the DMS' },
  '3B': { label: 'Joined by RC', note: 'Re-admitted by the Regional Coordinator' },
  '7A': { label: 'Not Joined - Pending', note: 'Waiting for the Regional Coordinator to verify' },
  '7B': { label: 'Not Joined - Approved', note: 'Regional Coordinator approved the non-joining' },
  '8A': { label: 'TC-Waiting', note: 'TC requested, waiting for approvals' },
  '8B': { label: 'TC Issued', note: 'TC approved by the State Regional Coordinator' },
};
export const labelOf = code => (STATUS[code] ? STATUS[code].label : '');

export const ROLES = {
  SUPER_ADMIN: 'State Enrollment Team (SE Team): imports data, ranks, generates lists, decides reconsideration requests (Selected / Not Selected). Does not mark the DMS steps (willing, joining, TC request).',
  STATE: 'State Regional Coordinator: final approval of TC requests.',
  REGION: 'Regional Coordinator (RC): verifies "Not Joined", re-admits, first approval of TC requests.',
  DISTRICT: 'District Model School (DMS): records willing / not willing, joining, TC requests.',
};

export const norm = v => String(v ?? '').trim();

export const stateOf = row => ({ code: norm(row.selectStatus), tag2: norm(row.tag2) });

export const primary = s => s.code;

export const statusColumns = code => ({ selectStatus: code || null, admitStatus: code ? STATUS[code].label : null });

export const JOINED_CODES = ['3A', '3B', '8A'];
export const joinsSeat = s => JOINED_CODES.includes(s.code);

export const holdsSeat = s => ['1A', '2A', '7A'].includes(s.code);

export const seatEffect = (before, after) => (!joinsSeat(before) && joinsSeat(after) ? 'JOIN' : joinsSeat(before) && !joinsSeat(after) ? 'RELEASE' : null);

export const GROUPS = {
  notlisted: s => !s.code,
  waiting: s => ['1A', '1B'].includes(s.code),
  selected: s => s.code === '2A',
  notwilling: s => s.code === '6A',
  joined: s => ['3A', '3B'].includes(s.code),
  notjoined: s => ['7A', '7B'].includes(s.code),
  tc: s => ['8A', '8B'].includes(s.code),
};
export const groupOf = s => Object.keys(GROUPS).find(g => GROUPS[g](s)) || 'notlisted';

export const GROUP_SQL = {
  notlisted: `coalesce(select_status,'') = ''`,
  waiting: `select_status in ('1A','1B')`,
  selected: `select_status = '2A'`,
  notwilling: `select_status = '6A'`,
  joined: `select_status in ('3A','3B')`,
  notjoined: `select_status in ('7A','7B')`,
  tc: `select_status in ('8A','8B')`,
};
