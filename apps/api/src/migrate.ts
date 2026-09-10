import {
  runMigrations,
  closeDb,
  backfillSiteInventory,
} from "@caddy-manager/db";
import { logger } from "./lib/logger.js";

async function migrate() {
  try {
    await runMigrations();
    await backfillSiteInventory();
    logger.info("Migrations completed successfully");
  } catch (err) {
    logger.error({ err }, "Migration failed");
    process.exit(1);
  } finally {
    await closeDb();
  }
}

migrate();
