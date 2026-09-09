import type {
  Server,
  Site,
  HealthResponse,
  AuditEvent,
  ConfigurationSnapshot,
  SiteInventory,
  SiteGroup,
} from "@caddy-manager/shared-types";

export type { SiteInventory } from "@caddy-manager/shared-types";
export type { SiteGroup } from "@caddy-manager/shared-types";

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  details?: unknown;
}

// Request DTOs
export interface CreateServerRequest {
  name: string;
  hostname: string;
  apiEndpoint: string;
}

export interface UpdateServerRequest {
  name?: string;
  hostname?: string;
  apiEndpoint?: string;
}

export interface CreateSiteRequest {
  serverId: string;
  domain: string;
  upstream?: string;
  routeId?: string;
  caddyServerName?: string;
  routeConfig?: Record<string, unknown>;
  tlsEnabled: boolean;
  healthEndpoint?: string;
  healthHeaders?: string;
}

export type CreateSiteInventoryRequest = Omit<
  SiteInventory,
  | "id"
  | "state"
  | "provisionedSiteId"
  | "provisionAttempts"
  | "lastProvisionAttemptAt"
  | "provisionedAt"
  | "createdAt"
  | "updatedAt"
  | "groupId"
> & { state?: SiteInventory["state"]; groupId?: string | null };
export type UpdateSiteInventoryRequest = Partial<CreateSiteInventoryRequest>;

export type CreateSiteGroupRequest = Pick<SiteGroup, "serverId" | "name"> & {
  description?: string;
};
export type UpdateSiteGroupRequest = Partial<
  Pick<SiteGroup, "name" | "description">
>;

export interface UpdateSiteRequest {
  domain?: string;
  upstream?: string;
  routeId?: string;
  caddyServerName?: string;
  routeConfig?: Record<string, unknown>;
  tlsEnabled?: boolean;
  healthEndpoint?: string;
  healthHeaders?: string;
}

export interface ImportPreviewSite {
  domain: string;
  upstream?: string;
  routeId?: string;
  caddyServerName: string;
  tlsEnabled: boolean;
  alreadyImported: boolean;
}
