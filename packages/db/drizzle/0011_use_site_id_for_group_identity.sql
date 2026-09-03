UPDATE "site_inventory"
SET "group_id" = NULL
WHERE "group_id" IN (SELECT "id" FROM "site_groups");
--> statement-breakpoint
WITH route_groups AS (
  SELECT
    min("id") AS group_id,
    "server_id",
    coalesce("caddy_server_name", "route_id") || ':' || "route_id" AS group_name
  FROM "sites"
  WHERE "route_id" IS NOT NULL
  GROUP BY "server_id", coalesce("caddy_server_name", "route_id"), "route_id"
)
UPDATE "site_groups" AS groups
SET "id" = route_groups.group_id
FROM route_groups
WHERE groups."server_id" = route_groups."server_id"
  AND groups."name" = CASE
    WHEN length(route_groups.group_name) <= 100 THEN route_groups.group_name
    ELSE substr(route_groups.group_name, 1, 90) || '-' || substr(md5(route_groups.group_name), 1, 9)
  END;
--> statement-breakpoint
WITH route_groups AS (
  SELECT
    min("id") AS group_id,
    "server_id",
    coalesce("caddy_server_name", "route_id") || ':' || "route_id" AS group_name
  FROM "sites"
  WHERE "route_id" IS NOT NULL
  GROUP BY "server_id", coalesce("caddy_server_name", "route_id"), "route_id"
)
UPDATE "site_inventory" AS inventory
SET "group_id" = route_groups.group_id
FROM "sites" AS sites
JOIN route_groups
  ON route_groups."server_id" = sites."server_id"
 AND route_groups.group_name = coalesce(sites."caddy_server_name", sites."route_id") || ':' || sites."route_id"
WHERE inventory."server_id" = sites."server_id"
  AND inventory."domain" = sites."domain"
  AND sites."route_id" IS NOT NULL;
