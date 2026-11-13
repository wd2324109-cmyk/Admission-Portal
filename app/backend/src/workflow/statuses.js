// The status codes of the flowchart "Student Selection and Admission to District Model Schools for Class IX & X".
//
// A student's position is stored in two columns of the Students_master_* tables:
//   select_status  - the CURRENT status code, whichever of the 10 it is (1A 1B 2A 6A 3A 3B 7A 7B 8A 8B)
//   admit_status   - the DESCRIPTION of that status (the label below), always written together with select_status
// Both are empty / NULL until the student is put on a list.
export const STATUS = {
  '1A': { label: 'Waiting', note: 'On the selection list sent to the DMS' },
  '1B': { label: 'Waiting (reconsidered)', note: 'Not Willing, reconsidered on DMS request' },
  '2A': { label: 'Selected', note: 'Student is willing' },
  '6A': { label: 'Not Willing', note: 'Student is not willing' },
  '3A': { label: 'Joined by HM', note: 'Relieved and joined the DMS' },
  '3B': { label: 'Joined by RC', note: 'Re-admitted by the Regional Coordinator' },
  '7A': { label: 'Not Joined - Pending Approval', note: 'Waiting for the Regional Coordinator to verify' },
  '7B': { label: 'Not Joined - Approved', note: 'Regional Coordinator approved the non-joining' },
  '8A': { label: 'TC-Waiting', note: 'TC requested, waiting for approvals' },
  '8B': { label: 'TC Issued', note: 'TC approved by the State Regional Coordinator' },
};
export const labelOf = code => (STATUS[code] ? `${code} ${STATUS[code].label}` : '');

/** Who does what. The 4 roles of the users table map to the actors of the flowchart. */
export const ROLES = {
  SUPER_ADMIN: 'State Enrollment Team (SE Team): imports data, ranks, generates lists. Also acts for any other role.',
  STATE: 'State Regional Coordinator: final approval of TC requests.',
  REGION: 'Regional Coordinator (RC): verifies "Not Joined", re-admits, first approval of TC requests.',
  DISTRICT: 'District Model School (DMS): records willing / not willing, joining, TC requests.',
};

export const norm = v => String(v ?? '').trim();
/** The state of a student row: his current status code (select_status) and the TC stage (tag2). */
export const stateOf = row => ({ code: norm(row.selectStatus), tag2: norm(row.tag2) });
/** The one code a log line talks about. */
export const primary = s => s.code;
/** The two column values for a status code: the code in select_status and its description in admit_status. */
export const statusColumns = code => ({ selectStatus: code || null, admitStatus: code ? STATUS[code].label : null });

// A seat is JOINED (Vacancy_status) while the student has joined and has not yet been given a TC.
export const JOINED_CODES = ['3A', '3B', '8A'];
export const joinsSeat = s => JOINED_CODES.includes(s.code);
// A seat is HELD for a student who is on the list, selected, or waiting for the RC's decision on "Not Joined".
export const holdsSeat = s => ['1A', '2A', '7A'].includes(s.code);
/** 'JOIN' / 'RELEASE' / null: what must happen to the student's seat row when the state changes. */
export const seatEffect = (before, after) => (!joinsSeat(before) && joinsSeat(after) ? 'JOIN' : joinsSeat(before) && !joinsSeat(after) ? 'RELEASE' : null);

/** Groups used by the tabs and the dashboard. */
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

// SQL for the same groups, so lists and dashboards can be counted in the database.
export const GROUP_SQL = {
  notlisted: `coalesce(select_status,'') = ''`,
  waiting: `select_status in ('1A','1B')`,
  selected: `select_status = '2A'`,
  notwilling: `select_status = '6A'`,
  joined: `select_status in ('3A','3B')`,
  notjoined: `select_status in ('7A','7B')`,
  tc: `select_status in ('8A','8B')`,
};
