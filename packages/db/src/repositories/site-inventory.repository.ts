import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type {
  InventoryManagementType,
  InventoryState,
  SiteInventory,
} from "@caddy-manager/shared-types";
import { db } from "../connection";
import { siteInventory, sites } from "../schema";

const managementTypes = ["dynamic", "caddyfile"] as const;
const inventoryStates = [
  "draft",
  "ready",
  "provisioning",
  "provisioned",
  "not_provisioned",
  "failed",
  "disabled",
] as const;

export const createSiteInventorySchema = z.object({
  serverId: z.string().uuid(),
  domain: z.string().min(1).max(255),
  managementType: z.enum(managementTypes).default("dynamic"),
  routeId: z.string().min(1).max(255).optional(),
  caddyServerName: z.string().max(255).optional(),
  upstream: z.string().url().optional(),
  routeConfig: z.record(z.unknown()).optional(),
  tlsEnabled: z.boolean().default(true),
  groupId: z.string().uuid().nullable().optional(),
  state: z.literal("draft").default("draft"),
});

export const updateSiteInventorySchema = createSiteInventorySchema
  .partial()
  .omit({ serverId: true })
  .extend({
    state: z.enum(inventoryStates).optional(),
    stateDetail: z.string().nullable().optional(),
  });
export type CreateSiteInventoryInput = z.infer<
  typeof createSiteInventorySchema
>;
export type UpdateSiteInventoryInput = z.infer<
  typeof updateSiteInventorySchema
>;

function toInventory(row: typeof siteInventory.$inferSelect): SiteInventory {
  return {
    id: row.id,
    serverId: row.serverId,
    domain: row.domain,
    managementType: row.managementType as InventoryManagementType,
    routeId: row.routeId ?? undefined,
    caddyServerName: row.caddyServerName ?? undefined,
    upstream: row.upstream ?? undefined,
    routeConfig: row.routeConfig as Record<string, unknown> | undefined,
    tlsEnabled: row.tlsEnabled,
    groupId: row.groupId ?? undefined,
    state: row.state as InventoryState,
    stateDetail: row.stateDetail ?? undefined,
    provisionedSiteId: row.provisionedSiteId ?? undefined,
    provisionAttempts: row.provisionAttempts,
    lastProvisionAttemptAt: row.lastProvisionAttemptAt?.toISOString(),
    provisionedAt: row.provisionedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

class SiteInventoryRepository {
  async findAll(serverId?: string): Promise<SiteInventory[]> {
    const query = db.select().from(siteInventory);
    if (serverId) query.where(eq(siteInventory.serverId, serverId));
    return (await query).map(toInventory);
  }

  async findById(id: string): Promise<SiteInventory | undefined> {
    const [row] = await db
      .select()
      .from(siteInventory)
      .where(eq(siteInventory.id, id))
      .limit(1);
    return row ? toInventory(row) : undefined;
  }

  async findByDomainAndServer(
    domain: string,
    serverId: string,
  ): Promise<SiteInventory | undefined> {
    const [row] = await db
      .select()
      .from(siteInventory)
      .where(
        and(
          eq(siteInventory.domain, domain),
          eq(siteInventory.serverId, serverId),
        ),
      )
      .limit(1);
    return row ? toInventory(row) : undefined;
  }

  async findByRoute(
    serverId: string,
    routeId: string,
    caddyServerName?: string,
  ): Promise<SiteInventory[]> {
    const rows = await db
      .select()
      .from(siteInventory)
      .where(eq(siteInventory.serverId, serverId));
    return rows
      .filter(
        (row) =>
          row.routeId === routeId &&
          (!caddyServerName || row.caddyServerName === caddyServerName),
      )
      .map(toInventory);
  }

  async create(data: CreateSiteInventoryInput): Promise<SiteInventory> {
    const [row] = await db.insert(siteInventory).values(data).returning();
    return toInventory(row);
  }

  async update(
    id: string,
    data: UpdateSiteInventoryInput,
  ): Promise<SiteInventory | undefined> {
    const [row] = await db
      .update(siteInventory)
      .set(data)
      .where(eq(siteInventory.id, id))
      .returning();
    return row ? toInventory(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const [row] = await db
      .delete(siteInventory)
      .where(eq(siteInventory.id, id))
      .returning({ id: siteInventory.id });
    return !!row;
  }

  async markProvisioning(id: string): Promise<SiteInventory | undefined> {
    const [row] = await db
      .update(siteInventory)
      .set({
        state: "provisioning",
        stateDetail: null,
        provisionAttempts: sql`${siteInventory.provisionAttempts} + 1`,
        lastProvisionAttemptAt: new Date(),
      })
      .where(eq(siteInventory.id, id))
      .returning();
    return row ? toInventory(row) : undefined;
  }

  async markProvisioned(
    id: string,
    provisionedSiteId: string,
  ): Promise<SiteInventory | undefined> {
    const [row] = await db
      .update(siteInventory)
      .set({
        state: "provisioned",
        stateDetail: null,
        provisionedSiteId,
        provisionedAt: new Date(),
      })
      .where(eq(siteInventory.id, id))
      .returning();
    return row ? toInventory(row) : undefined;
  }

  async markFailed(id: string, detail: string): Promise<void> {
    await db
      .update(siteInventory)
      .set({ state: "failed", stateDetail: detail })
      .where(eq(siteInventory.id, id));
  }

  async markNotProvisioned(id: string, detail: string): Promise<void> {
    await db
      .update(siteInventory)
      .set({ state: "not_provisioned", stateDetail: detail })
      .where(eq(siteInventory.id, id));
  }

  async detachFromServer(id: string, detail: string): Promise<void> {
    await db
      .update(siteInventory)
      .set({
        serverId: null,
        state: "not_provisioned",
        stateDetail: detail,
        provisionedSiteId: null,
        provisionedAt: null,
      })
      .where(eq(siteInventory.serverId, id));
  }
}

export const siteInventoryRepo = new SiteInventoryRepository();

export async function backfillSiteInventory(): Promise<number> {
  const existingSites = await db.select().from(sites);
  let created = 0;
  for (const site of existingSites) {
    const existing = await db
      .select({
        id: siteInventory.id,
        provisionedSiteId: siteInventory.provisionedSiteId,
      })
      .from(siteInventory)
      .where(
        and(
          eq(siteInventory.serverId, site.serverId),
          eq(siteInventory.domain, site.domain),
        ),
      )
      .limit(1);
    if (existing[0]) {
      await db
        .update(siteInventory)
        .set({
          provisionedSiteId: site.id,
          ...(existing[0].provisionedSiteId
            ? {}
            : { state: "provisioned", provisionedAt: new Date() }),
        })
        .where(eq(siteInventory.id, existing[0].id));
      continue;
    }
    await db.insert(siteInventory).values({
      serverId: site.serverId,
      domain: site.domain,
      managementType: site.routeId ? "dynamic" : "caddyfile",
      routeId: site.routeId ?? undefined,
      caddyServerName: site.caddyServerName ?? undefined,
      upstream: site.upstream ?? undefined,
      routeConfig: site.routeConfig as Record<string, unknown> | undefined,
      tlsEnabled: site.tlsEnabled,
      state: "provisioned",
      provisionedSiteId: site.id,
      provisionedAt: new Date(),
    });
    created++;
  }
  return created;
}
