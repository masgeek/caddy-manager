import { runMigrations, closeDb, backfillSiteInventory } from "@caddy-manager/db";

async function migrate() {
  try {
    await runMigrations();
    await backfillSiteInventory();
    console.log("Migrations completed successfully");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

migrate();
