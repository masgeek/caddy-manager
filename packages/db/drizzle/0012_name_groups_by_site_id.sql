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
SET "name" = route_groups.group_id
FROM route_groups
WHERE groups."id" = route_groups.group_id
   OR (
     groups."server_id" = route_groups."server_id"
     AND groups."name" = CASE
       WHEN length(route_groups.group_name) <= 100 THEN route_groups.group_name
       ELSE substr(route_groups.group_name, 1, 90) || '-' || substr(md5(route_groups.group_name), 1, 9)
     END
   );
