import { closeDb } from "./lib/db.js";
import { housekeepSiteProvisioning } from "./jobs/siteHealth.js";

try {
  const result = await housekeepSiteProvisioning();
  console.log(
    `[caddy:housekeep] inventory marked not provisioned: ${result.inventoryMarked}; sites marked not provisioned: ${result.sitesMarked}`,
  );
} catch (error) {
  console.error("[caddy:housekeep] failed", error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
