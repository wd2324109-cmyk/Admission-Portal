import { pgView, text, integer } from 'drizzle-orm/pg-core';

// The per-seat view is created by src/seatsView.js (run by db:upgrade). Declaring it here as `.existing()` only tells drizzle it is there,
// so `drizzle-kit push` does not drop it. This creates no table and changes no column.
export const seats = pgView('seats', {
  seatCode: text('seat_code'), regionalCentre: text('regional_centre'), classLevel: integer('class_level'), gender: text('gender'),
  medium: text('medium'), community: text('community'), seatNo: integer('seat_no'), status: text('status'),
  studentId: integer('student_id'), regno: integer('regno'), studentName: text('student_name'), studentDistrict: text('student_district'),
}).existing();
