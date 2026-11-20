import { serial, text, integer, boolean } from 'drizzle-orm/pg-core';
import { table } from './table.js';

const common = () => ({
  id: serial('id').primaryKey(),
  district: text('district'), block: text('block'), udise: text('Udise'), schoolType: text('school_type'), schoolname: text('Schoolname'),
  class: text('class'), emis: integer('Emis'), name: text('Name'), dob: text('Dob'), gender: text('Gender'), community: text('community'), medium: text('medium'),
  disabilityStatus: boolean('Disability_status'), disabilityDesc: text('Disability_desc'),
});
const status = () => ({
  selectStatus: text('select_status'), selectedCategory: text('selected_category'), admitStatus: text('admit_status'),
  newDistcName: text('New_distc_name'), newUdiseType: text('New_udise_type'), newUdiseCode: text('New_udise_code'), newSchoolName: text('New_school_name'),
  tag1: text('tag1'), remark1: text('remark1'), tag2: text('tag2'),
});

const upper = () => ({
  ...common(), fatherName: text('Father_name'), motherName: text('Mother_name'), phone: text('Phone'), address: text('address'), pincode: text('pincode'),
  mark1Quarterly: integer('mark1-quertly'), mark2Half: integer('mark2-half'), totalHighest: integer('Total-highest of two'), pass: text('pass'),
  nmss: integer('nmss'), trust: text('Trust'), otherMarks: integer('Other marks'), orank: integer('orank'),
  ...status(),
});
export const students9th = table('Students_master_9th', { ...upper(), remark2: text('remark2') });
export const students10th = table('Students_master_10th', upper());
export const students11th = table('Students_master_11th', {
  ...common(), phone: text('phone'), address: text('address'), pincode: text('pincode'),
  mark1: integer('mark1'), mark2: integer('mark2'), mark3: integer('mark3'), mark4: integer('mark4'), mark5: integer('mark5'), total: integer('total'),
  pass: text('pass'), regno: integer('regno'), orank: integer('orank'), ...status(), remark2: text('remark2'),
});
