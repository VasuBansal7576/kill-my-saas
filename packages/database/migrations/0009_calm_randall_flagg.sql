DROP INDEX "identities_person_provider_unique";--> statement-breakpoint
CREATE INDEX "identities_person_provider_idx" ON "identities" USING btree ("person_id","provider");