CREATE TABLE "site_inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"domain" varchar(255) NOT NULL,
	"management_type" varchar(20) DEFAULT 'dynamic' NOT NULL,
	"route_id" varchar(255),
	"caddy_server_name" varchar(255),
	"upstream" varchar(255),
	"route_config" jsonb,
	"tls_enabled" boolean DEFAULT true NOT NULL,
	"state" varchar(20) DEFAULT 'draft' NOT NULL,
	"state_detail" text,
	"provisioned_site_id" text,
	"provision_attempts" integer DEFAULT 0 NOT NULL,
	"last_provision_attempt_at" timestamp,
	"provisioned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "upstream" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "site_inventory" ADD CONSTRAINT "site_inventory_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_inventory" ADD CONSTRAINT "site_inventory_provisioned_site_id_sites_id_fk" FOREIGN KEY ("provisioned_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_inventory_server_domain_unique" ON "site_inventory" USING btree ("server_id","domain");
--> statement-breakpoint
INSERT INTO "site_inventory" ("id", "server_id", "domain", "management_type", "route_id", "caddy_server_name", "upstream", "route_config", "tls_enabled", "state", "provisioned_site_id", "provisioned_at")
SELECT md5('site-inventory:' || "id"), "server_id", "domain", CASE WHEN "route_id" IS NULL THEN 'caddyfile' ELSE 'dynamic' END, "route_id", "caddy_server_name", "upstream", "route_config", "tls_enabled", 'provisioned', "id", now()
FROM "sites";
