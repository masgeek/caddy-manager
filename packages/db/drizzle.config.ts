import { defineConfig } from "drizzle-kit";
import { buildDatabaseUrl } from "@caddy-manager/config";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema.ts",
  verbose: true,
  dialect: "postgresql",
  dbCredentials: { url: buildDatabaseUrl() },
  migrations: { schema: "public" },
});
