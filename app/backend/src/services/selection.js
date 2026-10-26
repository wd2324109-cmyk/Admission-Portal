                                                                                                             
                                                                
export const COMMUNITY_ORDER = ['GT-PWD', 'GT', 'BC', 'BCM', 'MBC', 'SC', 'SCA', 'ST'];
const meritSort = (a, b) => b.total - a.total || a.orank - b.orank;                           
const phaseNum = s => { const m = /(\d+)/.exec(s || ''); return m ? +m[1] : null; };
export const cellKey = (o, comm) => [o.regionalCentre, o.classLevel, o.gender, o.medium, comm].join('|');

   
                                                                           
                                                                                                                
                                                                                                                  
                                                                       
                                                                                      
   
export function runRound(students, vacancies, mode = 'initial') {
  const eligible = students.filter(s => !s.selectStatus && !s.admitStatus);
  const latest = {};                                   
  for (const s of students) {
    const p = phaseNum(s.selectStatus);
    const k = `${s.regionalCentre}|${s.classLevel}`;
    if (p !== null && (latest[k] ?? 0) < p) latest[k] = p;
  }
  const inLatest = s => phaseNum(s.selectStatus) !== null && phaseNum(s.selectStatus) === latest[`${s.regionalCentre}|${s.classLevel}`];
  const pending = students.filter(s => s.selectStatus && !s.admitStatus && inLatest(s));
                                                                                                 
  const notAdmitted = students.filter(s => (s.admitStatus === 'Not Admitted' || s.admitStatus === 'TC Issued') && inLatest(s));

  const order = [...vacancies].sort((a, b) =>
    a.regionalCentre.localeCompare(b.regionalCentre) || a.classLevel - b.classLevel ||
    a.gender.localeCompare(b.gender) || a.medium.localeCompare(b.medium) ||
    COMMUNITY_ORDER.indexOf(a.community) - COMMUNITY_ORDER.indexOf(b.community));

  const taken = new Set(), replaced = new Set(), selections = [], vacancyUpdates = [];
  const sameCell = (s, v) => s.regionalCentre === v.regionalCentre && s.classLevel === v.classLevel &&
    s.gender === v.gender && s.medium === v.medium;

  for (const v of order) {
    const pendingCount = pending.filter(s => sameCell(s, v) && s.selectedCategory === v.community).length;
    const declined = notAdmitted.filter(s => sameCell(s, v) && s.selectedCategory === v.community);
    const target = mode === 'initial' ? v.vacancies : declined.length;

    let pool = eligible.filter(s => sameCell(s, v) && !taken.has(s.regno));
    if (v.community === 'GT-PWD') pool = pool.filter(s => s.disability);
    else if (v.community !== 'GT') pool = pool.filter(s => s.community === v.community);
    const chosen = pool.sort(meritSort).slice(0, target);

    const phase = mode === 'initial' ? 1 : (latest[`${v.regionalCentre}|${v.classLevel}`] ?? 1);
    chosen.forEach((s, i) => {
      taken.add(s.regno);
      selections.push({ regno: s.regno, selectStatus: `Selected-Phase-${phase}`, selectedCategory: v.community,
        replacesRegno: mode === 'replacement' ? declined[i].regno : null });                                                        
    });
    if (mode === 'replacement') declined.slice(0, chosen.length).forEach(s => replaced.add(s.regno));

    const balance = target - chosen.length;
    vacancyUpdates.push({
      key: cellKey(v, v.community),
      filled: v.admitted + pendingCount + chosen.length, balance,
      status: balance > 0 ? 'SHORTFALL' : 'OK',
    });
  }
  return { selections, replacedRegnos: [...replaced], vacancyUpdates };
}
