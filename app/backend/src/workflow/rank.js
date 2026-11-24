const num = v => { const n = Number(String(v ?? '').trim()); return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : 0; };

export const score = s => num(s.total) + num(s.nmss) + num(s.otherMarks) + num(s.trust);

export function computeRanks(students) {
  const order = [...students].sort((a, b) => score(b) - score(a) || num(b.total) - num(a.total) || num(b.nmss) - num(a.nmss) || num(a.emis) - num(b.emis) || a.id - b.id);
  return new Map(order.map((s, i) => [s.id, i + 1]));
}

// After lists have started: the students still waiting to be listed are ranked together by score, and their ranks begin right after
// the rank of the last student already listed. Ranks of students who were listed never change.
// A student whose reconsideration was requested or approved has an empty select status too, but was listed before, so the rank stays.
const keepsRank = s => !!s.selectStatus || ['RECONSIDER', 'RECONSIDER_SELECT'].includes(String(s.tag1 ?? '').trim());
export function rankRemaining(students) {
  const top = Math.max(0, ...students.filter(keepsRank).map(s => s.orank).filter(Number.isInteger));
  return [...computeRanks(students.filter(s => !keepsRank(s)))].map(([id, r]) => [id, r + top]);
}
