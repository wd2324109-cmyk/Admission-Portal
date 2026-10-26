import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex, index, jsonb } from 'drizzle-orm/pg-core';

                                                                                               
export const studentDocuments = pgTable('student_documents', {
  id: serial('id').primaryKey(), studentId: integer('student_id').notNull(), docType: text('doc_type').notNull(),
  fileName: text('file_name').notNull(), filePath: text('file_path').notNull(),
  status: text('status').notNull().default('PENDING'),                                   
  uploadedBy: text('uploaded_by').notNull(), uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  reviewedBy: text('reviewed_by'), reviewedAt: timestamp('reviewed_at'), remarks: text('remarks'),
}, t => ({ stu: index('doc_student_idx').on(t.studentId) }));
