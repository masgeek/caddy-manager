import { z } from "zod";
import { desc } from "drizzle-orm";
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

  async findAll(limit = 100): Promise<AuditEvent[]> {
    const rows = await db
      .select()
      .from(auditEvents)
      .orderBy(desc(auditEvents.timestamp))
      .limit(limit);
    return rows.map(toAuditEvent);
  }
}

export const auditRepo = new AuditRepository();
