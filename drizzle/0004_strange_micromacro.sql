CREATE TABLE "ai_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text DEFAULT 'openrouter' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"base_url" text DEFAULT '' NOT NULL,
	"api_key_cipher" text,
	"api_key_iv" text,
	"api_key_tag" text,
	"hermes_endpoint" text DEFAULT '' NOT NULL,
	"hermes_pin_cipher" text,
	"hermes_pin_iv" text,
	"hermes_pin_tag" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_settings_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "crm_task" ADD COLUMN "duration_min" integer;--> statement-breakpoint
ALTER TABLE "crm_task" ADD COLUMN "nagged_at" timestamp;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_settings_org_idx" ON "ai_settings" USING btree ("organization_id");