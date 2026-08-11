CREATE TYPE "public"."form_field_type" AS ENUM('short_text', 'long_text', 'select', 'multi_select', 'checkbox', 'date', 'file');--> statement-breakpoint
CREATE TYPE "public"."form_status" AS ENUM('draft', 'published', 'closed');--> statement-breakpoint
CREATE TYPE "public"."form_target" AS ENUM('abstract', 'session');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('author', 'co_author', 'presenter');--> statement-breakpoint
CREATE TYPE "public"."submission_state" AS ENUM('draft', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."decision_outcome" AS ENUM('accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."review_assignment_status" AS ENUM('assigned', 'in_progress', 'submitted', 'recused');--> statement-breakpoint
CREATE TYPE "public"."review_round_status" AS ENUM('draft', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."event_speaker_status" AS ENUM('invited', 'onboarding', 'ready', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."task_assignment_status" AS ENUM('pending', 'complete');--> statement-breakpoint
CREATE TYPE "public"."speaker_task_kind" AS ENUM('action', 'form', 'file_request');--> statement-breakpoint
CREATE TYPE "public"."session_content_status" AS ENUM('draft', 'in_review', 'approved');--> statement-breakpoint
CREATE TYPE "public"."schedule_revision_status" AS ENUM('draft', 'ready');--> statement-breakpoint
CREATE TYPE "public"."publication_state" AS ENUM('draft', 'live', 'paused');--> statement-breakpoint
CREATE TABLE "cfp_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target" "form_target" NOT NULL,
	"status" "form_status" DEFAULT 'draft' NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"welcome_copy" text DEFAULT '' NOT NULL,
	"instructions_copy" text DEFAULT '' NOT NULL,
	"success_copy" text DEFAULT '' NOT NULL,
	"allow_drafts" boolean DEFAULT true NOT NULL,
	"max_submissions_per_person" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" "form_field_type" NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"condition" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"person_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "participant_role" NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"answers" jsonb NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"submitter_person_id" uuid,
	"title" text NOT NULL,
	"state" "submission_state" DEFAULT 'draft' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"outcome" "decision_outcome" NOT NULL,
	"decided_by_person_id" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_person_id" uuid NOT NULL,
	"status" "review_assignment_status" DEFAULT 'assigned' NOT NULL,
	"recusal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"scores" jsonb NOT NULL,
	"weighted_score" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "review_round_status" DEFAULT 'draft' NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"blind_policy" text DEFAULT 'double_blind' NOT NULL,
	"scorecard" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_speakers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" "event_speaker_status" DEFAULT 'invited' NOT NULL,
	"invitation_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speaker_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"biography" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"job_title" text DEFAULT '' NOT NULL,
	"headshot_file_id" uuid,
	"social_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speaker_task_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"event_speaker_id" uuid NOT NULL,
	"status" "task_assignment_status" DEFAULT 'pending' NOT NULL,
	"response" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speaker_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "speaker_task_kind" NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"due_at" timestamp with time zone,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_speakers" (
	"session_id" uuid NOT NULL,
	"event_speaker_id" uuid NOT NULL,
	"role" text DEFAULT 'speaker' NOT NULL,
	CONSTRAINT "session_speakers_session_id_event_speaker_id_pk" PRIMARY KEY("session_id","event_speaker_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"source_submission_id" uuid,
	"title" text NOT NULL,
	"abstract" text DEFAULT '' NOT NULL,
	"content_status" "session_content_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "schedule_revision_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"state" "publication_state" DEFAULT 'draft' NOT NULL,
	"schedule_revision_id" uuid,
	"public_revision" integer DEFAULT 0 NOT NULL,
	"live_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cfp_forms" ADD CONSTRAINT "cfp_forms_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_form_id_cfp_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."cfp_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_participants" ADD CONSTRAINT "submission_participants_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_participants" ADD CONSTRAINT "submission_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_form_id_cfp_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."cfp_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitter_person_id_people_id_fk" FOREIGN KEY ("submitter_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_decided_by_person_id_people_id_fk" FOREIGN KEY ("decided_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_round_id_review_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."review_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_reviewer_person_id_people_id_fk" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_assignment_id_review_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."review_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rounds" ADD CONSTRAINT "review_rounds_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_speakers" ADD CONSTRAINT "event_speakers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_speakers" ADD CONSTRAINT "event_speakers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_profiles" ADD CONSTRAINT "speaker_profiles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_task_assignments" ADD CONSTRAINT "speaker_task_assignments_task_id_speaker_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."speaker_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_task_assignments" ADD CONSTRAINT "speaker_task_assignments_event_speaker_id_event_speakers_id_fk" FOREIGN KEY ("event_speaker_id") REFERENCES "public"."event_speakers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_tasks" ADD CONSTRAINT "speaker_tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_speakers" ADD CONSTRAINT "session_speakers_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_speakers" ADD CONSTRAINT "session_speakers_event_speaker_id_event_speakers_id_fk" FOREIGN KEY ("event_speaker_id") REFERENCES "public"."event_speakers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_source_submission_id_submissions_id_fk" FOREIGN KEY ("source_submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_revision_id_schedule_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."schedule_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_room_id_event_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."event_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_revisions" ADD CONSTRAINT "schedule_revisions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_schedule_revision_id_schedule_revisions_id_fk" FOREIGN KEY ("schedule_revision_id") REFERENCES "public"."schedule_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cfp_forms_event_name_unique" ON "cfp_forms" USING btree ("event_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "form_fields_key_unique" ON "form_fields" USING btree ("form_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "form_fields_order_unique" ON "form_fields" USING btree ("form_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_participant_email_unique" ON "submission_participants" USING btree ("submission_id","email");--> statement-breakpoint
CREATE INDEX "submission_participant_person_idx" ON "submission_participants" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_versions_number_unique" ON "submission_versions" USING btree ("submission_id","version");--> statement-breakpoint
CREATE INDEX "submissions_event_state_idx" ON "submissions" USING btree ("event_id","state");--> statement-breakpoint
CREATE INDEX "submissions_submitter_idx" ON "submissions" USING btree ("submitter_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "decisions_submission_unique" ON "decisions" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_assignment_unique" ON "review_assignments" USING btree ("round_id","submission_id","reviewer_person_id");--> statement-breakpoint
CREATE INDEX "review_assignments_reviewer_status_idx" ON "review_assignments" USING btree ("reviewer_person_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "review_response_assignment_unique" ON "review_responses" USING btree ("assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_rounds_event_name_unique" ON "review_rounds" USING btree ("event_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "event_speakers_event_person_unique" ON "event_speakers" USING btree ("event_id","person_id");--> statement-breakpoint
CREATE INDEX "event_speakers_event_status_idx" ON "event_speakers" USING btree ("event_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "speaker_profiles_person_unique" ON "speaker_profiles" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "speaker_task_assignment_unique" ON "speaker_task_assignments" USING btree ("task_id","event_speaker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_source_submission_unique" ON "sessions" USING btree ("source_submission_id");--> statement-breakpoint
CREATE INDEX "sessions_event_status_idx" ON "sessions" USING btree ("event_id","content_status");--> statement-breakpoint
CREATE UNIQUE INDEX "placement_revision_session_unique" ON "placements" USING btree ("revision_id","session_id");--> statement-breakpoint
CREATE INDEX "placements_revision_time_idx" ON "placements" USING btree ("revision_id","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_revision_version_unique" ON "schedule_revisions" USING btree ("event_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "publications_event_unique" ON "publications" USING btree ("event_id");