import { pgTable, serial, text, integer, timestamp, index } from 'drizzle-orm/pg-core';

// Vacancies_9th / Vacancies_10th / Vacancies_11th and VACANCY_logs, exactly as in "Admission Portal - Database Tables".
// ONE ROW PER SEAT: a community with 5 vacancies is 5 rows. A seat that a student has joined carries that student's EMIS in
// Vacancy_Ref_no and has Vacancy_status JOINED; an open seat has no reference and Vacancy_status VACANT (or SHORTFALL when the
// last selection could not find a student for it).
// New_district holds the regional centre the seat belongs to (the app's "regional centre").
const seatColumns = () => ({
  id: serial('id').primaryKey(),
  newDistrict: text('New_district').notNull(),
  newUdiseType: text('New_udise_type'),
  newUdiseCode: text('New_udise_code'),
  newSchoolName: text('New_school_name'),
  groupCode: text('Group_code'),
  groupDesc: text('Group_desc'),
  classLevel: integer('class_level').notNull(),
  gender: text('gender').notNull(),
  medium: text('medium').notNull(),
  community: text('community').notNull(),
  vacancyRefNo: integer('Vacancy_Ref_no'),
  vacancyStatus: text('Vacancy_status').notNull(),
  remarks: text('remarks'),
});
const byCell = (name, t) => index(name).on(t.newDistrict, t.gender, t.medium, t.community);

export const vacancies9th = pgTable('Vacancies_9th', seatColumns(), t => ({ cell: byCell('vacancies_9th_cell_idx', t) }));
export const vacancies10th = pgTable('Vacancies_10th', seatColumns(), t => ({ cell: byCell('vacancies_10th_cell_idx', t) }));
export const vacancies11th = pgTable('Vacancies_11th', seatColumns(), t => ({ cell: byCell('vacancies_11th_cell_idx', t) }));

// Change history of the seats of all classes: the seat as it is after the change, plus the status before / after, who and when.
// Vacancy_Ref_no here is the EMIS that joined (or left) in that change.
export const vacancyLogs = pgTable('VACANCY_logs', {
  id: serial('id').primaryKey(),
  newDistrict: text('New_district'),
  newUdiseType: text('New_udise_type'),
  newUdiseCode: text('New_udise_code'),
  newSchoolName: text('New_school_name'),
  groupCode: text('Group_code'),
  groupDesc: text('Group_desc'),
  classLevel: integer('class_level'),
  gender: text('gender'),
  medium: text('medium'),
  community: text('community'),
  vacancyRefNo: integer('Vacancy_Ref_no'),
  vacancyStatus: text('Vacancy_status'),
  updateStatusBefore: text('Update_status_before'),
  updateStatusAfter: text('Update_status_after'),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
