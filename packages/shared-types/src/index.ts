export interface Server {
  id: string;
  name: string;
  hostname: string;
  apiEndpoint: string;
  status: ServerStatus;
  version?: string;
  createdAt: string;
  updatedAt: string;
}

export type ServerStatus = "online" | "offline" | "degraded" | "unknown";

export const SERVER_STATUSES: ServerStatus[] = [
  "online",
  "offline",
  "degraded",
  "unknown",
];

export interface Site {
  id: string;
  serverId: string;
  domain: string;
  upstream?: string;
  routeId?: string;
  caddyServerName?: string;
  routeConfig?: Record<string, unknown>;
  tlsEnabled: boolean;
  synced: boolean;
  status: SiteStatus;
  statusDetail?: string;
  lastCheckedAt?: string;
  healthLatencyMs?: number;
  consecutiveFailures: number;
  healthEndpoint?: string;
  healthHeaders?: string;
  createdAt: string;
  updatedAt: string;
}

export type InventoryManagementType = "dynamic" | "caddyfile";
export type InventoryState =
  | "draft"
  | "ready"
  | "provisioning"
  | "provisioned"
  | "not_provisioned"
  | "failed"
  | "disabled";

export interface SiteInventory {
  id: string;
  serverId: string | null;
  domain: string;
  managementType: InventoryManagementType;
  routeId?: string;
  caddyServerName?: string;
  upstream?: string;
  routeConfig?: Record<string, unknown>;
  tlsEnabled: boolean;
  groupId?: string;
  state: InventoryState;
  stateDetail?: string;
  provisionedSiteId?: string;
  provisionAttempts: number;
  lastProvisionAttemptAt?: string;
  provisionedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SiteGroup {
  id: string;
  serverId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export type SiteStatus =
  "active" | "inactive" | "warning" | "error" | "not_provisioned";

export const SITE_STATUSES: SiteStatus[] = [
  "active",
  "inactive",
  "warning",
  "error",
  "not_provisioned",
];

export interface Route {
  id: string;
  host: string;
  path: string;
  upstream: string;
}

export interface HealthResponse {
  status: ServerStatus;
  version?: string;
  uptime?: number;
  checkedAt: string;
}

export interface AuditEvent {
  id: string;
  userId: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  details?: string;
  timestamp: string;
  result: "success" | "failure";
}

export type AuditAction =
  "create" | "update" | "delete" | "reload" | "login" | "logout";

export const AUDIT_ACTIONS: AuditAction[] = [
  "create",
  "update",
  "delete",
  "reload",
  "login",
  "logout",
];

export type AuditEntity = "site" | "server" | "config" | "user";

export const AUDIT_ENTITIES: AuditEntity[] = [
  "site",
  "server",
  "config",
  "user",
];

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  createdAt: string;
}

export type UserRole = "admin" | "operator" | "viewer";

export const USER_ROLES: UserRole[] = ["admin", "operator", "viewer"];

export interface ConfigurationSnapshot {
  id: string;
  serverId: string;
  configuration: string;
  timestamp: string;
}
