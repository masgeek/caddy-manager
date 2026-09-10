import { eq } from "drizzle-orm";
import { db } from "../connection";
import { healthSettings } from "../schema";

export type HealthSettings = {
  enabled: boolean;
  schedule: string;
  timeoutMs: number;
  concurrency: number;
  retries: number;
  retryDelayMs: number;
  updatedAt: string;
};

const defaults = {
  enabled: true,
  schedule: "*/5 * * * *",
  timeoutMs: 5000,
  concurrency: 5,
  retries: 2,
  retryDelayMs: 250,
};

function toSettings(row: typeof healthSettings.$inferSelect): HealthSettings {
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}

class HealthSettingsRepository {
  async get(): Promise<HealthSettings> {
    const [row] = await db
      .select()
      .from(healthSettings)
      .where(eq(healthSettings.id, "global"))
      .limit(1);
    if (row) return toSettings(row);
    const [created] = await db
      .insert(healthSettings)
      .values({ id: "global", ...defaults })
      .returning();
    return toSettings(created);
  }

  async update(
    data: Omit<HealthSettings, "updatedAt">,
  ): Promise<HealthSettings> {
    const [row] = await db
      .insert(healthSettings)
      .values({ id: "global", ...data })
      .onConflictDoUpdate({ target: healthSettings.id, set: data })
      .returning();
    return toSettings(row);
  }
}

export const healthSettingsRepo = new HealthSettingsRepository();
