// Section 3 / Section 5 - "Generate student list as per State Roster & forward to DMS" and "Compute balance vacancies".
//
// For every seat group (a "cell": DMS district + school + class + gender + medium + community) the balance is
//     open seats (Vacancy_status VACANT)  minus  seats already held by a student on the list / selected / pending approval.
// The best-ranked eligible students of the same district, gender and medium fill the balance and become 1A (Waiting).
// "Eligible" = never listed, OR waiting after reconsideration (1B). Students who are 6A (not reconsidered) or 7B are never
// considered again; students already 1A / 2A are not touched (they already hold a place). This is the loop
// "All vacancies filled? No -> generate a fresh list" of the flowchart.
import { norm, stateOf, holdsSeat } from './statuses.js';

export const COMMUNITY_ORDER = ['GT-PWD', 'GT', 'BC', 'BCM', 'MBC', 'SC', 'SCA', 'ST'];
const up = v => norm(v).toUpperCase();
const rankOf = s => (Number.isInteger(s.orank) ? s.orank : Number.MAX_SAFE_INTEGER);

export const seatCellKey = (s, cls) => [up(s.newDistrict), up(s.newUdiseCode), +(s.classLevel ?? cls), up(s.gender), up(s.medium), up(s.community)].join('|');
export const studentCellKey = (st, cls) => [up(st.newDistcName), up(st.newUdiseCode), +cls, up(st.gender), up(st.medium), up(st.selectedCategory)].join('|');

/** Groups the seats of one class into cells and counts, per cell: seats, joined, vacant and held (students on the list / selected / pending approval). */
export function buildCells(students, seats, cls) {
  const cells = new Map();
  for (const r of seats) {
    const k = seatCellKey(r, cls);
    if (!cells.has(k)) cells.set(k, { key: k, newDistrict: r.newDistrict, newUdiseType: r.newUdiseType, newUdiseCode: r.newUdiseCode, newSchoolName: r.newSchoolName,
      gender: r.gender, medium: r.medium, community: r.community, seats: 0, vacant: 0, joined: 0, held: 0 });
    const c = cells.get(k); c.seats++;
    if (up(r.vacancyStatus) === 'VACANT') c.vacant++; else c.joined++;
  }
  for (const st of students) if (holdsSeat(stateOf(st))) { const c = cells.get(studentCellKey(st, cls)); if (c) c.held++; }
  const ordered = [...cells.values()].sort((a, b) => up(a.newDistrict).localeCompare(up(b.newDistrict)) || up(a.newUdiseCode).localeCompare(up(b.newUdiseCode))
    || up(a.gender).localeCompare(up(b.gender)) || up(a.medium).localeCompare(up(b.medium)) || COMMUNITY_ORDER.indexOf(up(a.community)) - COMMUNITY_ORDER.indexOf(up(b.community)));
  for (const c of ordered) c.open = Math.max(0, c.vacant - c.held);
  return ordered;
}

/** Plans a list. students are normalised students of ONE class; seats are the rows of that class's Vacancies table. Pure: changes nothing. */
export function planList(students, seats, cls) {
  const ordered = buildCells(students, seats, cls);
  const pool = students.filter(st => { const s = stateOf(st); return !s.code || s.code === '1B'; });
  const taken = new Set(), assignments = [];
  for (const c of ordered) {
    const comm = up(c.community);
    const eligible = pool.filter(st => !taken.has(st.id) && up(st.district) === up(c.newDistrict) && up(st.gender) === up(c.gender) && up(st.medium) === up(c.medium)
      && (comm === 'GT' ? true : comm === 'GT-PWD' ? !!st.disabilityStatus : up(st.community) === comm));
    const chosen = eligible.sort((a, b) => rankOf(a) - rankOf(b) || (a.emis ?? 0) - (b.emis ?? 0) || a.id - b.id).slice(0, c.open);
    for (const st of chosen) { taken.add(st.id); assignments.push({ id: st.id, relisted: up(st.selectStatus) === '1B', cell: c }); }
    c.chosen = chosen.length; c.shortfall = c.open - chosen.length;
  }
  return { assignments, cells: ordered, totals: { listed: assignments.length, shortfall: ordered.reduce((n, c) => n + c.shortfall, 0), open: ordered.reduce((n, c) => n + c.open, 0) } };
}
