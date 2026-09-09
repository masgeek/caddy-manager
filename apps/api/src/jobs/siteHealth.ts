import cron, { type ScheduledTask } from "node-cron";
import { serverRepo, siteRepo, siteInventoryRepo } from "@caddy-manager/db";
import { config } from "@caddy-manager/config";
import { CaddyProvider } from "../providers/caddy.js";
import { buildDynamicRoutes } from "../services/config.js";
import { assertSafeHealthUrl } from "../lib/outbound.js";
import {
  provisionInventory,
  shouldProvisionInventory,
} from "../services/inventory.js";

const PING_TIMEOUT = 5000;

let task: ScheduledTask | null = null;
let running = false;
let activeRun: Promise<void> | null = null;

function describeCron(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) return expression;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const weekdays: Record<string, string> = {
    "0": "Sunday",
    "1": "Monday",
    "2": "Tuesday",
    "3": "Wednesday",
    "4": "Thursday",
    "5": "Friday",
    "6": "Saturday",
    "7": "Sunday",
  };

  const months: Record<string, string> = {
    "1": "January",
    "2": "February",
    "3": "March",
    "4": "April",
    "5": "May",
    "6": "June",
    "7": "July",
    "8": "August",
    "9": "September",
    "10": "October",
    "11": "November",
    "12": "December",
  };

  const fmtTime = (h: string, m: string) =>
    `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  const hasTime = hour !== "*" && minute !== "*";
  const timeStr = hasTime ? fmtTime(hour, minute) : "";

  if (
    minute.startsWith("*/") &&
    hour === "*" &&
    dayOfWeek === "*" &&
    dayOfMonth === "*" &&
    month === "*"
  ) {
    return `Every ${minute.slice(2)} minutes`;
  }

  if (
    hour.startsWith("*/") &&
    minute === "0" &&
    dayOfWeek === "*" &&
    dayOfMonth === "*" &&
    month === "*"
  ) {
    return `Every ${hour.slice(2)} hours`;
  }

  if (dayOfWeek !== "*" && dayOfMonth !== "*") {
    const dow = weekdays[dayOfWeek] ?? `day ${dayOfWeek}`;
    const dom = dayOfMonth === "L" ? "last day" : `day ${dayOfMonth}`;
    return hasTime
      ? `${dow} and on ${dom} at ${timeStr}`
      : `${dow} and on ${dom}`;
  }

  if (month !== "*") {
    return hasTime
      ? `Every ${months[month] ?? month} at ${timeStr}`
      : `Every ${months[month] ?? month}`;
  }

  if (dayOfWeek !== "*") {
    const dow = weekdays[dayOfWeek] ?? `day ${dayOfWeek}`;
    return hasTime ? `Every ${dow} at ${timeStr}` : `Every ${dow}`;
  }

  if (dayOfMonth !== "*") {
    const dom = dayOfMonth === "L" ? "last day" : `day ${dayOfMonth}`;
    return hasTime
      ? `On ${dom} of every month at ${timeStr}`
      : `On ${dom} of every month`;
  }

  return hasTime ? `Every day at ${timeStr}` : `Every day`;
}

export function classifyHttpStatus(
  status: number,
): "active" | "warning" | "error" {
  if (status >= 400 && status < 500) return "warning";
  if (status >= 500) return "error";
  return "active";
}

async function pingSite(
  url: string,
  headers?: Record<string, string>,
): Promise<{ status: "active" | "warning" | "error"; detail: string }> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), PING_TIMEOUT);
  try {
    const opts: RequestInit = {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    };
    if (headers && Object.keys(headers).length > 0) {
      opts.headers = headers;
    }
    const res = await fetch(url, opts);
    return {
      status: classifyHttpStatus(res.status),
      detail: `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { status: "error", detail: detail || "Request failed" };
  } finally {
    clearTimeout(id);
  }
}

export function isHealthCheckableSite(site: { routeId?: string }): boolean {
  return Boolean(site.routeId);
}

export async function checkAllSites(): Promise<void> {
  const started = Date.now();
  const allSites = (await siteRepo.findAll()).filter(isHealthCheckableSite);
  console.log(`[site-health] checking ${allSites.length} API-managed sites`);
  for (const site of allSites) {
    if (site.status === "not_provisioned") continue;
    const checkedAt = new Date();
    const checkStarted = Date.now();
    const url = site.healthEndpoint || `https://${site.domain}`;
    const parsedHeaders = site.healthHeaders
      ? tryParseHeaders(site.healthHeaders)
      : undefined;
    let result: { status: "active" | "warning" | "error"; detail: string };
    try {
      await assertSafeHealthUrl(url);
      result = await pingSite(url, parsedHeaders);
    } catch (err) {
      result = {
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
    if (result.status === "active") {
      console.log(`[site-health] ${site.domain} → active (${url})`);
    } else if (result.status === "warning") {
      console.warn(
        `[site-health] ${site.domain} → warning: ${result.detail} (${url})`,
      );
    } else {
      console.error(
        `[site-health] ${site.domain} → error: ${result.detail} (${url})`,
      );
    }
    await siteRepo.updateHealth(
      site.id,
      result.status,
      result.detail,
      Date.now() - checkStarted,
      checkedAt,
      result.status === "error" ? site.consecutiveFailures + 1 : 0,
    );
  }
  console.log(`[site-health] completed in ${Date.now() - started}ms`);
}

export async function housekeepSiteProvisioning(): Promise<{
  inventoryMarked: number;
  sitesMarked: number;
}> {
  const servers = await serverRepo.findAll();
  let inventoryMarked = 0;
  let sitesMarked = 0;

  for (const server of servers) {
    const inventory = await siteInventoryRepo.findAll(server.id);
    const sites = await siteRepo.findAll(server.id);
    const inventoryByDomain = new Map(
      inventory.map((item) => [item.domain, item]),
    );
    const sitesByDomain = new Map(sites.map((site) => [site.domain, site]));

    for (const item of inventory) {
      if (
        item.managementType === "dynamic" &&
        ["provisioned", "provisioning"].includes(item.state) &&
        !sitesByDomain.has(item.domain)
      ) {
        await siteInventoryRepo.markNotProvisioned(
          item.id,
          "No matching provisioned site exists",
        );
        inventoryMarked += 1;
      }
    }

    for (const site of sites) {
      if (!inventoryByDomain.has(site.domain)) {
        await siteRepo.markNotProvisioned(
          site.id,
          "No matching site inventory definition exists",
        );
        sitesMarked += 1;
      }
    }
  }

  return { inventoryMarked, sitesMarked };
}

function routeContainsSite(
  route: Record<string, unknown>,
  site: { domain: string; routeId?: string },
): boolean {
  if (site.routeId && route["@id"] === site.routeId) return true;

  const match = (
    route.match as Array<Record<string, unknown>> | undefined
  )?.[0];
  const hosts = match?.host as string[] | undefined;
  if (hosts?.includes(site.domain)) return true;

  const nestedRoutes = [
    ...((route.routes as Array<Record<string, unknown>> | undefined) ?? []),
    ...(
      (route.handle as Array<Record<string, unknown>> | undefined) ?? []
    ).flatMap(
      (handler) =>
        (handler.routes as Array<Record<string, unknown>> | undefined) ?? [],
    ),
  ];
  return nestedRoutes.some((nestedRoute) =>
    routeContainsSite(nestedRoute, site),
  );
}

export function configContainsSite(
  configData: Record<string, unknown>,
  site: { domain: string; routeId?: string },
  serverName?: string,
): boolean {
  const apps = configData.apps as Record<string, unknown> | undefined;
  const http = apps?.http as Record<string, unknown> | undefined;
  const servers = http?.servers as Record<string, unknown> | undefined;
  if (!servers) return false;

  return Object.entries(servers).some(([name, server]) => {
    if (serverName && name !== serverName) return false;
    const routes = (server as Record<string, unknown>).routes as
      Array<Record<string, unknown>> | undefined;
    return routes?.some((route) => routeContainsSite(route, site)) ?? false;
  });
}

export interface ReconcileReport {
  inventoryStates: Record<string, number>;
  caddyfileManaged: number;
  dynamicSites: number;
  routeGroups: number;
  routesToCreate: number;
  routesToUpdate: number;
  legacyRoutes: number;
  routesAlreadyCorrect: number;
  conflicts: string[];
}

export async function reconcileAllSites(
  options: { dryRun?: boolean } = {},
): Promise<ReconcileReport> {
  const servers = await serverRepo.findAll();
  const report: ReconcileReport = {
    inventoryStates: {},
    caddyfileManaged: 0,
    dynamicSites: 0,
    routeGroups: 0,
    routesToCreate: 0,
    routesToUpdate: 0,
    legacyRoutes: 0,
    routesAlreadyCorrect: 0,
    conflicts: [],
  };

  for (const server of servers) {
    try {
      const provider = new CaddyProvider({ apiEndpoint: server.apiEndpoint });
      const inventory = await siteInventoryRepo.findAll(server.id);
      for (const item of inventory) {
        report.inventoryStates[item.state] =
          (report.inventoryStates[item.state] ?? 0) + 1;
      }
      const dynamicSites = inventory.filter(
        (item) =>
          item.managementType === "dynamic" &&
          item.routeId !== undefined &&
          item.routeId !== null,
      );
      report.caddyfileManaged += inventory.filter(
        (item) => item.managementType === "caddyfile",
      ).length;
      report.dynamicSites += dynamicSites.length;
      const serverNames = await provider.getServerNames();
      const byServer = new Map<string, typeof dynamicSites>();
      for (const site of dynamicSites) {
        const serverName = site.caddyServerName ?? serverNames[0];
        if (serverName)
          byServer.set(serverName, [...(byServer.get(serverName) ?? []), site]);
      }
      for (const [serverName, serverSites] of byServer) {
        const eligible = serverSites
          .filter(
            (item) =>
              item.serverId === server.id &&
              shouldProvisionInventory(item.state),
          )
          .map((item) => ({ ...item, serverId: item.serverId! }));
        const routes = buildDynamicRoutes(eligible);
        report.routeGroups += routes.length;
        if (options.dryRun) {
          let actual: Array<Record<string, unknown>> = [];
          try {
            actual = await provider.getServerRoutes(serverName);
          } catch (error) {
            if (!(
              error instanceof Error &&
              error.message.startsWith("Caddy API error: 404")
            ))
              throw error;
          }
          const actualIds = new Set(actual.map((route) => route["@id"]));
          for (const route of routes) {
            const current = actual.find(
              (candidate) => candidate["@id"] === route["@id"],
            );
            if (!actualIds.has(route["@id"])) report.routesToCreate++;
            else if (JSON.stringify(current) === JSON.stringify(route))
              report.routesAlreadyCorrect++;
            else report.routesToUpdate++;
          }
          report.legacyRoutes += (
            await provider.findLegacyRoutes(
              serverName,
              routes.map((route) => route["@id"] as string),
            )
          ).length;
        } else {
          const candidate = eligible.find((item) => item.routeId);
          if (candidate) await provisionInventory(candidate.id);
          else await provider.getServerRoutes(serverName);
        }
      }
      if (!options.dryRun && byServer.size === 0) {
        for (const serverName of serverNames)
          await provider.getServerRoutes(serverName);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("Conflicting configuration"))
        report.conflicts.push(`${server.name}: ${message}`);
      else console.error(`[site-sync] failed for server ${server.name}`, err);
    }
  }

  console.log(
    `[site-sync] checked ${servers.length} servers, ${report.dynamicSites} dynamic sites reconciled`,
  );
  return report;
}

function tryParseHeaders(raw: string): Record<string, string> | undefined {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    /* invalid JSON, ignore */
  }
  return undefined;
}

export function startSiteHealthJob(): void {
  if (task) return;

  if (!config.siteHealthEnabled) {
    console.log("[site-health] background job disabled by SITE_HEALTH_ENABLED");
    return;
  }

  const expression = config.siteCheckCron;
  console.log(
    `[site-health] starting scheduled job (${describeCron(expression)})`,
  );
  task = cron.schedule(expression, () => {
    if (running) return;
    running = true;
    const run = Promise.resolve()
      .then(() => housekeepSiteProvisioning())
      .then(() => checkAllSites())
      .then(async () => {
        await reconcileAllSites();
      })
      .catch((err) => console.error("[site-health] job failed", err));
    activeRun = run;
    void run.finally(() => {
      running = false;
      if (activeRun === run) activeRun = null;
    });
  });
}

export async function stopSiteHealthJob(): Promise<void> {
  if (task) {
    task.stop();
    task = null;
  }
  if (activeRun) await activeRun;
}
