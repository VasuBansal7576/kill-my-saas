CREATE TYPE "public"."review_ai_assessment_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."speaker_resource_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "cfp_form_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"published_by_person_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"outcome" "decision_outcome" NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"actor_person_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_ai_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"status" "review_ai_assessment_status" DEFAULT 'pending' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"score" integer,
	"reasoning" text,
	"failure_code" text,
	"human_override_score" integer,
	"human_override_reason" text,
	"overridden_by_person_id" uuid,
	"overridden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_person_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"declared_by_person_id" uuid NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_round_reviewers" (
	"round_id" uuid NOT NULL,
	"reviewer_person_id" uuid NOT NULL,
	"assignment_cap" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_round_reviewers_round_id_reviewer_person_id_pk" PRIMARY KEY("round_id","reviewer_person_id")
);
--> statement-breakpoint
CREATE TABLE "speaker_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"content_html" text DEFAULT '' NOT NULL,
	"status" "speaker_resource_status" DEFAULT 'draft' NOT NULL,
	"visible_to_statuses" jsonb DEFAULT '["invited","onboarding","ready"]'::jsonb NOT NULL,
	"allowed_embed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"abstract" text DEFAULT '' NOT NULL,
	"content_status" "session_content_status" NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_responses" RENAME COLUMN "scores" TO "answers";--> statement-breakpoint
ALTER TABLE "review_responses" ALTER COLUMN "weighted_score" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "review_responses" ALTER COLUMN "submitted_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "review_rounds" ALTER COLUMN "opens_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review_rounds" ALTER COLUMN "closes_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cfp_forms" ADD COLUMN "allow_multiple_drafts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "cfp_forms" ADD COLUMN "drafts_count_toward_limit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cfp_forms" ADD COLUMN "allow_submitted_edits" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "cfp_forms" ADD COLUMN "confirmation_email_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "cfp_forms" ADD COLUMN "draft_reminder_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "cfp_forms" ADD COLUMN "draft_reminder_lead_hours" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
ALTER TABLE "cfp_forms" ADD COLUMN "minimum_participants" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "cfp_forms" ADD COLUMN "maximum_participants" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "cfp_forms" ADD COLUMN "participant_role_labels" jsonb DEFAULT '{"author":"Primary author","co_author":"Co-author","presenter":"Presenter"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cfp_forms" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "form_version_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "routing_key" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "idempotency_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "review_responses" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_responses" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "review_rounds" ADD COLUMN "plan_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "event_speakers" ADD COLUMN "logistics" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "speaker_task_assignments" ADD COLUMN "due_at_override" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "speaker_tasks" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "track_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "format_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "cfp_form_versions" ADD CONSTRAINT "cfp_form_versions_form_id_cfp_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."cfp_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cfp_form_versions" ADD CONSTRAINT "cfp_form_versions_published_by_person_id_people_id_fk" FOREIGN KEY ("published_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_audit_events" ADD CONSTRAINT "decision_audit_events_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_audit_events" ADD CONSTRAINT "decision_audit_events_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_ai_assessments" ADD CONSTRAINT "review_ai_assessments_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_ai_assessments" ADD CONSTRAINT "review_ai_assessments_round_id_review_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."review_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_ai_assessments" ADD CONSTRAINT "review_ai_assessments_overridden_by_person_id_people_id_fk" FOREIGN KEY ("overridden_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_conflicts" ADD CONSTRAINT "review_conflicts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_conflicts" ADD CONSTRAINT "review_conflicts_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_conflicts" ADD CONSTRAINT "review_conflicts_reviewer_person_id_people_id_fk" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_conflicts" ADD CONSTRAINT "review_conflicts_declared_by_person_id_people_id_fk" FOREIGN KEY ("declared_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_plans" ADD CONSTRAINT "review_plans_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_round_reviewers" ADD CONSTRAINT "review_round_reviewers_round_id_review_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."review_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_round_reviewers" ADD CONSTRAINT "review_round_reviewers_reviewer_person_id_people_id_fk" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_resources" ADD CONSTRAINT "speaker_resources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_versions" ADD CONSTRAINT "session_versions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_versions" ADD CONSTRAINT "session_versions_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cfp_form_versions_number_unique" ON "cfp_form_versions" USING btree ("form_id","version");--> statement-breakpoint
CREATE INDEX "cfp_form_versions_published_idx" ON "cfp_form_versions" USING btree ("form_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "decision_audit_idempotency_unique" ON "decision_audit_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "decision_audit_decision_idx" ON "decision_audit_events" USING btree ("decision_id","created_at");--> statement-breakpoint
CREATE INDEX "review_ai_assessments_submission_idx" ON "review_ai_assessments" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "review_ai_assessments_round_idx" ON "review_ai_assessments" USING btree ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_conflicts_active_unique" ON "review_conflicts" USING btree ("submission_id","reviewer_person_id") WHERE resolved_at is null;--> statement-breakpoint
CREATE INDEX "review_conflicts_event_idx" ON "review_conflicts" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_plans_event_name_unique" ON "review_plans" USING btree ("event_id","name");--> statement-breakpoint
CREATE INDEX "review_round_reviewers_person_idx" ON "review_round_reviewers" USING btree ("reviewer_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "speaker_resources_event_slug_unique" ON "speaker_resources" USING btree ("event_id","slug");--> statement-breakpoint
CREATE INDEX "speaker_resources_event_status_idx" ON "speaker_resources" USING btree ("event_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "session_versions_number_unique" ON "session_versions" USING btree ("session_id","version");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_form_version_id_cfp_form_versions_id_fk" FOREIGN KEY ("form_version_id") REFERENCES "public"."cfp_form_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_rounds" ADD CONSTRAINT "review_rounds_plan_id_review_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."review_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_track_id_event_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."event_tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_format_id_event_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."event_formats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_review_handoff_idx" ON "submissions" USING btree ("event_id","state","routing_key");--> statement-breakpoint
CREATE UNIQUE INDEX "decisions_idempotency_unique" ON "decisions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "review_assignments_round_status_idx" ON "review_assignments" USING btree ("round_id","status");--> statement-breakpoint
CREATE INDEX "review_rounds_plan_idx" ON "review_rounds" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "speaker_tasks_event_idempotency_unique" ON "speaker_tasks" USING btree ("event_id","idempotency_key");