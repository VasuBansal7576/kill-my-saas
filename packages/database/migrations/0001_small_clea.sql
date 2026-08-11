CREATE TABLE "event_formats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_formats" ADD CONSTRAINT "event_formats_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rooms" ADD CONSTRAINT "event_rooms_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tracks" ADD CONSTRAINT "event_tracks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_formats_name_unique" ON "event_formats" USING btree ("event_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "event_formats_order_unique" ON "event_formats" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "event_rooms_name_unique" ON "event_rooms" USING btree ("event_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "event_rooms_order_unique" ON "event_rooms" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "event_tracks_name_unique" ON "event_tracks" USING btree ("event_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "event_tracks_order_unique" ON "event_tracks" USING btree ("event_id","sort_order");