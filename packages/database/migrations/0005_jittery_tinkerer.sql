CREATE TYPE "public"."airtable_entity_type" AS ENUM('person', 'speaker', 'session');--> statement-breakpoint
CREATE TYPE "public"."airtable_field_owner" AS ENUM('programflow', 'airtable');--> statement-breakpoint
CREATE TYPE "public"."airtable_mapping_direction" AS ENUM('export', 'import', 'both');--> statement-breakpoint
CREATE TYPE "public"."airtable_sync_direction" AS ENUM('export', 'import');--> statement-breakpoint
CREATE TYPE "public"."airtable_sync_item_status" AS ENUM('synced', 'skipped', 'conflict', 'failed', 'blocked_external');--> statement-breakpoint
CREATE TYPE "public"."airtable_sync_operation" AS ENUM('create', 'update', 'import', 'skip', 'configuration');--> statement-breakpoint
CREATE TYPE "public"."airtable_sync_status" AS ENUM('queued', 'running', 'succeeded', 'partial', 'failed', 'blocked_external');--> statement-breakpoint
CREATE TYPE "public"."crm_contact_source" AS ENUM('manual', 'csv', 'event');--> statement-breakpoint
CREATE TYPE "public"."crm_outreach_status" AS ENUM('pending_handoff', 'consumed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."crm_pipeline_outcome" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."public_widget_type" AS ENUM('sessions', 'speakers', 'agenda', 'itinerary', 'speaker_gallery');--> statement-breakpoint
CREATE TABLE "airtable_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"base_id" text,
	"table_id" text,
	"credential_binding" text DEFAULT 'AIRTABLE_TOKEN' NOT NULL,
	"modified_time_field" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"page_size" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "airtable_external_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuration_id" uuid NOT NULL,
	"entity_type" "airtable_entity_type" NOT NULL,
	"canonical_id" uuid NOT NULL,
	"airtable_record_id" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"external_modified_at" timestamp with time zone NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "airtable_field_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuration_id" uuid NOT NULL,
	"entity_type" "airtable_entity_type" NOT NULL,
	"local_field" text NOT NULL,
	"external_field" text NOT NULL,
	"direction" "airtable_mapping_direction" NOT NULL,
	"owner" "airtable_field_owner" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "airtable_record_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuration_id" uuid NOT NULL,
	"entity_type" "airtable_entity_type" NOT NULL,
	"canonical_id" uuid NOT NULL,
	"airtable_record_id" text NOT NULL,
	"canonical_revision" integer,
	"canonical_fingerprint" text,
	"external_modified_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "airtable_sync_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"entity_type" "airtable_entity_type",
	"canonical_id" uuid,
	"airtable_record_id" text,
	"operation" "airtable_sync_operation" NOT NULL,
	"status" "airtable_sync_item_status" NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"provider_responded" boolean DEFAULT false NOT NULL,
	"error_code" text,
	"error_message" text,
	"request_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "airtable_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuration_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"direction" "airtable_sync_direction" NOT NULL,
	"status" "airtable_sync_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"exported_count" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"provider_responded" boolean DEFAULT false NOT NULL,
	"provider_request_count" integer DEFAULT 0 NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contact_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"primary_contact_id" uuid NOT NULL,
	"merged_contact_id" uuid NOT NULL,
	"primary_person_id" uuid NOT NULL,
	"merged_person_id" uuid NOT NULL,
	"merged_by_person_id" uuid NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contact_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"author_person_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"source" "crm_contact_source" DEFAULT 'manual' NOT NULL,
	"internal_notes" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"merged_into_contact_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_event_speaker_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"event_speaker_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"reused_existing_speaker" boolean NOT NULL,
	"requested_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_outreach_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"subject_template" text NOT NULL,
	"html_template" text NOT NULL,
	"text_template" text NOT NULL,
	"selected_contact_ids" jsonb NOT NULL,
	"recipient_snapshot" jsonb NOT NULL,
	"status" "crm_outreach_status" DEFAULT 'pending_handoff' NOT NULL,
	"idempotency_key" text NOT NULL,
	"requested_by_person_id" uuid NOT NULL,
	"consumed_communication_id" uuid,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_pipeline_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"enrolled_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_pipeline_stage_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"from_stage_id" uuid,
	"to_stage_id" uuid NOT NULL,
	"moved_by_person_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"outcome" "crm_pipeline_outcome" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_pipelines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_saved_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filter_definition" jsonb NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendee_itineraries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"recovery_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendee_itinerary_items" (
	"itinerary_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendee_itinerary_items_itinerary_id_session_id_pk" PRIMARY KEY("itinerary_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "widget_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"widget_type" "public_widget_type" NOT NULL,
	"branding" jsonb NOT NULL,
	"filters" jsonb DEFAULT '{"trackIds":[],"formatIds":[],"roomIds":[]}'::jsonb NOT NULL,
	"fields" jsonb NOT NULL,
	"output_formats" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "last_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "airtable_configurations" ADD CONSTRAINT "airtable_configurations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtable_configurations" ADD CONSTRAINT "airtable_configurations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtable_external_attributes" ADD CONSTRAINT "airtable_external_attributes_configuration_id_airtable_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."airtable_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtable_field_mappings" ADD CONSTRAINT "airtable_field_mappings_configuration_id_airtable_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."airtable_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtable_record_links" ADD CONSTRAINT "airtable_record_links_configuration_id_airtable_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."airtable_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtable_sync_items" ADD CONSTRAINT "airtable_sync_items_run_id_airtable_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."airtable_sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtable_sync_runs" ADD CONSTRAINT "airtable_sync_runs_configuration_id_airtable_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."airtable_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtable_sync_runs" ADD CONSTRAINT "airtable_sync_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtable_sync_runs" ADD CONSTRAINT "airtable_sync_runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_merges" ADD CONSTRAINT "crm_contact_merges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_merges" ADD CONSTRAINT "crm_contact_merges_primary_contact_id_crm_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_merges" ADD CONSTRAINT "crm_contact_merges_merged_contact_id_crm_contacts_id_fk" FOREIGN KEY ("merged_contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_merges" ADD CONSTRAINT "crm_contact_merges_primary_person_id_people_id_fk" FOREIGN KEY ("primary_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_merges" ADD CONSTRAINT "crm_contact_merges_merged_person_id_people_id_fk" FOREIGN KEY ("merged_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_merges" ADD CONSTRAINT "crm_contact_merges_merged_by_person_id_people_id_fk" FOREIGN KEY ("merged_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_notes" ADD CONSTRAINT "crm_contact_notes_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contact_notes" ADD CONSTRAINT "crm_contact_notes_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_event_speaker_handoffs" ADD CONSTRAINT "crm_event_speaker_handoffs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_event_speaker_handoffs" ADD CONSTRAINT "crm_event_speaker_handoffs_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_event_speaker_handoffs" ADD CONSTRAINT "crm_event_speaker_handoffs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_event_speaker_handoffs" ADD CONSTRAINT "crm_event_speaker_handoffs_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_event_speaker_handoffs" ADD CONSTRAINT "crm_event_speaker_handoffs_event_speaker_id_event_speakers_id_fk" FOREIGN KEY ("event_speaker_id") REFERENCES "public"."event_speakers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_event_speaker_handoffs" ADD CONSTRAINT "crm_event_speaker_handoffs_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_outreach_requests" ADD CONSTRAINT "crm_outreach_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_outreach_requests" ADD CONSTRAINT "crm_outreach_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_outreach_requests" ADD CONSTRAINT "crm_outreach_requests_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_enrollments" ADD CONSTRAINT "crm_pipeline_enrollments_pipeline_id_crm_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_enrollments" ADD CONSTRAINT "crm_pipeline_enrollments_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_enrollments" ADD CONSTRAINT "crm_pipeline_enrollments_stage_id_crm_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."crm_pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_enrollments" ADD CONSTRAINT "crm_pipeline_enrollments_enrolled_by_person_id_people_id_fk" FOREIGN KEY ("enrolled_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stage_transitions" ADD CONSTRAINT "crm_pipeline_stage_transitions_enrollment_id_crm_pipeline_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."crm_pipeline_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stage_transitions" ADD CONSTRAINT "crm_pipeline_stage_transitions_from_stage_id_crm_pipeline_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."crm_pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stage_transitions" ADD CONSTRAINT "crm_pipeline_stage_transitions_to_stage_id_crm_pipeline_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."crm_pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stage_transitions" ADD CONSTRAINT "crm_pipeline_stage_transitions_moved_by_person_id_people_id_fk" FOREIGN KEY ("moved_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stages" ADD CONSTRAINT "crm_pipeline_stages_pipeline_id_crm_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipelines" ADD CONSTRAINT "crm_pipelines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_saved_segments" ADD CONSTRAINT "crm_saved_segments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_saved_segments" ADD CONSTRAINT "crm_saved_segments_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendee_itineraries" ADD CONSTRAINT "attendee_itineraries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendee_itinerary_items" ADD CONSTRAINT "attendee_itinerary_items_itinerary_id_attendee_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."attendee_itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendee_itinerary_items" ADD CONSTRAINT "attendee_itinerary_items_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_configurations" ADD CONSTRAINT "widget_configurations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "airtable_configuration_event_unique" ON "airtable_configurations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "airtable_configuration_organization_idx" ON "airtable_configurations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "airtable_external_attributes_canonical_unique" ON "airtable_external_attributes" USING btree ("configuration_id","entity_type","canonical_id");--> statement-breakpoint
CREATE UNIQUE INDEX "airtable_field_mapping_local_unique" ON "airtable_field_mappings" USING btree ("configuration_id","entity_type","local_field");--> statement-breakpoint
CREATE UNIQUE INDEX "airtable_field_mapping_external_unique" ON "airtable_field_mappings" USING btree ("configuration_id","entity_type","external_field");--> statement-breakpoint
CREATE UNIQUE INDEX "airtable_record_link_canonical_unique" ON "airtable_record_links" USING btree ("configuration_id","entity_type","canonical_id");--> statement-breakpoint
CREATE UNIQUE INDEX "airtable_record_link_external_unique" ON "airtable_record_links" USING btree ("configuration_id","airtable_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "airtable_sync_item_idempotency_unique" ON "airtable_sync_items" USING btree ("run_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "airtable_sync_item_run_status_idx" ON "airtable_sync_items" USING btree ("run_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "airtable_sync_run_idempotency_unique" ON "airtable_sync_runs" USING btree ("configuration_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "airtable_sync_run_event_created_idx" ON "airtable_sync_runs" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_contact_merges_merged_unique" ON "crm_contact_merges" USING btree ("merged_contact_id");--> statement-breakpoint
CREATE INDEX "crm_contact_merges_primary_idx" ON "crm_contact_merges" USING btree ("primary_contact_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_contact_notes_contact_idx" ON "crm_contact_notes" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_contacts_organization_person_unique" ON "crm_contacts" USING btree ("organization_id","person_id");--> statement-breakpoint
CREATE INDEX "crm_contacts_organization_active_idx" ON "crm_contacts" USING btree ("organization_id","merged_into_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_event_speaker_handoffs_idempotency_unique" ON "crm_event_speaker_handoffs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "crm_event_speaker_handoffs_contact_idx" ON "crm_event_speaker_handoffs" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_outreach_requests_idempotency_unique" ON "crm_outreach_requests" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "crm_outreach_requests_pending_idx" ON "crm_outreach_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipeline_enrollments_contact_unique" ON "crm_pipeline_enrollments" USING btree ("pipeline_id","contact_id");--> statement-breakpoint
CREATE INDEX "crm_pipeline_enrollments_stage_idx" ON "crm_pipeline_enrollments" USING btree ("stage_id","updated_at");--> statement-breakpoint
CREATE INDEX "crm_pipeline_transitions_enrollment_idx" ON "crm_pipeline_stage_transitions" USING btree ("enrollment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipeline_stages_position_unique" ON "crm_pipeline_stages" USING btree ("pipeline_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipeline_stages_name_unique" ON "crm_pipeline_stages" USING btree ("pipeline_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipelines_organization_name_unique" ON "crm_pipelines" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "crm_pipelines_organization_default_idx" ON "crm_pipelines" USING btree ("organization_id","is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_saved_segments_organization_name_unique" ON "crm_saved_segments" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "attendee_itineraries_recovery_unique" ON "attendee_itineraries" USING btree ("recovery_token_hash");--> statement-breakpoint
CREATE INDEX "attendee_itineraries_event_idx" ON "attendee_itineraries" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "attendee_itinerary_items_session_idx" ON "attendee_itinerary_items" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "widget_configurations_event_slug_unique" ON "widget_configurations" USING btree ("event_id","slug");--> statement-breakpoint
CREATE INDEX "widget_configurations_event_type_idx" ON "widget_configurations" USING btree ("event_id","widget_type");--> statement-breakpoint
CREATE UNIQUE INDEX "publications_idempotency_unique" ON "publications" USING btree ("last_idempotency_key");