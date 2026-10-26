import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex, index, jsonb } from 'drizzle-orm/pg-core';

export const statusLogs = pgTable('status_logs', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').notNull(),
  field: text('field').notNull(), oldValue: text('old_value'), newValue: text('new_value'), remarks: text('remarks'),
  changedBy: text('changed_by'), changedAt: timestamp('changed_at').defaultNow().notNull(),
}, t => ({ byStudent: index('status_logs_student_idx').on(t.studentId, t.changedAt) }));
