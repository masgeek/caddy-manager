import { closeDb } from "./lib/db.js";
import { housekeepSiteProvisioning } from "./jobs/siteHealth.js";
import { logger } from "./lib/logger.js";

try {
  const result = await housekeepSiteProvisioning();
  logger.info(result, "Housekeeping completed");
} catch (error) {
  logger.error({ err: error }, "Housekeeping failed");
  process.exitCode = 1;
} finally {
  await closeDb();
}
