import { serial, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { table } from './table.js';

const files = () => ({
  id: serial('id').primaryKey(), studentId: integer('student_id'), emis: integer('emis'),
  fileGroup: text('file_group'), fileType: text('file_type'), fileName: text('file_name'), fileUrl: text('file_url'),
  uploadedBy: text('uploaded_by'), uploadedAt: timestamp('uploaded_at'),
});
export const studentFiles9th = table('Student_files_9th', files());
export const studentFiles10th = table('Student_files_10th', files());
