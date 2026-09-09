import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Server } from "@caddy-manager/shared-types";
import { db } from "../connection";
import { servers } from "../schema";

export const createServerSchema = z.object({
  name: z.string().min(1).max(100),
  hostname: z.string().min(1).max(255),
  apiEndpoint: z.string().url(),
});

export const updateServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  hostname: z.string().min(1).max(255).optional(),
  apiEndpoint: z.string().url().optional(),
});

export type CreateServerInput = z.infer<typeof createServerSchema>;
export type UpdateServerInput = z.infer<typeof updateServerSchema>;

function toServer(row: typeof servers.$inferSelect): Server {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    apiEndpoint: row.apiEndpoint,
    status: row.status as Server["status"],
    version: row.version ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

class ServerRepository {
  async findAll(): Promise<Server[]> {
    const rows = await db.select().from(servers);
    return rows.map(toServer);
  }

  async findById(id: string): Promise<Server | undefined> {
    const [row] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, id))
      .limit(1);
    return row ? toServer(row) : undefined;
  }

  async create(data: CreateServerInput): Promise<Server> {
    const [row] = await db
      .insert(servers)
      .values({
        name: data.name,
        hostname: data.hostname,
        apiEndpoint: data.apiEndpoint,
      })
      .returning();
    return toServer(row);
  }

  async update(
    id: string,
    data: UpdateServerInput,
  ): Promise<Server | undefined> {
    const update: Partial<typeof servers.$inferInsert> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.hostname !== undefined) update.hostname = data.hostname;
    if (data.apiEndpoint !== undefined) update.apiEndpoint = data.apiEndpoint;

    const [row] = await db
      .update(servers)
      .set(update)
      .where(eq(servers.id, id))
      .returning();
    return row ? toServer(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const [row] = await db
      .delete(servers)
      .where(eq(servers.id, id))
      .returning({ id: servers.id });
    return !!row;
  }

  async updateStatus(
    id: string,
    status: string,
    version?: string,
  ): Promise<void> {
    const update: Partial<typeof servers.$inferInsert> = { status };
    if (version !== undefined) update.version = version;
    await db.update(servers).set(update).where(eq(servers.id, id));
  }
}

export const serverRepo = new ServerRepository();
