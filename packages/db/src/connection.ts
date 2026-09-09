import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDatabaseUrl } from "@caddy-manager/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const queryClient = postgres(buildDatabaseUrl());
export const db = drizzle({ client: queryClient, schema });

export async function runMigrations() {
  const migrationsDir = join(__dirname, "../drizzle");
  console.log(`Running migrations from ${migrationsDir}...`);
  await migrate(db, { migrationsFolder: migrationsDir });
  console.log("Migrations complete.");
}

export async function closeDb() {
  await queryClient.end();
}
