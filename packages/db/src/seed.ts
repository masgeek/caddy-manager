import { randomBytes, scryptSync } from "node:crypto";
import { db, queryClient } from "./connection";
import { users } from "./schema";
import { eq } from "drizzle-orm";

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
    console.error("SEED_PASSWORD is required");
    process.exit(1);
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    console.log(`User ${email} already exists, skipping.`);
  } else {
    await db.insert(users).values({
      email,
      username,
      role,
      passwordHash: hashPassword(password),
    });
    console.log(`Created admin user: ${email} / ${password}`);
  }

  await queryClient.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
