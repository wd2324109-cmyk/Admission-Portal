import { STATUS, statusColumns } from './statuses.js';
// Excel row -> database row (9th_master_sheet / 10th_master_sheet and 9th_vacancy_sheet / 10th_vacancy_sheet). Header names are matched ignoring case, spaces, dashes and underscores, and the column names of the
// database document are accepted exactly ("mark1-quertly", "Total-highest of two", "Other marks" ...) as well as friendlier ones.
const key = k => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const lookup = row => { const m = {}; for (const [k, v] of Object.entries(row)) m[key(k)] = v;
  return (...names) => { for (const n of names) { const v = m[key(n)]; if (v !== undefined && v !== null && String(v).trim() !== '') return typeof v === 'string' ? v.trim() : v; } return ''; }; };
export const COMMUNITIES = ['GT-PWD', 'GT', 'BC', 'BCM', 'MBC', 'SC', 'SCA', 'ST'];
const cap = s => String(s).trim().toLowerCase().replace(/^./, c => c.toUpperCase());
const int = v => (v === '' || !Number.isFinite(+v) || !Number.isInteger(+v) ? null : +v);
const txt = v => (v === '' ? null : String(v));
const GENDER = { boy: 'Boy', male: 'Boy', m: 'Boy', b: 'Boy', girl: 'Girl', female: 'Girl', f: 'Girl', g: 'Girl' };
export const INT_MAX = 2147483647;                                // Emis is an INTEGER in the database document
const emisOf = g => { const e = int(g('Emis', 'emis_no', 'emisno', 'emis_id')); return e !== null && e > 0 && e <= INT_MAX ? e : null; };

export function mapStudentRow(row, cls) {
  const g = lookup(row), emis = emisOf(g), gender = GENDER[String(g('Gender')).toLowerCase()];
  const v = { class: String(cls), emis, name: txt(g('Name', 'student_name')), district: txt(String(g('district')).toUpperCase()), block: txt(g('block')), udise: txt(g('Udise', 'udise_code')), schoolType: txt(g('school_type')),
    schoolname: txt(g('Schoolname', 'school_name')), dob: txt(g('Dob', 'date_of_birth')), gender, community: txt(String(g('community')).toUpperCase()), medium: txt(cap(g('medium'))),
    disabilityStatus: /^(y|yes|true|1)/i.test(String(g('Disability_status'))), disabilityDesc: txt(g('Disability_desc')),
    phone: txt(g('Phone', 'phone_number')), address: txt(g('address')), pincode: txt(g('pincode')), pass: txt(g('pass')), orank: int(g('orank')) };
  Object.assign(v, { fatherName: txt(g('Father_name')), motherName: txt(g('Mother_name')), mark1Quarterly: int(g('mark1-quertly', 'mark1-quarterly', 'mark1', 'quarterly')), mark2Half: int(g('mark2-half', 'mark2', 'half_yearly')),
    totalHighest: int(g('Total-highest of two', 'total_highest', 'total')), nmss: int(g('nmss', 'nmms')), trust: txt(g('Trust')), otherMarks: int(g('Other marks', 'other_marks')) });
  // select_status holds every status code (1A 1B 2A 6A 3A 3B 7A 7B 8A 8B); admit_status is ALWAYS the description of that code, whatever the sheet says.
  const code = String(g('select_status', 'selectstatus')).toUpperCase();
  if (code && !STATUS[code]) return { error: `select_status must be one of ${Object.keys(STATUS).join(', ')} (or empty)` };
  Object.assign(v, statusColumns(code), { selectedCategory: txt(g('selected_category')), newDistcName: txt(String(g('New_distc_name')).toUpperCase()), newUdiseType: txt(g('New_udise_type')),
    newUdiseCode: txt(g('New_udise_code')), newSchoolName: txt(g('New_school_name')), tag1: txt(g('tag1')), remark1: txt(g('remark1')), tag2: txt(g('tag2')) });
  const miss = ['emis', 'name', 'district', 'community', 'medium'].filter(k => v[k] === null);
  if (emis === null) return { error: `Emis must be a whole number from 1 to ${INT_MAX.toLocaleString('en-IN')}` };
  if (miss.length) return { error: 'missing: ' + miss.join(', ') };
  if (!v.gender) return { error: 'Gender must be Boy or Girl' };
  return { value: v };
}

export function mapVacancyRow(row, cls) {
  const g = lookup(row), classLevel = int(g('class_level', 'class')) ?? cls, gender = GENDER[String(g('gender')).toLowerCase()];
  const v = { newDistrict: String(g('New_district', 'district', 'regional_centre')).toUpperCase(), newUdiseType: txt(g('New_udise_type')), newUdiseCode: txt(g('New_udise_code')), newSchoolName: txt(g('New_school_name')),
    groupCode: txt(g('Group_code')), groupDesc: txt(g('Group_desc')), classLevel, gender, medium: cap(g('medium')), community: String(g('community')).toUpperCase(), vacancies: int(g('vacancies', 'vacancy')), admitted: int(g('admitted')) ?? 0 };
  if (classLevel !== cls) return { error: `class must be ${cls}` };
  if (!v.newDistrict || !v.medium) return { error: 'New_district and medium are required' };
  if (!gender) return { error: 'gender must be Boy or Girl' };
  if (!COMMUNITIES.includes(v.community)) return { error: `community must be one of ${COMMUNITIES.join(', ')}` };
  if (v.vacancies === null || v.vacancies < 0 || v.admitted < 0) return { error: 'vacancies / admitted must be whole numbers >= 0' };
  return { value: v };
}
