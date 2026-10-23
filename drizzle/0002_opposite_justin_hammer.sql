CREATE TABLE "appointment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'api' NOT NULL,
	"reminded_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_hit" (
	"id" text PRIMARY KEY NOT NULL,
	"bucket_key" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"bot_username" text DEFAULT '' NOT NULL,
	"token_cipher" text NOT NULL,
	"token_iv" text NOT NULL,
	"token_tag" text NOT NULL,
	"chat_id" text,
	"chat_name" text,
	"webhook_secret" text NOT NULL,
	"header_secret" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_connection_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_connection" ADD CONSTRAINT "telegram_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_org_start_idx" ON "appointment" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "rate_limit_hit_key_at_idx" ON "rate_limit_hit" USING btree ("bucket_key","at");--> statement-breakpoint
CREATE INDEX "telegram_connection_org_idx" ON "telegram_connection" USING btree ("organization_id");