CREATE TABLE "crm_supplier" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'pagina' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rating" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_supplier" ADD CONSTRAINT "crm_supplier_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_supplier_org_idx" ON "crm_supplier" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "crm_supplier_org_type_idx" ON "crm_supplier" USING btree ("organization_id","type");--> statement-breakpoint
ALTER TABLE "crm_supplier" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "Deny all for crm_supplier" ON "crm_supplier" FOR ALL USING (false);