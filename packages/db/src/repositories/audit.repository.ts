import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type {
  AuditEvent,
  AuditAction,
  AuditEntity,
} from "@caddy-manager/shared-types";
import { db } from "../connection";
import { auditEvents } from "../schema";

export const createAuditEventSchema = z.object({
  userId: z.string().optional(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().optional(),
  details: z.string().optional(),
  result: z.string().optional(),
});

export type CreateAuditEventInput = z.infer<typeof createAuditEventSchema>;

function toAuditEvent(row: typeof auditEvents.$inferSelect): AuditEvent {
  return {
    id: row.id,
    userId: row.userId,
    action: row.action as AuditAction,
    entity: row.entity as AuditEntity,
    entityId: row.entityId ?? undefined,
    details: row.details ?? undefined,
    result: row.result as "success" | "failure",
    timestamp: row.timestamp.toISOString(),
  };
}

class AuditRepository {
  async create(data: CreateAuditEventInput): Promise<AuditEvent> {
    const [row] = await db
      .insert(auditEvents)
      .values({
        userId: data.userId || "admin",
        action: data.action,
        entity: data.entity,
        entityId: data.entityId ?? null,
        details: data.details ?? null,
        result: data.result ?? "success",
      })
      .returning();
    return toAuditEvent(row);
  }

  async findAll(
    options: {
      limit?: number;
      userId?: string;
      action?: string;
      entity?: string;
      result?: string;
    } = {},
  ): Promise<AuditEvent[]> {
    const filters = [
      options.userId ? eq(auditEvents.userId, options.userId) : undefined,
      options.action ? eq(auditEvents.action, options.action) : undefined,
      options.entity ? eq(auditEvents.entity, options.entity) : undefined,
      options.result ? eq(auditEvents.result, options.result) : undefined,
    ].filter((value): value is NonNullable<typeof value> => Boolean(value));
    const rows = await db
      .select()
      .from(auditEvents)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(auditEvents.timestamp))
      .limit(options.limit ?? 100);
    return rows.map(toAuditEvent);
  }
}

export const auditRepo = new AuditRepository();
