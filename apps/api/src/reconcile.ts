import { closeDb } from "./lib/db.js";
import { reconcileAllSites } from "./jobs/siteHealth.js";

const dryRun = process.argv.includes("--dry-run");

try {
  const report = await reconcileAllSites({ dryRun });
  console.log(
    `Caddyfile-managed\n-----------------\n${report.caddyfileManaged} sites ignored by dynamic reconciliation`,
  );
  console.log(
    `Dynamic\n-------\n${report.dynamicSites} sites\n${report.routeGroups} distinct route_id groups`,
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
    console.log(`${state}: ${report.inventoryStates[state] ?? 0}`);
  console.log(`Routes to create: ${report.routesToCreate}`);
  console.log(`Routes to update: ${report.routesToUpdate}`);
  console.log(`Legacy top-level routes to migrate: ${report.legacyRoutes}`);
  console.log(`Routes already correct: ${report.routesAlreadyCorrect}`);
  console.log(
    `Conflicts: ${report.conflicts.length ? report.conflicts.join("; ") : "none"}`,
  );
} catch (error) {
  console.error("[caddy:reconcile] failed", error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
