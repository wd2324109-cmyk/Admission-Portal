-- Student file tables (one per class), same pattern as Students_master_9th / Students_master_10th.
-- Each upload (document or letter) inserts one row; the newest row for a student + file_group + file_type is the current file.
-- file_url is the CloudFront address: https://d2n7f898nmjqsn.cloudfront.net/<path returned by the presigned URL>

-- PRODUCTION (schema core, prefix enrollment_)
CREATE TABLE IF NOT EXISTS "core"."enrollment_student_files_9th" (
  "id" SERIAL PRIMARY KEY,
  "student_id" INTEGER,
  "emis" INTEGER,
  "file_group" TEXT,
  "file_type" TEXT,
  "file_name" TEXT,
  "file_url" TEXT,
  "uploaded_by" TEXT,
  "uploaded_at" TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "core"."enrollment_student_files_10th" (
  "id" SERIAL PRIMARY KEY,
  "student_id" INTEGER,
  "emis" INTEGER,
  "file_group" TEXT,
  "file_type" TEXT,
  "file_name" TEXT,
  "file_url" TEXT,
  "uploaded_by" TEXT,
  "uploaded_at" TIMESTAMP
);
CREATE INDEX IF NOT EXISTS student_files_9th_lookup_idx ON "core"."enrollment_student_files_9th" (student_id, file_group, file_type, id);
CREATE INDEX IF NOT EXISTS student_files_10th_lookup_idx ON "core"."enrollment_student_files_10th" (student_id, file_group, file_type, id);

-- TEST DATABASE (default schema, no prefix): created by node src/dbSetup.js. Manual equivalent:
-- CREATE TABLE IF NOT EXISTS "Student_files_9th" ("id" SERIAL PRIMARY KEY, "student_id" INTEGER, "emis" INTEGER, "file_group" TEXT, "file_type" TEXT, "file_name" TEXT, "file_url" TEXT, "uploaded_by" TEXT, "uploaded_at" TIMESTAMP);
-- CREATE TABLE IF NOT EXISTS "Student_files_10th" ("id" SERIAL PRIMARY KEY, "student_id" INTEGER, "emis" INTEGER, "file_group" TEXT, "file_type" TEXT, "file_name" TEXT, "file_url" TEXT, "uploaded_by" TEXT, "uploaded_at" TIMESTAMP);
