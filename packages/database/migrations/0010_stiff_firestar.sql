CREATE TYPE "public"."decision_audit_action" AS ENUM('recorded', 'changed', 'notification_updated', 'released');--> statement-breakpoint
CREATE TYPE "public"."decision_notification_status" AS ENUM('draft', 'reviewed', 'queued', 'handed_off');--> statement-breakpoint
CREATE TYPE "public"."session_change_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "decision_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"status" "decision_notification_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"subject_template" text NOT NULL,
	"html_template" text NOT NULL,
	"text_template" text NOT NULL,
	"communication_id" uuid,
	"queued_at" timestamp with time zone,
	"handed_off_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"requested_by_person_id" uuid NOT NULL,
	"proposed_title" text NOT NULL,
	"proposed_abstract" text DEFAULT '' NOT NULL,
	"reason" text NOT NULL,
	"status" "session_change_request_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"resolution_idempotency_key" text,
	"resolved_by_person_id" uuid,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decision_audit_events" ADD COLUMN "previous_outcome" "decision_outcome";--> statement-breakpoint
ALTER TABLE "decision_audit_events" ADD COLUMN "action" "decision_audit_action" DEFAULT 'recorded' NOT NULL;--> statement-breakpoint
ALTER TABLE "decision_audit_events" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "released_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
UPDATE "decisions"
SET "released_by_person_id" = "decided_by_person_id", "released_at" = "decided_at"
WHERE "released_at" IS NULL;--> statement-breakpoint
INSERT INTO "decision_notifications" (
	"decision_id", "status", "subject_template", "html_template", "text_template", "communication_id", "queued_at", "handed_off_at"
)
SELECT
	d."id",
	CASE WHEN c."id" IS NULL THEN 'queued'::"decision_notification_status" ELSE 'handed_off'::"decision_notification_status" END,
	CASE WHEN d."outcome" = 'accepted' THEN 'Decision for {{ submission_title }}: Accepted' ELSE 'Decision for {{ submission_title }}: Not selected' END,
	CASE WHEN d."outcome" = 'accepted'
		THEN '<p>Hello {{first_name}},</p><p>The decision for <strong>{{submission_title}}</strong> is <strong>Accepted</strong>.</p>'
		ELSE '<p>Hello {{first_name}},</p><p>The decision for <strong>{{submission_title}}</strong> is <strong>Not selected</strong>.</p>' END,
	CASE WHEN d."outcome" = 'accepted'
		THEN 'Hello {{first_name}}, the decision for {{submission_title}} is Accepted.'
		ELSE 'Hello {{first_name}}, the decision for {{submission_title}} is Not selected.' END,
	c."id",
	d."decided_at",
	c."created_at"
FROM "decisions" d
LEFT JOIN LATERAL (
	SELECT "id", "created_at"
	FROM "communications"
	WHERE "audience_snapshot"->>'decisionId' = d."id"::text
	ORDER BY "created_at" DESC
	LIMIT 1
) c ON true
;--> statement-breakpoint
UPDATE "decisions" d
SET "notified_at" = (
	SELECT "created_at"
	FROM "communications"
	WHERE "audience_snapshot"->>'decisionId' = d."id"::text
	ORDER BY "created_at" DESC
	LIMIT 1
)
WHERE d."notified_at" IS NULL
AND EXISTS (
	SELECT 1 FROM "communications" WHERE "audience_snapshot"->>'decisionId' = d."id"::text
);--> statement-breakpoint
ALTER TABLE "decision_notifications" ADD CONSTRAINT "decision_notifications_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_change_requests" ADD CONSTRAINT "session_change_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_change_requests" ADD CONSTRAINT "session_change_requests_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_change_requests" ADD CONSTRAINT "session_change_requests_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_change_requests" ADD CONSTRAINT "session_change_requests_resolved_by_person_id_people_id_fk" FOREIGN KEY ("resolved_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "decision_notifications_decision_unique" ON "decision_notifications" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX "decision_notifications_status_idx" ON "decision_notifications" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_change_requests_idempotency_unique" ON "session_change_requests" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "session_change_requests_resolution_idempotency_unique" ON "session_change_requests" USING btree ("resolution_idempotency_key");--> statement-breakpoint
CREATE INDEX "session_change_requests_session_status_idx" ON "session_change_requests" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "session_change_requests_event_status_idx" ON "session_change_requests" USING btree ("event_id","status");--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_released_by_person_id_people_id_fk" FOREIGN KEY ("released_by_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;
