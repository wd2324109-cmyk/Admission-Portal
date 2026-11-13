import { pgTable, serial, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

// 1.3 Student_LOG - change history of student records for all classes (42 columns).
// One row per change: the student as it is AFTER the change, plus the status before / after, who and when.
export const studentLog = pgTable('Student_LOG', {
  id: serial('id').primaryKey(),
  district: text('district'), block: text('block'), udise: text('Udise'), schoolType: text('school_type'), schoolname: text('Schoolname'),
  class: text('class'), emis: integer('Emis'), name: text('Name'), dob: text('Dob'), gender: text('Gender'), community: text('community'), medium: text('medium'),
  disabilityStatus: boolean('Disability_status'), disabilityDesc: text('Disability_desc'), phone: text('phone'), address: text('address'), pincode: text('pincode'),
  mark1: integer('mark1'), mark2: integer('mark2'), mark3: integer('mark3'), mark4: integer('mark4'), mark5: integer('mark5'), total: integer('total'),
  pass: text('pass'), regno: integer('regno'), orank: integer('orank'), selectStatus: text('select_status'), selectedCategory: text('selected_category'),
  admitStatus: text('admit_status'), newDistcName: text('New_distc_name'), newUdiseType: text('New_udise_type'), newUdiseCode: text('New_udise_code'),
  newSchoolName: text('New_school_name'), tag1: text('tag1'), remark1: text('remark1'), tag2: text('tag2'), remark2: text('remark2'),
  updateStatusBefore: text('Update_status_before'), updateStatusAfter: text('Update_status_after'), updatedBy: text('updated_by'), updatedAt: timestamp('updated_at'),
});
