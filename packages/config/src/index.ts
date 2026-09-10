import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));

function findRootEnv(start: string): string | undefined {
  let dir = start;
  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

dotenv.config({ path: findRootEnv(__dirname) });

export const config = {
  port: Number(process.env.PORT ?? "3500"),
  logLevel: process.env.LOG_LEVEL ?? "info",
  logFile: process.env.LOG_FILE ?? "logs/caddy-manager.log",

  authUsername: process.env.AUTH_USERNAME ?? "",
  authPassword: process.env.AUTH_PASSWORD,
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",

  caddyAdminToken: process.env.CADDY_ADMIN_TOKEN ?? "",
  caddyAllowedHosts: (process.env.CADDY_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
  allowPrivateOutbound: process.env.ALLOW_PRIVATE_OUTBOUND === "true",

  dbHost: process.env.DB_HOST ?? "localhost",
  dbPort: Number(process.env.DB_PORT ?? "5432"),
  dbName: process.env.DB_NAME ?? "caddy",
  dbUser: process.env.DB_USER ?? "caddy",
  dbPassword: process.env.DB_PASSWORD,

  seedEmail: process.env.SEED_EMAIL ?? "admin@caddy.local",
  seedUsername: process.env.SEED_USERNAME ?? "admin",
  seedPassword: process.env.SEED_PASSWORD,
  seedRole: process.env.SEED_ROLE ?? "admin",
};

export function buildDatabaseUrl(): string {
  return `postgresql://${config.dbUser}:${config.dbPassword}@${config.dbHost}:${config.dbPort}/${config.dbName}`;
}

export function validate(): void {
  const missing: string[] = [];
  if (!config.dbPassword) missing.push("DB_PASSWORD");
  if (!config.seedPassword) missing.push("SEED_PASSWORD");
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
  const invalid: string[] = [];
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)
    invalid.push("PORT");
  if (
    process.env.NODE_ENV === "production" &&
    config.jwtSecret === "dev-secret-change-in-production"
  )
    invalid.push("JWT_SECRET must be changed in production");
  if (invalid.length > 0) {
    console.error(`Invalid configuration: ${invalid.join(", ")}`);
    process.exit(1);
  }
}
