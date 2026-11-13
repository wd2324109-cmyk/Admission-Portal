// Section 2 - "Generate Overall Rank Number for each student".
//
// !!! PLACEHOLDER RULE !!!  The flowchart says an overall rank is generated from the Class-8/9 marks, the NMMS and TRUST exam
// data (DGE) and the Kalai Thiruvizha data, but it does not say HOW they are combined. Until the department's formula is
// written here, the score is the simple sum below. Change `score()` (and only that) when the real rule is known.
const num = v => { const n = Number(String(v ?? '').trim()); return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : 0; };

/** Higher score = better rank. `s` is a normalised student (see studentStore.js). */
export const score = s => num(s.total) + num(s.nmss) + num(s.otherMarks) + num(s.trust);

/** Returns Map(id -> rank). Rank 1 is the best. Ties are broken by total, then NMMS, then EMIS (lower first), so ranks are unique. */
export function computeRanks(students) {
  const order = [...students].sort((a, b) => score(b) - score(a) || num(b.total) - num(a.total) || num(b.nmss) - num(a.nmss) || num(a.emis) - num(b.emis) || a.id - b.id);
  return new Map(order.map((s, i) => [s.id, i + 1]));
}
