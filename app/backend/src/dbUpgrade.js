import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_INSECURE !== 'true' } : undefined });
const once = sql => `DO $$ BEGIN ${sql}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`;

const required = [
  `ALTER TABLE users DROP COLUMN IF EXISTS session_id`,
  `ALTER TABLE users DROP COLUMN IF EXISTS session_started_at`,
  `ALTER TABLE users DROP COLUMN IF EXISTS session_last_seen`,
  `ALTER TABLE users DROP COLUMN IF EXISTS session_ip`,
  once(`ALTER TABLE vacancies ADD CONSTRAINT vacancies_nonneg_chk CHECK (admitted >= 0 AND vacancies >= 0) NOT VALID`),
  `ALTER TABLE students ADD COLUMN IF NOT EXISTS replaces_regno integer`,
  `CREATE TABLE IF NOT EXISTS tc_requests (
     id serial PRIMARY KEY, student_id integer NOT NULL, reason text NOT NULL, letter_name text NOT NULL, letter_path text NOT NULL,
     status text NOT NULL DEFAULT 'PENDING', requested_by text NOT NULL, requested_at timestamp NOT NULL DEFAULT now(),
     reviewed_by text, reviewed_at timestamp, review_remarks text)`,
  `CREATE INDEX IF NOT EXISTS tc_requests_student_idx ON tc_requests (student_id, id)`,
  `CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_logs (action)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
     id serial PRIMARY KEY, at timestamp NOT NULL DEFAULT now(), actor text NOT NULL, role text, action text NOT NULL,
     level text NOT NULL DEFAULT 'INFO', message text NOT NULL, regno integer, student_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
     undo jsonb, revoked_at timestamp, revoked_by text, revoke_remarks text)`,
  `CREATE INDEX IF NOT EXISTS audit_at_idx ON audit_logs (at)`,
  `CREATE INDEX IF NOT EXISTS audit_regno_idx ON audit_logs (regno)`,
  `CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_logs (actor)`,
  `CREATE INDEX IF NOT EXISTS students_class_admit_idx ON students (class_level, admit_status)`,
  `CREATE INDEX IF NOT EXISTS students_class_select_idx ON students (class_level, select_status)`,
  `CREATE INDEX IF NOT EXISTS students_district_idx ON students (district, class_level)`,
  once(`ALTER TABLE students ADD CONSTRAINT students_class_chk CHECK (class_level IN (9, 10)) NOT VALID`),
  once(`ALTER TABLE students ADD CONSTRAINT students_gender_chk CHECK (gender IN ('Boy', 'Girl')) NOT VALID`),
  once(`ALTER TABLE users ADD CONSTRAINT users_role_chk CHECK (role IN ('SUPER_ADMIN', 'REGION', 'DISTRICT')) NOT VALID`),
];
const optional = [
  `CREATE INDEX IF NOT EXISTS status_logs_student_idx ON status_logs (student_id, changed_at DESC)`,
  `DELETE FROM status_logs WHERE student_id NOT IN (SELECT id FROM students)`,
  once(`ALTER TABLE status_logs ADD CONSTRAINT status_logs_student_fk FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE`),
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE INDEX IF NOT EXISTS students_name_trgm ON students USING gin (name gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS students_emis_trgm ON students USING gin (emis_no gin_trgm_ops)`,
];
try {
  for (const q of required) await pool.query(q);
  for (const q of optional) { try { await pool.query(q); } catch (e) { console.warn('Skipped (optional):', q.slice(0, 60).replace(/\s+/g, ' '), '-', e.message); } }
  console.log('Database is up to date.');
} catch (e) { console.error('Upgrade failed:', e.message); process.exitCode = 1; }
finally { await pool.end(); }
