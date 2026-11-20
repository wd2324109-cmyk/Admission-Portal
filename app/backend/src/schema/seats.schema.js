import { pgView, text, integer } from 'drizzle-orm/pg-core';

export const seats = pgView('seats', {
  seatCode: text('seat_code'), regionalCentre: text('regional_centre'), classLevel: integer('class_level'), gender: text('gender'),
  medium: text('medium'), community: text('community'), seatNo: integer('seat_no'), status: text('status'),
  studentId: integer('student_id'), regno: integer('regno'), studentName: text('student_name'), studentDistrict: text('student_district'),
}).existing();
