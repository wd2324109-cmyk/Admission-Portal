const num = v => { const n = Number(String(v ?? '').trim()); return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : 0; };

export const score = s => num(s.total) + num(s.nmss) + num(s.otherMarks) + num(s.trust);

export function computeRanks(students) {
  const order = [...students].sort((a, b) => score(b) - score(a) || num(b.total) - num(a.total) || num(b.nmss) - num(a.nmss) || num(a.emis) - num(b.emis) || a.id - b.id);
  return new Map(order.map((s, i) => [s.id, i + 1]));
}
