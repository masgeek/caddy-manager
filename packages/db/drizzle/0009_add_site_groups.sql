CREATE TABLE "site_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_inventory" ADD COLUMN "group_id" text;
--> statement-breakpoint
ALTER TABLE "site_groups" ADD CONSTRAINT "site_groups_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "site_groups_server_name_unique" ON "site_groups" USING btree ("server_id","name");
--> statement-breakpoint
ALTER TABLE "site_inventory" ADD CONSTRAINT "site_inventory_group_id_site_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."site_groups"("id") ON DELETE set null ON UPDATE no action;
