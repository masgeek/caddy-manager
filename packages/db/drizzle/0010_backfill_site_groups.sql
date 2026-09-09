INSERT INTO "site_groups" ("id", "server_id", "name", "description")
SELECT
  "route_id",
  min("server_id"),
  "route_id",
  'Backfilled from provisioned site route data'
FROM "sites"
WHERE "route_id" IS NOT NULL
GROUP BY "route_id"
ON CONFLICT ("server_id", "name") DO NOTHING;
--> statement-breakpoint
UPDATE "site_inventory" AS inventory
SET "group_id" = sites."route_id"
FROM "sites" AS sites
WHERE inventory."server_id" = sites."server_id"
  AND inventory."domain" = sites."domain"
  AND sites."route_id" IS NOT NULL;
