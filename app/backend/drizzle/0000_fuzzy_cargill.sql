CREATE TABLE IF NOT EXISTS "status_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"remarks" text,
	"changed_by" text,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"regno" integer NOT NULL,
	"emis_no" text NOT NULL,
	"name" text NOT NULL,
	"dob" text,
	"gender" text NOT NULL,
	"class_level" integer NOT NULL,
	"district" text NOT NULL,
	"regional_centre" text NOT NULL,
	"school_name" text,
	"community" text NOT NULL,
	"medium" text NOT NULL,
	"disability" boolean DEFAULT false NOT NULL,
	"total" integer NOT NULL,
	"orank" integer NOT NULL,
	"phone" text,
	"select_status" text DEFAULT '',
	"selected_category" text DEFAULT '',
	"admit_status" text DEFAULT '',
	"willing_status" text DEFAULT 'WILLING' NOT NULL,
	"unwilling_letter" text,
	"verification_status" text DEFAULT 'PENDING' NOT NULL,
	"verification_remarks" text,
	"replaces_regno" integer,
	CONSTRAINT "students_regno_unique" UNIQUE("regno")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tc_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"reason" text NOT NULL,
	"letter_name" text NOT NULL,
	"letter_path" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"review_remarks" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"region" text,
	"district" text,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vacancies" (
	"id" serial PRIMARY KEY NOT NULL,
	"regional_centre" text NOT NULL,
	"class_level" integer NOT NULL,
	"gender" text NOT NULL,
	"medium" text NOT NULL,
	"community" text NOT NULL,
	"admitted" integer DEFAULT 0 NOT NULL,
	"vacancies" integer DEFAULT 0 NOT NULL,
	"filled" integer,
	"balance" integer,
	"status" text DEFAULT ''
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cell_idx" ON "students" USING btree ("regional_centre","class_level","gender","medium");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vac_uniq" ON "vacancies" USING btree ("regional_centre","class_level","gender","medium","community");