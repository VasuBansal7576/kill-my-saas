CREATE TYPE "public"."communication_kind" AS ENUM('transactional', 'campaign', 'reminder', 'calendar');--> statement-breakpoint
CREATE TYPE "public"."communication_status" AS ENUM('draft', 'queued', 'sending', 'complete', 'partial_failure', 'failed', 'blocked_external');--> statement-breakpoint
CREATE TYPE "public"."delivery_attempt_status" AS ENUM('sending', 'accepted', 'failed', 'blocked_external');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sending', 'accepted', 'delivered', 'bounced', 'failed', 'blocked_external');--> statement-breakpoint
CREATE TYPE "public"."deliverable_status" AS ENUM('pending', 'submitted', 'changes_requested', 'approved');--> statement-breakpoint
CREATE TYPE "public"."file_bundle_status" AS ENUM('pending', 'building', 'ready', 'failed', 'blocked_external');--> statement-breakpoint
CREATE TYPE "public"."file_upload_status" AS ENUM('authorized', 'uploaded', 'finalized', 'rejected', 'blocked_external', 'expired');--> statement-breakpoint
CREATE TYPE "public"."file_verification_status" AS ENUM('quarantined', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "calendar_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"placement_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"sequence" integer NOT NULL,
	"uid" text NOT NULL,
	"method" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text DEFAULT 'text/calendar; charset=utf-8; method=REQUEST' NOT NULL,
	"icalendar" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"communication_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"calendar_artifact_id" uuid,
	"to_email" text,
	"to_name" text NOT NULL,
	"merge_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rendered_subject" text NOT NULL,
	"rendered_html" text NOT NULL,
	"rendered_text" text NOT NULL,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_error_message" text,
	"accepted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_outcome_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"subject_template" text NOT NULL,
	"html_template" text NOT NULL,
	"text_template" text NOT NULL,
	"merge_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"template_id" uuid,
	"name" text NOT NULL,
	"kind" "communication_kind" NOT NULL,
	"status" "communication_status" DEFAULT 'draft' NOT NULL,
	"subject_template" text NOT NULL,
	"html_template" text NOT NULL,
	"text_template" text NOT NULL,
	"audience_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"requested_by_person_id" uuid,
	"scheduled_for" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"provider" text DEFAULT 'brevo' NOT NULL,
	"status" "delivery_attempt_status" NOT NULL,
	"provider_message_id" text,
	"failure_code" text,
	"failure_message" text,
	"response_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"provider" text DEFAULT 'brevo' NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider_message_id" text NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverable_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deliverable_id" uuid NOT NULL,
	"from_status" "deliverable_status",
	"to_status" "deliverable_status" NOT NULL,
	"actor_person_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverable_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deliverable_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"file_object_id" uuid NOT NULL,
	"uploaded_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"task_assignment_id" uuid,
	"event_speaker_id" uuid NOT NULL,
	"session_id" uuid,
	"status" "deliverable_status" DEFAULT 'pending' NOT NULL,
	"latest_version" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_bundle_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"requested_by_person_id" uuid NOT NULL,
	"status" "file_bundle_status" DEFAULT 'pending' NOT NULL,
	"selection" jsonb NOT NULL,
	"storage_key" text,
	"manifest" jsonb,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "file_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deliverable_version_id" uuid NOT NULL,
	"author_person_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"owner_person_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"verification_status" "file_verification_status" DEFAULT 'quarantined' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "file_upload_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"deliverable_id" uuid NOT NULL,
	"requested_by_person_id" uuid NOT NULL,
	"file_object_id" uuid NOT NULL,
	"status" "file_upload_status" DEFAULT 'authorized' NOT NULL,
	"idempotency_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone,
	"finalized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "speaker_profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"speaker_profile_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_artifacts" ADD CONSTRAINT "calendar_artifacts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_artifacts" ADD CONSTRAINT "calendar_artifacts_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_artifacts" ADD CONSTRAINT "calendar_artifacts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_calendar_artifact_id_calendar_artifacts_id_fk" FOREIGN KEY ("calendar_artifact_id") REFERENCES "public"."calendar_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_template_id_communication_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."communication_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_recipient_id_communication_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."communication_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_provider_events" ADD CONSTRAINT "delivery_provider_events_recipient_id_communication_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."communication_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_transitions" ADD CONSTRAINT "deliverable_transitions_deliverable_id_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_transitions" ADD CONSTRAINT "deliverable_transitions_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_deliverable_id_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_file_object_id_file_objects_id_fk" FOREIGN KEY ("file_object_id") REFERENCES "public"."file_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverable_versions" ADD CONSTRAINT "deliverable_versions_uploaded_by_person_id_people_id_fk" FOREIGN KEY ("uploaded_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_task_assignment_id_speaker_task_assignments_id_fk" FOREIGN KEY ("task_assignment_id") REFERENCES "public"."speaker_task_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_event_speaker_id_event_speakers_id_fk" FOREIGN KEY ("event_speaker_id") REFERENCES "public"."event_speakers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_bundle_exports" ADD CONSTRAINT "file_bundle_exports_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_bundle_exports" ADD CONSTRAINT "file_bundle_exports_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_comments" ADD CONSTRAINT "file_comments_deliverable_version_id_deliverable_versions_id_fk" FOREIGN KEY ("deliverable_version_id") REFERENCES "public"."deliverable_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_comments" ADD CONSTRAINT "file_comments_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_upload_authorizations" ADD CONSTRAINT "file_upload_authorizations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_upload_authorizations" ADD CONSTRAINT "file_upload_authorizations_deliverable_id_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_upload_authorizations" ADD CONSTRAINT "file_upload_authorizations_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_upload_authorizations" ADD CONSTRAINT "file_upload_authorizations_file_object_id_file_objects_id_fk" FOREIGN KEY ("file_object_id") REFERENCES "public"."file_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_profile_versions" ADD CONSTRAINT "speaker_profile_versions_speaker_profile_id_speaker_profiles_id_fk" FOREIGN KEY ("speaker_profile_id") REFERENCES "public"."speaker_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_profile_versions" ADD CONSTRAINT "speaker_profile_versions_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_artifacts_revision_unique" ON "calendar_artifacts" USING btree ("placement_id","person_id","revision");--> statement-breakpoint
CREATE INDEX "calendar_artifacts_person_idx" ON "calendar_artifacts" USING btree ("event_id","person_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_recipient_unique" ON "communication_recipients" USING btree ("communication_id","person_id");--> statement-breakpoint
CREATE INDEX "communication_recipients_provider_idx" ON "communication_recipients" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "communication_recipients_status_idx" ON "communication_recipients" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_templates_event_name_unique" ON "communication_templates" USING btree ("event_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "communications_idempotency_unique" ON "communications" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "communications_event_status_idx" ON "communications" USING btree ("event_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_attempt_number_unique" ON "delivery_attempts" USING btree ("recipient_id","attempt_number");--> statement-breakpoint
CREATE INDEX "delivery_attempt_provider_message_idx" ON "delivery_attempts" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_provider_event_unique" ON "delivery_provider_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "delivery_provider_event_message_idx" ON "delivery_provider_events" USING btree ("provider_message_id","occurred_at");--> statement-breakpoint
CREATE INDEX "deliverable_transitions_deliverable_created_idx" ON "deliverable_transitions" USING btree ("deliverable_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deliverable_versions_number_unique" ON "deliverable_versions" USING btree ("deliverable_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "deliverables_task_assignment_unique" ON "deliverables" USING btree ("task_assignment_id");--> statement-breakpoint
CREATE INDEX "deliverables_event_status_idx" ON "deliverables" USING btree ("event_id","status","due_at");--> statement-breakpoint
CREATE INDEX "file_bundle_exports_event_status_idx" ON "file_bundle_exports" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "file_comments_version_created_idx" ON "file_comments" USING btree ("deliverable_version_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "file_objects_storage_key_unique" ON "file_objects" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "file_objects_event_created_idx" ON "file_objects" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "file_upload_authorizations_event_idempotency_unique" ON "file_upload_authorizations" USING btree ("event_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "file_upload_authorizations_file_object_unique" ON "file_upload_authorizations" USING btree ("file_object_id");--> statement-breakpoint
CREATE INDEX "file_upload_authorizations_expiry_idx" ON "file_upload_authorizations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "speaker_profile_versions_number_unique" ON "speaker_profile_versions" USING btree ("speaker_profile_id","version");--> statement-breakpoint
CREATE INDEX "placements_revision_room_time_idx" ON "placements" USING btree ("revision_id","room_id","starts_at","ends_at");--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_positive_interval" CHECK ("placements"."ends_at" > "placements"."starts_at");