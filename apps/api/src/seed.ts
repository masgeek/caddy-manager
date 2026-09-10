import { randomBytes, scryptSync } from "node:crypto";
import { queryClient, userRepo } from "@caddy-manager/db";
import { logger } from "./lib/logger.js";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function seed() {
  const email = process.env.SEED_EMAIL ?? "admin@caddy.local";
  const username = process.env.SEED_USERNAME ?? "admin";
  const password = process.env.SEED_PASSWORD;
  const role = process.env.SEED_ROLE ?? "admin";

  if (!password) {
    logger.error("SEED_PASSWORD is required");
    process.exit(1);
  }

  const existing = await userRepo.findByEmail(email);

  if (existing) {
    logger.info({ email }, "User already exists, skipping");
  } else {
    await userRepo.create({
      email,
      username,
      role,
      passwordHash: hashPassword(password),
    });
    logger.info({ email }, "Created user");
  }

  await queryClient.end();
}

seed().catch((err) => {
  logger.error({ err }, "Seed failed");
  process.exit(1);
});
