import { config } from "@caddy-manager/config";
import { assertAllowedCaddyEndpoint } from "../lib/outbound.js";

export interface ProviderConfig {
  apiEndpoint: string;
  timeout?: number;
}

export const DYNAMIC_SITES_ID = "dynamic-sites";
export const DYNAMIC_SITE_ROUTER_ID = "dynamic-site-router";

const dynamicLocks = new Map<string, Promise<void>>();

export class CaddyProvider {
  private apiEndpoint: string;
  private timeout: number;
  private token: string;

  constructor(configOverride: ProviderConfig) {
    this.apiEndpoint = assertAllowedCaddyEndpoint(configOverride.apiEndpoint);
    this.timeout = configOverride.timeout ?? 5000;
    this.token = config.caddyAdminToken;
  }

  private getHeaders(options?: RequestInit): Record<string, string> {
    const h: Record<string, string> = {
      Origin: `http://localhost:2019`,
    };
    const method = options?.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      h["Content-Type"] = "application/json";
    }
    if (this.token) {
      h.Authorization = `Bearer ${this.token}`;
    }
    return h;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.apiEndpoint}${path}`, {
        ...options,
        signal: controller.signal,
        redirect: "follow",
        headers: {
          ...this.getHeaders(options),
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `Caddy API error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`,
        );
      }

      const text = await response.text();
      if (!text) return null as T;
      try {
        return JSON.parse(text) as T;
      } catch (error) {
        throw new Error(
          `Malformed JSON response from Caddy API at ${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      clearTimeout(id);
    }
  }

  async getConfig(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/config/");
  }

  async reloadConfig(configData: Record<string, unknown>): Promise<void> {
    await this.request("/load", {
      method: "POST",
      body: JSON.stringify(configData),
    });
  }

  async ensureTlsAutomation(domains: string[]): Promise<void> {
    if (domains.length === 0) return;
    const current = await this.getConfig();
    const apps = (current.apps as Record<string, unknown> | undefined) ?? {};
    const tls = (apps.tls as Record<string, unknown> | undefined) ?? {};
    const automation =
      (tls.automation as Record<string, unknown> | undefined) ?? {};
    const policies = Array.isArray(automation.policies)
      ? (automation.policies as Array<Record<string, unknown>>)
      : [];
    const existing = policies[0] ?? {};
    const existingSubjects = Array.isArray(existing.subjects)
      ? (existing.subjects as unknown[]).filter(
          (subject): subject is string => typeof subject === "string",
        )
      : [];
    const subjects = [...new Set([...existingSubjects, ...domains])].sort();
    const nextApps = structuredClone(apps);
    nextApps.tls = {
      ...tls,
      automation: {
        ...automation,
        policies: [{ ...existing, subjects }, ...policies.slice(1)],
      },
    };
    await this.reloadConfig({ ...current, apps: nextApps });
  }

  async health(): Promise<void> {
    await this.request("/config/");
  }

  async getLogs(): Promise<string[]> {
    const response = await this.request<unknown>("/logs/request.json");
    if (!Array.isArray(response))
      throw new Error("Malformed Caddy logs response");
    return response as string[];
  }

  async getServerNames(): Promise<string[]> {
    const servers = await this.request<unknown>("/config/apps/http/servers/");
    if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
      throw new Error("Malformed Caddy servers response");
    }
    return Object.keys(servers as Record<string, unknown>);
  }

  async addRoute(
    serverName: string,
    route: Record<string, unknown>,
  ): Promise<void> {
    await this.request(
      `/config/apps/http/servers/${encodeURIComponent(serverName)}/routes`,
      {
        method: "POST",
        body: JSON.stringify(route),
      },
    );
  }

  async getRouteByID<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(routeId: string): Promise<T> {
    return this.request<T>(`/id/${encodeURIComponent(routeId)}`);
  }

  async getServerRoutes(
    serverName: string,
  ): Promise<Array<Record<string, unknown>>> {
    const routes = await this.request<unknown>(
      `/config/apps/http/servers/${encodeURIComponent(serverName)}/routes`,
    );
    if (!Array.isArray(routes))
      throw new Error(
        `Malformed Caddy routes response for server ${serverName}`,
      );
    return routes as Array<Record<string, unknown>>;
  }

  async ensureDynamicRouteContainer(serverName: string): Promise<void> {
    let container: Record<string, unknown> | undefined;
    try {
      container = await this.getRouteByID(DYNAMIC_SITES_ID);
    } catch (error) {
      if (!(
        error instanceof Error &&
        error.message.startsWith("Caddy API error: 404")
      ))
        throw error;
    }

    if (!container) {
      await this.addRoute(serverName, {
        "@id": DYNAMIC_SITES_ID,
        handle: [
          { "@id": DYNAMIC_SITE_ROUTER_ID, handler: "subroute", routes: [] },
        ],
      });
    } else {
      try {
        await this.getRouteByID(DYNAMIC_SITE_ROUTER_ID);
      } catch (error) {
        if (!(
          error instanceof Error &&
          error.message.startsWith("Caddy API error: 404")
        ))
          throw error;
        const handles =
          (container.handle as Array<Record<string, unknown>> | undefined) ??
          [];
        await this.updateRouteByID(DYNAMIC_SITES_ID, {
          handle: [
            ...handles,
            { "@id": DYNAMIC_SITE_ROUTER_ID, handler: "subroute", routes: [] },
          ],
        });
      }
    }
  }

  async findLegacyRoutes(
    serverName: string,
    routeIds: string[],
  ): Promise<Array<Record<string, unknown>>> {
    if (routeIds.length === 0) return [];
    return (await this.getServerRoutes(serverName)).filter(
      (route) =>
        typeof route["@id"] === "string" &&
        routeIds.includes(route["@id"] as string),
    );
  }

  async getDynamicRoutes(): Promise<Array<Record<string, unknown>>> {
    const dynamic = await this.getRouteByID<{ routes?: unknown }>(
      DYNAMIC_SITE_ROUTER_ID,
    );
    if (!Array.isArray(dynamic.routes))
      throw new Error("Malformed dynamic-site-router response from Caddy");
    return dynamic.routes as Array<Record<string, unknown>>;
  }

  async replaceDynamicRoutes(
    routes: Array<Record<string, unknown>>,
  ): Promise<void> {
    await this.request(
      `/id/${encodeURIComponent(DYNAMIC_SITE_ROUTER_ID)}/routes`,
      {
        // PATCH replaces the existing array value; PUT tries to add a second
        // `routes` key when the dynamic subroute has already been created.
        method: "PATCH",
        body: JSON.stringify(routes),
      },
    );
  }

  async withDynamicRouteLock<T>(
    serverName: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = `${this.apiEndpoint}/${serverName}`;
    const previous = dynamicLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    dynamicLocks.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (dynamicLocks.get(key) === current) dynamicLocks.delete(key);
    }
  }

  async updateRouteByID(
    routeId: string,
    route: Record<string, unknown>,
  ): Promise<void> {
    await this.request(`/id/${encodeURIComponent(routeId)}`, {
      method: "PATCH",
      body: JSON.stringify(route),
    });
  }

  async deleteRouteByID(routeId: string): Promise<void> {
    await this.request(`/id/${encodeURIComponent(routeId)}`, {
      method: "DELETE",
    });
  }
}
