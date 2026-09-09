import type {
  AuditEvent,
  AuditAction,
  AuditEntity,
} from "@caddy-manager/shared-types";
import { auditRepo } from "@caddy-manager/db";

export async function recordAuditEvent(data: {
  userId?: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  details?: string;
  result?: "success" | "failure";
}): Promise<AuditEvent> {
  return auditRepo.create({
    userId: data.userId,
    action: data.action,
    entity: data.entity,
    entityId: data.entityId,
    details: data.details,
    result: data.result,
  });
}

export async function getAuditEvents(limit = 100): Promise<AuditEvent[]> {
  return auditRepo.findAll(limit);
}
