ALTER TABLE "site_inventory" DROP CONSTRAINT "site_inventory_server_id_servers_id_fk";
--> statement-breakpoint
ALTER TABLE "site_inventory" ADD CONSTRAINT "site_inventory_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE no action ON UPDATE no action;
