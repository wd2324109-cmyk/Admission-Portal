export const STATUS = {
  '1A': { label: 'Waiting', note: 'On the selection list sent to the DMS' },
  '2A': { label: 'Selected', note: 'Student is willing' },
  '6A': { label: 'Not Willing', note: 'Student is not willing (unwilling letter uploaded)' },
  '3A': { label: 'Joined by HM', note: 'Relieved and joined the DMS' },
  '3B': { label: 'Joined by RC', note: 'Re-admitted by the Regional Coordinator' },
  '7A': { label: 'Not Joined - Pending', note: 'Waiting for the Regional Coordinator to verify' },
  '7B': { label: 'Not Joined - Approved', note: 'Regional Coordinator approved the non-joining' },
  '8A': { label: 'TC Requested', note: 'TC requested by the HM, waiting for the Regional Coordinator' },
  '8B': { label: 'TC - RC Approved', note: 'Approved by the Regional Coordinator, waiting for the State Coordinator' },
  '8C': { label: 'TC - SC Approved', note: 'Approved by the State Coordinator, waiting for the Super Admin' },
  '8D': { label: 'TC Issued', note: 'TC approved by the Super Admin' },
  '8Z': { label: 'TC Rejected - Resubmit', note: 'TC request rejected at an approval step; returned to the HM to resubmit' },
};
export const norm = v => String(v ?? '').trim();

export const stateOf = row => ({ code: norm(row.selectStatus), tag2: norm(row.tag2) });

// A reconsideration is not a status: select_status and admit_status become empty (null) and everything is decided from those two columns alone.
// Such a student is shown on no DMS screen and is picked again by the next list, like any student who is not listed yet.
export const inListPool = s => !s.code;

export const primary = s => s.code;

export const statusColumns = code => ({ selectStatus: code || null, admitStatus: code ? STATUS[code].label : null });

// A student keeps the seat for the whole TC process (requested, approved by RC / SC, or rejected and waiting for the HM); the seat is released only when the TC is issued (8D).
export const TC_CODES = ['8A', '8B', '8C', '8D', '8Z'];
export const JOINED_CODES = ['3A', '3B', '8A', '8B', '8C', '8Z'];
// tag2 carries the TC stage so lists and the correction screen can show it without reading the log: who must act next, or who rejected the request.
export const TC_TAG2 = { '8A': 'TC-RC', '8B': 'TC-SC', '8C': 'TC-ADMIN', '8D': 'TC-DONE', '8Z': 'TC-REJ-ADMIN' };
export const tcTag2 = code => TC_TAG2[code] || '';
export const joinsSeat = s => JOINED_CODES.includes(s.code);

export const holdsSeat = s => ['1A', '2A', '7A'].includes(s.code);

export const seatEffect = (before, after) => (!joinsSeat(before) && joinsSeat(after) ? 'JOIN' : joinsSeat(before) && !joinsSeat(after) ? 'RELEASE' : null);

export const GROUPS = {
  notlisted: s => !s.code,
  waiting: s => s.code === '1A',
  selected: s => s.code === '2A',
  notwilling: s => s.code === '6A',
  joined: s => ['3A', '3B'].includes(s.code),
  notjoined: s => ['7A', '7B'].includes(s.code),
  tc: s => TC_CODES.includes(s.code),
};
export const groupOf = s => Object.keys(GROUPS).find(g => GROUPS[g](s)) || 'notlisted';

export const GROUP_SQL = {
  notlisted: `coalesce(select_status,'') = ''`,
  waiting: `select_status = '1A'`,
  selected: `select_status = '2A'`,
  notwilling: `select_status = '6A'`,
  joined: `select_status in ('3A','3B')`,
  notjoined: `select_status in ('7A','7B')`,
  tc: `select_status in ('8A','8B','8C','8D','8Z')`,
};
