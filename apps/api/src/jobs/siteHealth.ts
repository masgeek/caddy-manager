import cron, { type ScheduledTask } from "node-cron";
import {
  healthSettingsRepo,
  serverRepo,
  siteRepo,
  siteInventoryRepo,
} from "@caddy-manager/db";
import { CaddyProvider } from "../providers/caddy.js";
import { buildDynamicRoutes } from "../services/config.js";
import { assertSafeHealthUrl } from "../lib/outbound.js";
import {
  provisionInventory,
  shouldProvisionInventory,
} from "../services/inventory.js";
import { logger } from "../lib/logger.js";

let task: ScheduledTask | null = null;
let running = false;
let activeRun: Promise<void> | null = null;
let activeHealthCheck: Promise<void> | null = null;
let lastHealthRun: {
  startedAt: string;
  completedAt?: string;
  checked: number;
  failed: number;
} | null = null;
let settings = {
  enabled: true,
  schedule: "*/5 * * * *",
  timeoutMs: 5000,
  concurrency: 5,
  retries: 2,
  retryDelayMs: 250,
};

export function describeCron(expression: string): string {
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
  timeoutMs = settings.timeoutMs,
): Promise<{ status: "active" | "warning" | "error"; detail: string }> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
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
  if (activeHealthCheck) return activeHealthCheck;

  activeHealthCheck = runSiteHealthChecks();
  try {
    await activeHealthCheck;
  } finally {
    activeHealthCheck = null;
  }
}

async function runSiteHealthChecks(): Promise<void> {
  settings = await healthSettingsRepo.get();
  const started = Date.now();
  const allSites = (await siteRepo.findAll()).filter(isHealthCheckableSite);
  const run: {
    startedAt: string;
    completedAt?: string;
    checked: number;
    failed: number;
  } = {
    startedAt: new Date(started).toISOString(),
    checked: 0,
    failed: 0,
  };
  lastHealthRun = run;
  logger.info({ count: allSites.length }, "Checking API-managed sites");
  let nextIndex = 0;
  const checkSite = async () => {
    for (;;) {
      const index = nextIndex++;
      const site = allSites[index];
      if (!site) return;
      if (site.status === "not_provisioned") continue;
      const checkedAt = new Date();
      const checkStarted = Date.now();
      const url = site.healthEndpoint || `https://${site.domain}`;
      const parsedHeaders = site.healthHeaders
        ? tryParseHeaders(site.healthHeaders)
        : undefined;
      let result: { status: "active" | "warning" | "error"; detail: string } = {
        status: "error",
        detail: "Request failed",
      };
      let attempts = 0;
      for (let attempt = 0; attempt <= settings.retries; attempt += 1) {
        attempts = attempt + 1;
        try {
          await assertSafeHealthUrl(url);
          result = await pingSite(url, parsedHeaders, settings.timeoutMs);
        } catch (err) {
          result = {
            status: "error",
            detail: err instanceof Error ? err.message : String(err),
          };
        }
        if (result.status !== "error" || attempt === settings.retries) break;
        await new Promise((resolve) =>
          setTimeout(resolve, settings.retryDelayMs),
        );
      }
      if (attempts > 1)
        result.detail = `${result.detail} (after ${attempts} attempts)`;
      if (result.status === "active") {
        logger.info(
          { domain: site.domain, url, status: result.status },
          "Site health check completed",
        );
      } else {
        run.failed += 1;
        logger.warn(
          {
            domain: site.domain,
            url,
            status: result.status,
            detail: result.detail,
          },
          "Site health check reported an issue",
        );
      }
      run.checked += 1;
      await siteRepo.updateHealth(
        site.id,
        result.status,
        result.detail,
        Date.now() - checkStarted,
        checkedAt,
        result.status === "error" ? site.consecutiveFailures + 1 : 0,
      );
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(settings.concurrency, allSites.length) },
      () => checkSite(),
    ),
  );
  logger.info(
    { durationMs: Date.now() - started },
    "Site health checks completed",
  );
  run.completedAt = new Date().toISOString();
}

export async function housekeepSiteProvisioning(): Promise<{
  inventoryMarked: number;
  sitesMarked: number;
}> {
  const servers = await serverRepo.findAll();
  let inventoryMarked = 0;

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

    // A missing inventory row can be a transient consistency issue. Never
    // mark an observed site unavailable here; reconciliation has a safety
    // guard below to avoid removing its live route.
  }

  return { inventoryMarked, sitesMarked: 0 };
}

export function hasUntrackedDynamicSite(
  sites: Array<{
    domain: string;
    routeId?: string;
    caddyServerName?: string;
  }>,
  inventory: Array<{
    domain: string;
    managementType: string;
    caddyServerName?: string;
  }>,
  serverName: string,
): boolean {
  const inventoryDomains = new Set(
    inventory
      .filter(
        (item) =>
          item.managementType === "dynamic" &&
          (item.caddyServerName ?? serverName) === serverName,
      )
      .map((item) => item.domain),
  );
  return sites.some(
    (site) =>
      Boolean(site.routeId) &&
      (site.caddyServerName ?? serverName) === serverName &&
      !inventoryDomains.has(site.domain),
  );
}

export async function runSiteHealthCycle(): Promise<void> {
  await housekeepSiteProvisioning();
  await checkAllSites();
}

export async function reconcileSelectedSites(
  siteIds: string[],
): Promise<Array<{ siteId: string; success: boolean; error?: string }>> {
  const results: Array<{ siteId: string; success: boolean; error?: string }> =
    [];
  for (const siteId of siteIds) {
    try {
      const preview = await previewSelectedSites([siteId]);
      const conflict = preview[0]?.action === "conflict";
      if (conflict)
        throw new Error(preview[0]?.detail ?? "Reconciliation conflict");
      await provisionInventory(siteId);
      results.push({ siteId, success: true });
    } catch (error) {
      results.push({
        siteId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

export function getSiteHealthJobStatus(): {
  enabled: boolean;
  running: boolean;
  schedule: string;
  lastRun: typeof lastHealthRun;
} {
  return {
    enabled: Boolean(task),
    running,
    schedule: settings.schedule,
    lastRun: lastHealthRun,
  };
}

export async function getSiteHealthSettings() {
  settings = await healthSettingsRepo.get();
  return { ...settings, scheduleDescription: describeCron(settings.schedule) };
}

export interface SelectedReconcilePreview {
  siteId: string;
  domain: string;
  routeId: string;
  serverName: string;
  action: "create" | "update" | "already_correct" | "conflict";
  detail: string;
}

export async function previewSelectedSites(
  siteIds: string[],
): Promise<SelectedReconcilePreview[]> {
  const previews: SelectedReconcilePreview[] = [];
  for (const siteId of siteIds) {
    const item = await siteInventoryRepo.findById(siteId);
    if (!item || item.managementType !== "dynamic" || !item.routeId) {
      previews.push({
        siteId,
        domain: item?.domain ?? siteId,
        routeId: item?.routeId ?? "",
        serverName: item?.caddyServerName ?? "",
        action: "conflict",
        detail:
          "Only dynamic inventory entries with a route ID can be reconciled",
      });
      continue;
    }
    if (!item.serverId) {
      previews.push({
        siteId,
        domain: item.domain,
        routeId: item.routeId,
        serverName: item.caddyServerName ?? "",
        action: "conflict",
        detail: "Inventory entry is not attached to a server",
      });
      continue;
    }
    const server = await serverRepo.findById(item.serverId);
    if (!server) throw new Error(`Server not found: ${item.serverId}`);
    const provider = new CaddyProvider({ apiEndpoint: server.apiEndpoint });
    const serverNames = await provider.getServerNames();
    const serverName = item.caddyServerName ?? serverNames[0];
    if (!serverName || !serverNames.includes(serverName)) {
      previews.push({
        siteId,
        domain: item.domain,
        routeId: item.routeId,
        serverName: serverName ?? "",
        action: "conflict",
        detail: `Caddy server block not found: ${serverName ?? "(none)"}`,
      });
      continue;
    }
    const desired = buildDynamicRoutes([
      {
        serverId: item.serverId,
        domain: item.domain,
        routeId: item.routeId,
        caddyServerName: item.caddyServerName,
        upstream: item.upstream,
        routeConfig: item.routeConfig,
        tlsEnabled: item.tlsEnabled,
      },
    ]);
    const desiredRoute = desired.find((route) => route["@id"] === item.routeId);
    if (!desiredRoute)
      throw new Error(`Desired route '${item.routeId}' was not built`);
    let current: Record<string, unknown> | undefined;
    try {
      current = await provider.getRouteByID(item.routeId);
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("404")))
        throw error;
    }
    previews.push({
      siteId,
      domain: item.domain,
      routeId: item.routeId,
      serverName,
      action: !current
        ? "create"
        : JSON.stringify(current) === JSON.stringify(desiredRoute)
          ? "already_correct"
          : "update",
      detail: !current
        ? "Route is missing and will be created"
        : JSON.stringify(current) === JSON.stringify(desiredRoute)
          ? "Caddy already matches the desired route"
          : "Caddy route differs from the inventory definition",
    });
  }
  return previews;
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
      const sites = await siteRepo.findAll(server.id);
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
        if (hasUntrackedDynamicSite(sites, inventory, serverName)) {
          logger.warn(
            { server: server.name, serverBlock: serverName },
            "Skipped reconciliation because an observed API-managed site has no inventory definition",
          );
          continue;
        }
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
      else
        logger.error(
          { err, server: server.name },
          "Site reconciliation failed",
        );
    }
  }

  logger.info(
    { servers: servers.length, dynamicSites: report.dynamicSites },
    "Site reconciliation completed",
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

export async function startSiteHealthJob(): Promise<void> {
  if (task) return;

  settings = await healthSettingsRepo.get();
  if (!settings.enabled) {
    logger.info("Background site health job disabled by configuration");
    return;
  }

  const expression = settings.schedule;
  logger.info(
    { schedule: expression, description: describeCron(expression) },
    "Starting scheduled site health job",
  );
  task = cron.schedule(expression, () => {
    if (running) return;
    running = true;
    const run = runSiteHealthCycle().catch((err) =>
      logger.error({ err }, "Scheduled site health job failed"),
    );
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
