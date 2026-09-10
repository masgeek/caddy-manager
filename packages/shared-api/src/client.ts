import type {
  Server,
  Site,
  SiteInventory,
  SiteGroup,
  HealthResponse,
  AuditEvent,
} from "@caddy-manager/shared-types";
import type {
  PaginatedResponse,
  CreateServerRequest,
  UpdateServerRequest,
  CreateSiteRequest,
  UpdateSiteRequest,
  CreateSiteInventoryRequest,
  UpdateSiteInventoryRequest,
  CreateSiteGroupRequest,
  UpdateSiteGroupRequest,
  ImportPreviewSite,
} from "./types.js";

export interface SiteHealthStatus {
  enabled: boolean;
  running: boolean;
  schedule: string;
  lastRun: {
    startedAt: string;
    completedAt?: string;
    checked: number;
    failed: number;
  } | null;
}
export interface SiteHealthSettings {
  enabled: boolean;
  schedule: string;
  timeoutMs: number;
  concurrency: number;
  retries: number;
  retryDelayMs: number;
  updatedAt: string;
  scheduleDescription?: string;
}

export class ApiClientError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export class ApiClient {
  private baseUrl: string;
  private token: string = "";
  private unauthorizedHandler?: () => void;

  constructor(baseUrl: string, token?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    if (token) this.token = token;
  }

  setToken(token: string) {
    this.token = token;
  }

  setUnauthorizedHandler(handler?: () => void) {
    this.unauthorizedHandler = handler;
  }

  private get headers(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request<T>(path: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      ...this.headers,
    };
    if (options?.body) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...(options?.headers as Record<string, string>) },
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.unauthorizedHandler?.();
      }
      const body = (await response.json().catch(() => undefined)) as
        | {
            message?: string;
            details?: unknown;
          }
        | undefined;
      throw new ApiClientError(
        response.status,
        body?.message ?? `API error: ${response.status} ${response.statusText}`,
        body?.details,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  // Servers
  async getServers(): Promise<Server[]> {
    return this.request("/servers");
  }

  async getServer(id: string): Promise<Server> {
    return this.request(`/servers/${id}`);
  }

  async getServerBlocks(id: string): Promise<string[]> {
    return this.request(`/servers/${id}/blocks`);
  }

  async createServer(data: CreateServerRequest): Promise<Server> {
    return this.request("/servers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateServer(id: string, data: UpdateServerRequest): Promise<Server> {
    return this.request(`/servers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteServer(id: string): Promise<void> {
    return this.request(`/servers/${id}`, { method: "DELETE" });
  }

  // Sites
  async getSites(): Promise<Site[]> {
    return this.request("/sites");
  }

  async getSite(id: string): Promise<Site> {
    return this.request(`/sites/${id}`);
  }

  async createSite(data: CreateSiteRequest): Promise<SiteInventory> {
    return this.request("/sites", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateSite(id: string, data: UpdateSiteRequest): Promise<Site> {
    return this.request(`/sites/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteSite(id: string): Promise<void> {
    return this.request(`/sites/${id}`, { method: "DELETE" });
  }

  async getSiteInventory(serverId?: string): Promise<SiteInventory[]> {
    return this.request(
      `/site-inventory${serverId ? `?serverId=${encodeURIComponent(serverId)}` : ""}`,
    );
  }

  async getSiteGroups(serverId?: string): Promise<SiteGroup[]> {
    return this.request(
      `/site-groups${serverId ? `?serverId=${encodeURIComponent(serverId)}` : ""}`,
    );
  }

  async createSiteGroup(data: CreateSiteGroupRequest): Promise<SiteGroup> {
    return this.request("/site-groups", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateSiteGroup(
    id: string,
    data: UpdateSiteGroupRequest,
  ): Promise<SiteGroup> {
    return this.request(`/site-groups/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteSiteGroup(id: string): Promise<void> {
    return this.request(`/site-groups/${id}`, { method: "DELETE" });
  }

  async ensureDynamicInfrastructure(): Promise<{
    servers: number;
    serverBlocks: number;
  }> {
    return this.request("/site-inventory/ensure-dynamic", {
      method: "POST",
      body: "{}",
    });
  }

  async createSiteInventory(
    data: CreateSiteInventoryRequest,
  ): Promise<SiteInventory> {
    return this.request("/site-inventory", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateSiteInventory(
    id: string,
    data: UpdateSiteInventoryRequest,
  ): Promise<SiteInventory> {
    return this.request(`/site-inventory/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async markInventoryReady(id: string): Promise<SiteInventory> {
    return this.request(`/site-inventory/${id}/ready`, {
      method: "POST",
      body: "{}",
    });
  }

  async provisionInventory(id: string): Promise<SiteInventory> {
    return this.request(`/site-inventory/${id}/provision`, {
      method: "POST",
      body: "{}",
    });
  }

  async disableInventory(id: string): Promise<SiteInventory> {
    return this.request(`/site-inventory/${id}/disable`, {
      method: "POST",
      body: "{}",
    });
  }

  async deleteSiteInventory(id: string): Promise<void> {
    return this.request(`/site-inventory/${id}`, { method: "DELETE" });
  }

  // Config
  async getConfig(serverId: string): Promise<Record<string, unknown>> {
    return this.request(`/config?serverId=${encodeURIComponent(serverId)}`);
  }

  async getGeneratedConfig(serverId: string): Promise<Record<string, unknown>> {
    return this.request(
      `/config/generated?serverId=${encodeURIComponent(serverId)}`,
    );
  }

  async reloadConfig(serverId: string): Promise<void> {
    return this.request("/config/reload", {
      method: "POST",
      body: JSON.stringify({ serverId }),
    });
  }

  // Health
  async getHealth(): Promise<HealthResponse> {
    return this.request("/health");
  }

  // Logs
  async getLogs(params?: {
    limit?: number;
    search?: string;
  }): Promise<string[]> {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.search) query.set("search", params.search);
    const qs = query.toString();
    return this.request(`/logs${qs ? `?${qs}` : ""}`);
  }

  // Audit
  async getAuditLogs(params?: {
    limit?: number;
    userId?: string;
    action?: string;
    entity?: string;
    result?: string;
  }): Promise<AuditEvent[]> {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    for (const key of ["userId", "action", "entity", "result"] as const) {
      if (params?.[key]) query.set(key, params[key]!);
    }
    const qs = query.toString();
    return this.request(`/audit${qs ? `?${qs}` : ""}`);
  }

  // Health
  async checkServerHealth(
    id: string,
  ): Promise<{ status: string; server: Server }> {
    return this.request(`/servers/${id}/health`, { method: "POST" });
  }

  // Import
  async importServerSites(
    id: string,
  ): Promise<{ imported: number; skipped: number; sites: Site[] }> {
    return this.request(`/servers/${id}/import`, {
      method: "POST",
      body: "{}",
    });
  }

  async previewServerSites(id: string): Promise<ImportPreviewSite[]> {
    return this.request(`/servers/${id}/import/preview`);
  }

  // Sync
  async syncSite(id: string): Promise<Site> {
    return this.request(`/sites/${id}/sync`, { method: "POST", body: "{}" });
  }

  async previewReconcileSites(siteIds: string[]): Promise<{
    sites: Array<{
      siteId: string;
      domain: string;
      routeId: string;
      serverName: string;
      action: "create" | "update" | "already_correct" | "conflict";
      detail: string;
    }>;
  }> {
    return this.request("/sites/reconcile/preview", {
      method: "POST",
      body: JSON.stringify({ siteIds }),
    });
  }

  async reconcileSites(siteIds: string[]): Promise<{
    success: boolean;
    message: string;
    results: Array<{ siteId: string; success: boolean; error?: string }>;
  }> {
    return this.request("/sites/reconcile", {
      method: "POST",
      body: JSON.stringify({ siteIds }),
    });
  }

  async getSiteHealthStatus(): Promise<SiteHealthStatus> {
    return this.request("/sites/health/status");
  }

  async getSiteHealthSettings(): Promise<SiteHealthSettings> {
    return this.request("/sites/health/settings");
  }

  async updateSiteHealthSettings(
    settings: Omit<SiteHealthSettings, "updatedAt">,
  ): Promise<SiteHealthSettings> {
    return this.request("/sites/health/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  }

  async pauseSiteHealth(): Promise<SiteHealthStatus> {
    return this.request("/sites/health/pause", { method: "POST", body: "{}" });
  }

  async resumeSiteHealth(): Promise<SiteHealthStatus> {
    return this.request("/sites/health/resume", { method: "POST", body: "{}" });
  }

  async checkAllSites(): Promise<void> {
    return this.request("/sites/health-check", { method: "POST", body: "{}" });
  }

  // Discover
  async discoverServers(apiEndpoint: string): Promise<{
    servers: Server[];
    imported: number;
    skipped: number;
    sites: Site[];
  }> {
    return this.request("/servers/discover", {
      method: "POST",
      body: JSON.stringify({ apiEndpoint }),
    });
  }
}
