import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex, index, jsonb } from 'drizzle-orm/pg-core';

                                                                                                          
export const tcRequests = pgTable('tc_requests', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').notNull(),
  reason: text('reason').notNull(),
  letterName: text('letter_name').notNull(), letterPath: text('letter_path').notNull(),
  status: text('status').notNull().default('PENDING'),                                   
  requestedBy: text('requested_by').notNull(), requestedAt: timestamp('requested_at').defaultNow().notNull(),
  reviewedBy: text('reviewed_by'), reviewedAt: timestamp('reviewed_at'), reviewRemarks: text('review_remarks'),


  stage: text('stage').notNull().default('REGION'),
  rejectedLevel: text('rejected_level'),
  rcBy: text('rc_by'), rcAt: timestamp('rc_at'), rcRemarks: text('rc_remarks'),
  scBy: text('sc_by'), scAt: timestamp('sc_at'), scRemarks: text('sc_remarks'),
}, t => ({ byStudent: index('tc_requests_student_idx').on(t.studentId, t.id) }));
