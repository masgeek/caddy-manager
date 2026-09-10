import { closeDb } from "./lib/db.js";
import { reconcileAllSites } from "./jobs/siteHealth.js";
import { logger } from "./lib/logger.js";

const dryRun = process.argv.includes("--dry-run");

try {
  const report = await reconcileAllSites({ dryRun });
  logger.info(
    { caddyfileManaged: report.caddyfileManaged },
    "Caddyfile-managed sites ignored by dynamic reconciliation",
  );
  logger.info(
    { dynamicSites: report.dynamicSites, routeGroups: report.routeGroups },
    "Dynamic reconciliation summary",
  );
  for (const state of [
    "draft",
    "ready",
    "provisioning",
    "provisioned",
    "not_provisioned",
    "failed",
    "disabled",
  ])
    logger.info(
      { state, count: report.inventoryStates[state] ?? 0 },
      "Inventory state",
    );
  logger.info({ count: report.routesToCreate }, "Routes to create");
  logger.info({ count: report.routesToUpdate }, "Routes to update");
  logger.info(
    { count: report.legacyRoutes },
    "Legacy top-level routes to migrate",
  );
  logger.info({ count: report.routesAlreadyCorrect }, "Routes already correct");
  logger.info({ conflicts: report.conflicts }, "Reconciliation conflicts");
} catch (error) {
  logger.error({ err: error }, "Caddy reconciliation failed");
  process.exitCode = 1;
} finally {
  await closeDb();
}
