DO $$ BEGIN
 CREATE TYPE "public"."submission_triage_state" AS ENUM('unreviewed', 'maybe');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "triage_state" "submission_triage_state" DEFAULT 'unreviewed' NOT NULL;
