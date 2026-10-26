export function planRevert(a, vac, holders) {
  const free = (vac?.vacancies ?? 0) - holders.length;
  if (free >= 1) return { action: 'free' };
  const lower = holders.filter(s => s.total < a.total || (s.total === a.total && s.orank > a.orank));
  if (!lower.length) return { action: 'none' };
  lower.sort((x, y) => x.total - y.total || y.orank - x.orank);      
  return { action: 'bump', bump: lower[0] };
}
