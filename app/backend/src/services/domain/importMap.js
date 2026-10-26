const key = k => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const COMMUNITIES = ['GT-PWD', 'GT', 'BC', 'BCM', 'MBC', 'SC', 'SCA', 'ST'];
const lookup = row => {
  const m = {}; for (const [k, v] of Object.entries(row)) m[key(k)] = v;
  return (...names) => { for (const n of names) { const v = m[key(n)]; if (v !== undefined && v !== null && String(v).trim() !== '') return typeof v === 'string' ? v.trim() : v; } return ''; };
};
const cap = s => String(s).trim().toLowerCase().replace(/^./, c => c.toUpperCase());
const num = v => (v === '' || isNaN(+v) ? null : +v);
                                                                                                                                 
                                                                                                        
const classOf = (g, dflt) => +g('class_level', 'class', 'class_applied') || dflt;

export function mapStudentRow(row, dflt) {
  const g = lookup(row), cls = classOf(g, dflt);
  if (![9, 10].includes(cls)) return { error: 'class must be 9 or 10' };
  const v = { regno: num(g('regno')), emisNo: String(g('emis_no')), name: String(g('name')), dob: String(g('dob')), gender: cap(g('gender')), classLevel: cls,
    district: String(g('district')).toUpperCase(), regionalCentre: String(g('regional_centre')).toUpperCase(), schoolName: String(g('school_name')),
    community: String(g('community')).toUpperCase(), medium: cap(g('medium')), disability: /^y/i.test(String(g('disability_status'))),
    total: num(g('total')), orank: num(g('orank')), phone: String(g('phone_number', 'phone')),
    selectStatus: String(g('select_status')), selectedCategory: String(g('selected_category')), admitStatus: String(g('admit_status')) };
                                                                                                            
                                                                                                                                    
  if (v.admitStatus === 'Admitted') { v.selectStatus = v.selectStatus || 'Selected-Phase-1'; v.admitStatus = ''; }
  else if (!v.admitStatus) v.selectStatus = '';
  const miss = ['regno', 'name', 'district', 'regionalCentre', 'community', 'medium', 'total', 'orank'].filter(k => v[k] === null || v[k] === '');
  if (miss.length) return { error: 'missing or invalid: ' + miss.join(', ') };
  if (!Number.isInteger(v.regno)) return { error: 'REGNO must be a whole number' };
  if (!['Boy', 'Girl'].includes(v.gender)) return { error: 'Gender must be Boy or Girl' };
  return { value: v };
}

export function mapVacancyRow(row, dflt) {
  const g = lookup(row), cls = classOf(g, dflt);
  if (![9, 10].includes(cls)) return { error: 'class must be 9 or 10' };
  const v = { regionalCentre: String(g('regional_centre')).toUpperCase(), classLevel: cls, gender: cap(g('gender')), medium: cap(g('medium')),
    community: String(g('community')).toUpperCase(), admitted: num(g('admitted')) ?? 0, vacancies: num(g('vacancies')) };
  if (!v.regionalCentre || !v.medium) return { error: 'Regional_centre and Medium are required' };
  if (!['Boy', 'Girl'].includes(v.gender)) return { error: 'Gender must be Boy or Girl' };
  if (!COMMUNITIES.includes(v.community)) return { error: `Community must be one of ${COMMUNITIES.join(', ')}` };
  if (v.vacancies === null || v.vacancies < 0 || v.admitted < 0) return { error: 'Vacancies / Admitted must be numbers >= 0' };
  return { value: v };
}
