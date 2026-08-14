CREATE TYPE "public"."accelevents_attempt_status" AS ENUM('succeeded', 'failed', 'blocked_external', 'not_sent');--> statement-breakpoint
CREATE TYPE "public"."accelevents_entity_type" AS ENUM('speaker', 'session');--> statement-breakpoint
CREATE TYPE "public"."accelevents_record_operation" AS ENUM('create', 'update', 'skip', 'validate');--> statement-breakpoint
CREATE TYPE "public"."accelevents_record_status" AS ENUM('pending', 'previewed', 'synced', 'skipped', 'failed', 'blocked_external');--> statement-breakpoint
CREATE TYPE "public"."accelevents_reference_type" AS ENUM('track', 'format');--> statement-breakpoint
CREATE TYPE "public"."accelevents_run_mode" AS ENUM('preview', 'manual', 'retry');--> statement-breakpoint
CREATE TYPE "public"."accelevents_run_status" AS ENUM('queued', 'running', 'succeeded', 'partial', 'failed', 'blocked_external');--> statement-breakpoint
CREATE TABLE "accelevents_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"external_event_url" text,
	"api_base_url" text DEFAULT 'https://api.accelevents.com' NOT NULL,
	"credential_binding" text DEFAULT 'ACCELEVENTS_API_TOKEN' NOT NULL,
	"authorization_header" text DEFAULT 'Authorization' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accelevents_field_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuration_id" uuid NOT NULL,
	"entity_type" "accelevents_entity_type" NOT NULL,
	"canonical_field" text NOT NULL,
	"external_field" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accelevents_record_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "accelevents_attempt_status" NOT NULL,
	"provider_responded" boolean DEFAULT false NOT NULL,
	"http_status" integer,
	"provider_request_id" text,
	"error_code" text,
	"error_message" text,
	"request_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accelevents_record_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuration_id" uuid NOT NULL,
	"entity_type" "accelevents_entity_type" NOT NULL,
	"canonical_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"canonical_fingerprint" text NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accelevents_reference_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuration_id" uuid NOT NULL,
	"reference_type" "accelevents_reference_type" NOT NULL,
	"canonical_id" uuid NOT NULL,
	"canonical_label" text NOT NULL,
	"external_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accelevents_sync_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"entity_type" "accelevents_entity_type" NOT NULL,
	"canonical_id" uuid NOT NULL,
	"external_id" text,
	"operation" "accelevents_record_operation" NOT NULL,
	"status" "accelevents_record_status" DEFAULT 'pending' NOT NULL,
	"fingerprint" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"request_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accelevents_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuration_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"source_run_id" uuid,
	"mode" "accelevents_run_mode" NOT NULL,
	"status" "accelevents_run_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"planned_count" integer DEFAULT 0 NOT NULL,
	"synced_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
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
ALTER TABLE "review_rounds" ADD COLUMN "routing_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "accelevents_configurations" ADD CONSTRAINT "accelevents_configurations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accelevents_configurations" ADD CONSTRAINT "accelevents_configurations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accelevents_field_mappings" ADD CONSTRAINT "accelevents_field_mappings_configuration_id_accelevents_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."accelevents_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accelevents_record_attempts" ADD CONSTRAINT "accelevents_record_attempts_record_id_accelevents_sync_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."accelevents_sync_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accelevents_record_links" ADD CONSTRAINT "accelevents_record_links_configuration_id_accelevents_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."accelevents_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accelevents_reference_mappings" ADD CONSTRAINT "accelevents_reference_mappings_configuration_id_accelevents_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."accelevents_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accelevents_sync_records" ADD CONSTRAINT "accelevents_sync_records_run_id_accelevents_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."accelevents_sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accelevents_sync_runs" ADD CONSTRAINT "accelevents_sync_runs_configuration_id_accelevents_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."accelevents_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accelevents_sync_runs" ADD CONSTRAINT "accelevents_sync_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accelevents_sync_runs" ADD CONSTRAINT "accelevents_sync_runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accelevents_configuration_event_unique" ON "accelevents_configurations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "accelevents_configuration_organization_idx" ON "accelevents_configurations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accelevents_field_mapping_canonical_unique" ON "accelevents_field_mappings" USING btree ("configuration_id","entity_type","canonical_field");--> statement-breakpoint
CREATE UNIQUE INDEX "accelevents_field_mapping_external_unique" ON "accelevents_field_mappings" USING btree ("configuration_id","entity_type","external_field");--> statement-breakpoint
CREATE UNIQUE INDEX "accelevents_record_attempt_number_unique" ON "accelevents_record_attempts" USING btree ("record_id","attempt_number");--> statement-breakpoint
CREATE INDEX "accelevents_record_attempt_status_idx" ON "accelevents_record_attempts" USING btree ("record_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "accelevents_record_link_canonical_unique" ON "accelevents_record_links" USING btree ("configuration_id","entity_type","canonical_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accelevents_record_link_external_unique" ON "accelevents_record_links" USING btree ("configuration_id","entity_type","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accelevents_reference_mapping_canonical_unique" ON "accelevents_reference_mappings" USING btree ("configuration_id","reference_type","canonical_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accelevents_sync_record_idempotency_unique" ON "accelevents_sync_records" USING btree ("run_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "accelevents_sync_record_run_status_idx" ON "accelevents_sync_records" USING btree ("run_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "accelevents_sync_run_idempotency_unique" ON "accelevents_sync_runs" USING btree ("configuration_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "accelevents_sync_run_event_created_idx" ON "accelevents_sync_runs" USING btree ("event_id","created_at");