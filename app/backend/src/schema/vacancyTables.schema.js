import { serial, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { table } from './table.js';

const seatColumns = () => ({
  id: serial('id').primaryKey(),
  newDistrict: text('New_district'), newUdiseType: text('New_udise_type'), newUdiseCode: text('New_udise_code'), newSchoolName: text('New_school_name'),
  groupCode: text('Group_code'), groupDesc: text('Group_desc'),
  classLevel: integer('class_level'), gender: text('gender'), medium: text('medium'), community: text('community'),
  vacancyRefNo: integer('Vacancy_Ref_no'), vacancyStatus: text('Vacancy_status'), remarks: text('remarks'),
});
export const vacancies9th = table('Vacancies_9th', seatColumns());
export const vacancies10th = table('Vacancies_10th', seatColumns());
export const vacancies11th = table('Vacancies_11th', seatColumns());

export const vacancyLogs = table('VACANCY_logs', {
  id: serial('id').primaryKey(),
  newDistrict: text('New_district'), newUdiseType: text('New_udise_type'), newUdiseCode: text('New_udise_code'), newSchoolName: text('New_school_name'),
  groupCode: text('Group_code'), groupDesc: text('Group_desc'),
  classLevel: integer('class_level'), gender: text('gender'), medium: text('medium'), community: text('community'),
  vacancyRefNo: integer('Vacancy_Ref_no'), vacancyStatus: text('Vacancy_status'),
  updateStatusBefore: text('Update_status_before'), updateStatusAfter: text('Update_status_after'), updatedBy: text('updated_by'), updatedAt: timestamp('updated_at'),
});
