import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import type { Site } from "@caddy-manager/shared-types";
import { db } from "../connection";
import { sites } from "../schema";

export const createSiteSchema = z.object({
  serverId: z.string().uuid(),
  domain: z.string().min(1).max(255),
  upstream: z.string().url().optional(),
  routeId: z.string().min(1).max(255).optional(),
  caddyServerName: z.string().max(255).optional(),
  routeConfig: z.record(z.unknown()).optional(),
  tlsEnabled: z.boolean(),
  healthEndpoint: z.string().max(500).optional(),
  healthHeaders: z.string().optional(),
});

export const updateSiteSchema = z.object({
  serverId: z.string().uuid().optional(),
  domain: z.string().min(1).max(255).optional(),
  upstream: z.string().url().optional(),
  routeId: z.string().max(255).optional(),
  caddyServerName: z.string().max(255).optional(),
  routeConfig: z.record(z.unknown()).optional(),
  tlsEnabled: z.boolean().optional(),
  healthEndpoint: z.string().max(500).optional(),
  healthHeaders: z.string().optional(),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;

function toSite(row: typeof sites.$inferSelect): Site {
  return {
    id: row.id,
    serverId: row.serverId,
    domain: row.domain,
    upstream: row.upstream ?? undefined,
    routeId: row.routeId ?? undefined,
    caddyServerName: row.caddyServerName ?? undefined,
    routeConfig: row.routeConfig as Record<string, unknown> | undefined,
    tlsEnabled: row.tlsEnabled,
    synced: row.synced,
    status: row.status as Site["status"],
    statusDetail: row.statusDetail ?? undefined,
    lastCheckedAt: row.lastCheckedAt?.toISOString(),
    healthLatencyMs: row.healthLatencyMs ?? undefined,
    consecutiveFailures: row.consecutiveFailures,
    healthEndpoint: row.healthEndpoint ?? undefined,
    healthHeaders: row.healthHeaders ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

class SiteRepository {
  async findAll(serverId?: string): Promise<Site[]> {
    const query = db.select().from(sites);
    if (serverId) query.where(eq(sites.serverId, serverId));
    const rows = await query;
    return rows.map(toSite);
  }

  async findById(id: string): Promise<Site | undefined> {
    const [row] = await db
      .select()
      .from(sites)
      .where(eq(sites.id, id))
      .limit(1);
    return row ? toSite(row) : undefined;
  }

  async create(data: CreateSiteInput): Promise<Site> {
    const [row] = await db
      .insert(sites)
      .values({
        serverId: data.serverId,
        domain: data.domain,
        upstream: data.upstream,
        routeId: data.routeId,
        caddyServerName: data.caddyServerName,
        routeConfig: data.routeConfig,
        tlsEnabled: data.tlsEnabled,
        healthEndpoint: data.healthEndpoint,
        healthHeaders: data.healthHeaders,
      })
      .returning();
    return toSite(row);
  }

  async update(id: string, data: UpdateSiteInput): Promise<Site | undefined> {
    const update: Partial<typeof sites.$inferSelect> = {};
    if (data.serverId !== undefined) update.serverId = data.serverId;
    if (data.domain !== undefined) update.domain = data.domain;
    if (data.upstream !== undefined) update.upstream = data.upstream;
    if (data.routeId !== undefined) update.routeId = data.routeId;
    if (data.caddyServerName !== undefined)
      update.caddyServerName = data.caddyServerName;
    if (data.routeConfig !== undefined) update.routeConfig = data.routeConfig;
    if (data.tlsEnabled !== undefined) update.tlsEnabled = data.tlsEnabled;
    if (data.healthEndpoint !== undefined)
      update.healthEndpoint = data.healthEndpoint;
    if (data.healthHeaders !== undefined)
      update.healthHeaders = data.healthHeaders;

    const [row] = await db
      .update(sites)
      .set(update)
      .where(eq(sites.id, id))
      .returning();
    return row ? toSite(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const [row] = await db
      .delete(sites)
      .where(eq(sites.id, id))
      .returning({ id: sites.id });
    return !!row;
  }

  async findByServer(serverId: string): Promise<Site[]> {
    const rows = await db
      .select()
      .from(sites)
      .where(eq(sites.serverId, serverId));
    return rows.map(toSite);
  }

  async findByDomainAndServer(
    domain: string,
    serverId: string,
  ): Promise<Site | undefined> {
    const [row] = await db
      .select()
      .from(sites)
      .where(
        and(
          sql`lower(trim(trailing '.' from ${sites.domain})) = lower(trim(trailing '.' from ${domain}))`,
          eq(sites.serverId, serverId),
        ),
      )
      .limit(1);
    return row ? toSite(row) : undefined;
  }

  async updateSyncedStatus(id: string, synced: boolean): Promise<void> {
    await db.update(sites).set({ synced }).where(eq(sites.id, id));
  }

  async updateHealth(
    id: string,
    status: string,
    statusDetail: string,
    healthLatencyMs: number,
    lastCheckedAt: Date,
    consecutiveFailures: number,
  ): Promise<void> {
    await db
      .update(sites)
      .set({
        status,
        statusDetail,
        healthLatencyMs,
        lastCheckedAt,
        consecutiveFailures,
      })
      .where(eq(sites.id, id));
  }

  async markNotProvisioned(id: string, detail: string): Promise<void> {
    await db
      .update(sites)
      .set({ status: "not_provisioned", statusDetail: detail, synced: false })
      .where(eq(sites.id, id));
  }
}

export const siteRepo = new SiteRepository();
