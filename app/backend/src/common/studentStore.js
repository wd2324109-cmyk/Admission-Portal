import { students9th, students10th } from '../schema/index.js';
import { HttpError } from './http.js';

export const CLASSES = [9, 10];
const TABLES = { 9: students9th, 10: students10th };
export const studentTable = cls => { const t = TABLES[+cls]; if (!t) throw new HttpError('Choose class 9 or 10'); return t; };
export const parseClass = v => { const c = +v; if (!CLASSES.includes(c)) throw new HttpError('Choose class 9 or 10'); return c; };

const COMMON = ['district', 'block', 'udise', 'schoolType', 'schoolname', 'class', 'emis', 'name', 'dob', 'gender', 'community', 'medium', 'disabilityStatus', 'disabilityDesc',
  'phone', 'address', 'pincode', 'pass', 'orank', 'selectStatus', 'selectedCategory', 'admitStatus', 'newDistcName', 'newUdiseType', 'newUdiseCode', 'newSchoolName', 'tag1', 'remark1', 'tag2', 'remark2'];
const UPPER = ['fatherName', 'motherName', 'mark1Quarterly', 'mark2Half', 'totalHighest', 'nmss', 'trust', 'otherMarks'];
export const hasColumn = (cls, key) => key in studentTable(cls);

export function norm(row, cls) {
  const o = { id: row.id, classLevel: +cls };
  for (const k of [...COMMON, ...UPPER]) if (k in row) o[k] = row[k];
  o.total = row.totalHighest;
  o.mark1 = row.mark1Quarterly;
  o.mark2 = row.mark2Half;
  return o;
}

export const pick = (cls, values) => Object.fromEntries(Object.entries(values).filter(([k]) => hasColumn(cls, k)));

export function logSnapshot(row, cls) {
  const s = norm(row, cls);
  return { district: s.district, block: s.block, udise: s.udise, schoolType: s.schoolType, schoolname: s.schoolname, class: s.class ?? String(cls), emis: s.emis, name: s.name, dob: s.dob,
    gender: s.gender, community: s.community, medium: s.medium, disabilityStatus: s.disabilityStatus, disabilityDesc: s.disabilityDesc, phone: s.phone, address: s.address, pincode: s.pincode,
    mark1: s.mark1 ?? null, mark2: s.mark2 ?? null, mark3: s.mark3 ?? null, mark4: s.mark4 ?? null, mark5: s.mark5 ?? null, total: s.total ?? null, pass: s.pass, regno: s.regno ?? null,
    orank: s.orank, selectStatus: s.selectStatus, selectedCategory: s.selectedCategory, admitStatus: s.admitStatus, newDistcName: s.newDistcName, newUdiseType: s.newUdiseType,
    newUdiseCode: s.newUdiseCode, newSchoolName: s.newSchoolName, tag1: s.tag1, remark1: s.remark1, tag2: s.tag2, remark2: s.remark2 ?? null };
}
