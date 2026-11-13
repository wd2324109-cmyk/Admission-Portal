import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';

// Vacancies_9th / _10th / _11th (14 columns each) and VACANCY_logs (17 columns), exactly as in the database document.
// ONE ROW PER SEAT. A seat a student has joined has that student's EMIS in Vacancy_Ref_no and Vacancy_status JOINED;
// an open seat has no reference and Vacancy_status VACANT. New_district is the district of the District Model School.
const seatColumns = () => ({
  id: serial('id').primaryKey(),
  newDistrict: text('New_district'), newUdiseType: text('New_udise_type'), newUdiseCode: text('New_udise_code'), newSchoolName: text('New_school_name'),
  groupCode: text('Group_code'), groupDesc: text('Group_desc'),
  classLevel: integer('class_level'), gender: text('gender'), medium: text('medium'), community: text('community'),
  vacancyRefNo: integer('Vacancy_Ref_no'), vacancyStatus: text('Vacancy_status'), remarks: text('remarks'),
});
export const vacancies9th = pgTable('Vacancies_9th', seatColumns());
export const vacancies10th = pgTable('Vacancies_10th', seatColumns());
export const vacancies11th = pgTable('Vacancies_11th', seatColumns());

export const vacancyLogs = pgTable('VACANCY_logs', {
  id: serial('id').primaryKey(),
  newDistrict: text('New_district'), newUdiseType: text('New_udise_type'), newUdiseCode: text('New_udise_code'), newSchoolName: text('New_school_name'),
  groupCode: text('Group_code'), groupDesc: text('Group_desc'),
  classLevel: integer('class_level'), gender: text('gender'), medium: text('medium'), community: text('community'),
  vacancyRefNo: integer('Vacancy_Ref_no'), vacancyStatus: text('Vacancy_status'),
  updateStatusBefore: text('Update_status_before'), updateStatusAfter: text('Update_status_after'), updatedBy: text('updated_by'), updatedAt: timestamp('updated_at'),
});
