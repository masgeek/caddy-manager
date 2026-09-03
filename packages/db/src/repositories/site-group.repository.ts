import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { SiteGroup } from "@caddy-manager/shared-types";
import { db } from "../connection";
import { siteGroups } from "../schema";

export const createSiteGroupSchema = z.object({
  serverId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

export const updateSiteGroupSchema = createSiteGroupSchema
  .partial()
  .omit({ serverId: true });

function toSiteGroup(row: typeof siteGroups.$inferSelect): SiteGroup {
  return {
    id: row.id,
    serverId: row.serverId,
    name: row.name,
    description: row.description ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

class SiteGroupRepository {
  async findAll(serverId?: string): Promise<SiteGroup[]> {
    const query = db.select().from(siteGroups);
    if (serverId) query.where(eq(siteGroups.serverId, serverId));
    return (await query).map(toSiteGroup);
  }

  async findById(id: string): Promise<SiteGroup | undefined> {
    const [row] = await db
      .select()
      .from(siteGroups)
      .where(eq(siteGroups.id, id))
      .limit(1);
    return row ? toSiteGroup(row) : undefined;
  }

  async findByNameAndServer(
    name: string,
    serverId: string,
  ): Promise<SiteGroup | undefined> {
    const [row] = await db
      .select()
      .from(siteGroups)
      .where(and(eq(siteGroups.name, name), eq(siteGroups.serverId, serverId)))
      .limit(1);
    return row ? toSiteGroup(row) : undefined;
  }

  async create(data: { serverId: string; name: string; description?: string }) {
    const [row] = await db.insert(siteGroups).values(data).returning();
    return toSiteGroup(row);
  }

  async update(
    id: string,
    data: { name?: string; description?: string },
  ): Promise<SiteGroup | undefined> {
    const [row] = await db
      .update(siteGroups)
      .set(data)
      .where(eq(siteGroups.id, id))
      .returning();
    return row ? toSiteGroup(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const [row] = await db
      .delete(siteGroups)
      .where(eq(siteGroups.id, id))
      .returning({ id: siteGroups.id });
    return !!row;
  }
}

export const siteGroupRepo = new SiteGroupRepository();
