import type { Server, Site } from "@caddy-manager/shared-types";
import { siteRepo, serverRepo, backfillSiteInventory } from "@caddy-manager/db";
import { CaddyProvider } from "../providers/caddy";

export interface ParsedSite {
  domain: string;
  upstream?: string;
  routeId?: string;
  caddyServerName: string;
  tlsEnabled: boolean;
  routeConfig: Record<string, unknown>;
}

export interface ImportPreviewSite extends ParsedSite {
  alreadyImported: boolean;
}

function findReverseProxyDial(
  handles: Array<Record<string, unknown>> | undefined,
): string | undefined {
  if (!handles) return undefined;
  for (const h of handles) {
    if (h.handler === "reverse_proxy") {
      const upstreams = h.upstreams as
        Array<Record<string, unknown>> | undefined;
      const dial = upstreams?.[0]?.dial as string | undefined;
      if (dial) return dial;
    }
    if (h.handler === "subroute") {
      const subRoutes = h.routes as Array<Record<string, unknown>> | undefined;
      if (subRoutes) {
        for (const sr of subRoutes) {
          const result = findReverseProxyDial(
            sr.handle as Array<Record<string, unknown>> | undefined,
          );
          if (result) return result;
        }
      }
    }
  }
  return undefined;
}

function collectTlsDomains(
  tls: Record<string, unknown> | undefined,
): Set<string> {
  const domains = new Set<string>();
  if (!tls) return domains;

  // automation.policies[].subjects[] (v2.8+ common format)
  const automation = tls.automation as Record<string, unknown> | undefined;
  if (automation) {
    const policies = automation.policies as
      Array<Record<string, unknown>> | undefined;
    if (policies) {
      for (const p of policies) {
        const subjects = p.subjects as string[] | undefined;
        if (subjects) {
          for (const s of subjects) domains.add(normalizeHostname(s));
        }
      }
    }
  }

  // certificates.auto[] / certificates.automate[] (legacy format)
  const certs = (tls.certificates ?? tls.cert) as
    Record<string, unknown> | undefined;
  if (certs) {
    const automated = (certs.automate ?? certs.auto) as string[] | undefined;
    if (automated) {
      for (const d of automated) domains.add(normalizeHostname(d));
    }
  }

  return domains;
}

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/, "");
}

export function parseSitesFromConfig(
  config: Record<string, unknown>,
): ParsedSite[] {
  const apps = config.apps as Record<string, unknown> | undefined;
  if (!apps) return [];

  const http = apps.http as Record<string, unknown> | undefined;
  if (!http) return [];

  const servers = http.servers as Record<string, unknown> | undefined;
  if (!servers) return [];

  const tlsDomains = collectTlsDomains(
    apps.tls as Record<string, unknown> | undefined,
  );

  const sites: ParsedSite[] = [];
  const seen = new Set<string>();

  for (const serverName of Object.keys(servers)) {
    const srv = servers[serverName] as Record<string, unknown>;
    const routes = srv.routes as Array<Record<string, unknown>> | undefined;
    if (!routes) continue;

    for (const route of routes) {
      const match = (
        route.match as Array<Record<string, unknown>> | undefined
      )?.[0];
      const hosts = match?.host as string[] | undefined;
      if (!hosts || hosts.length === 0) continue;

      const dial = findReverseProxyDial(
        route.handle as Array<Record<string, unknown>> | undefined,
      );
      const upstreamUrl = dial
        ? dial.includes("://")
          ? dial
          : `http://${dial}`
        : undefined;
      const routeId = route["@id"] as string | undefined;

      for (const rawDomain of hosts) {
        const domain = normalizeHostname(rawDomain);
        if (!domain) continue;
        if (seen.has(domain)) continue;
        seen.add(domain);
        sites.push({
          domain,
          upstream: upstreamUrl,
          routeId,
          caddyServerName: serverName,
          tlsEnabled: tlsDomains.has(domain),
          routeConfig: structuredClone(route),
        });
      }
    }
  }

  return sites;
}

export async function importSitesFromConfig(
  server: Server,
  provider: CaddyProvider,
): Promise<{ imported: number; skipped: number; sites: Site[] }> {
  const config = await provider.getConfig();
  console.log(
    "=== Imported Caddy config ===\n" +
      JSON.stringify(config, null, 2) +
      "\n=============================",
  );

  const parsed = parseSitesFromConfig(config);

  let imported = 0;
  let skipped = 0;
  const sites: Site[] = [];

  for (const p of parsed) {
    const existing = await siteRepo.findByDomainAndServer(p.domain, server.id);
    if (existing) {
      skipped++;
      const updated = await siteRepo.update(existing.id, {
        routeId: p.routeId,
        routeConfig: p.routeConfig,
      });
      sites.push(updated ?? existing);
      continue;
    }

    const site = await siteRepo.create({
      serverId: server.id,
      domain: p.domain,
      upstream: p.upstream,
      routeId: p.routeId,
      caddyServerName: p.caddyServerName,
      tlsEnabled: p.tlsEnabled,
      routeConfig: p.routeConfig,
    });
    imported++;
    sites.push(site);
  }

  await backfillSiteInventory();
  return { imported, skipped, sites };
}

export async function previewSitesFromConfig(
  server: Server,
  provider: CaddyProvider,
): Promise<ImportPreviewSite[]> {
  const parsed = parseSitesFromConfig(await provider.getConfig());
  return Promise.all(
    parsed.map(async (site) => ({
      ...site,
      alreadyImported: !!(await siteRepo.findByDomainAndServer(
        site.domain,
        server.id,
      )),
    })),
  );
}

export function buildCaddyConfig(
  server: Server,
  sites: Site[],
): Record<string, unknown> {
  const dynamicSites = sites.filter(
    (site) => site.routeId !== undefined && site.routeId !== null,
  );
  const serverRoutes = buildDynamicRoutes(dynamicSites);

  const apps: Record<string, unknown> = {
    http: {
      servers: {
        srv0: {
          listen: [":80", ":443"],
          routes: serverRoutes,
        },
      },
    },
  };

  const tlsSites = dynamicSites.filter((s) => s.tlsEnabled);
  if (tlsSites.length > 0) {
    apps.tls = {
      automation: {
        policies: [
          {
            subjects: tlsSites.map((s) => s.domain).sort(),
          },
        ],
      },
    };
  }

  return { apps };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function routeBehavior(route: Record<string, unknown>): string {
  const copy = structuredClone(route);
  delete copy["@id"];
  const matches = copy.match as Array<Record<string, unknown>> | undefined;
  if (matches?.length) {
    copy.match = matches.map((match) => {
      const withoutHost = { ...match };
      delete withoutHost.host;
      return withoutHost;
    });
  }
  return stableJson(copy);
}

export interface DynamicRouteSite {
  serverId?: string;
  domain: string;
  upstream?: string;
  routeId?: string;
  caddyServerName?: string;
  routeConfig?: Record<string, unknown>;
  tlsEnabled: boolean;
}

export function buildDynamicRoutes(
  sites: DynamicRouteSite[],
): Array<Record<string, unknown>> {
  const groups = new Map<
    string,
    {
      routeId: string;
      route: Record<string, unknown>;
      hosts: Set<string>;
      configuration: string;
    }
  >();
  for (const site of sites) {
    if (!site.routeId) continue;
    const route = buildCaddyRoute({
      domain: site.domain,
      upstream: site.upstream,
      routeId: site.routeId,
      routeConfig: site.routeConfig,
    });
    const configuration = `${routeBehavior(route)}|tls=${site.tlsEnabled}`;
    const routeHosts = ((
      site.routeConfig?.match as Array<Record<string, unknown>> | undefined
    )?.[0]?.host ?? []) as string[];
    const groupKey = `${site.serverId ?? ""}:${site.caddyServerName ?? ""}:${site.routeId}`;
    const group = groups.get(groupKey);
    if (group) {
      if (group.configuration !== configuration) {
        throw new Error(
          `Conflicting configuration for dynamic route '${site.routeId}'`,
        );
      }
      group.hosts.add(site.domain);
      continue;
    }
    groups.set(groupKey, {
      routeId: site.routeId,
      route,
      hosts: new Set(routeHosts.length > 0 ? routeHosts : [site.domain]),
      configuration,
    });
  }

  return [...groups.values()].map(({ routeId, route, hosts }) => {
    const result = structuredClone(route);
    result["@id"] = routeId;
    const matches = result.match as Array<Record<string, unknown>> | undefined;
    if (matches?.length)
      matches[0] = { ...matches[0], host: [...hosts].sort() };
    return result;
  });
}

export function buildCaddyRoute(site: {
  domain: string;
  upstream?: string;
  routeId?: string;
  routeConfig?: Record<string, unknown>;
}): Record<string, unknown> {
  if (site.routeConfig) {
    const route = structuredClone(site.routeConfig);
    const matches = route.match as Array<Record<string, unknown>> | undefined;
    if (matches?.length) {
      route.match = matches.map((match, index) =>
        index === 0 ? { ...match, host: [site.domain] } : match,
      );
    }
    if (site.routeId) route["@id"] = site.routeId;
    return route;
  }

  if (!site.upstream) {
    throw new Error(
      "An upstream URL is required when no custom route configuration is provided",
    );
  }

  return {
    "@id": site.routeId || site.domain.replace(/[^a-zA-Z0-9_-]/g, "_"),
    match: [{ host: [site.domain] }],
    handle: [
      {
        handler: "reverse_proxy",
        upstreams: [{ dial: site.upstream.replace(/^https?:\/\//, "") }],
      },
    ],
  };
}

export function parseServerBlocksFromConfig(
  config: Record<string, unknown>,
): Array<{
  name: string;
  domains: string[];
}> {
  const apps = config.apps as Record<string, unknown> | undefined;
  if (!apps) return [];

  const http = apps.http as Record<string, unknown> | undefined;
  if (!http) return [];

  const servers = http.servers as Record<string, unknown> | undefined;
  if (!servers) return [];

  const blocks: Array<{ name: string; domains: string[] }> = [];
  const seen = new Set<string>();

  for (const serverName of Object.keys(servers)) {
    const srv = servers[serverName] as Record<string, unknown>;
    const routes = srv.routes as Array<Record<string, unknown>> | undefined;
    if (!routes) continue;

    const domains: string[] = [];
    for (const route of routes) {
      const match = (
        route.match as Array<Record<string, unknown>> | undefined
      )?.[0];
      const hosts = match?.host as string[] | undefined;
      if (!hosts) continue;
      for (const h of hosts) {
        if (!seen.has(h)) {
          seen.add(h);
          domains.push(h);
        }
      }
    }
    if (domains.length > 0) {
      blocks.push({ name: serverName, domains });
    }
  }

  return blocks;
}

function hostnameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return url;
  }
}

const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
  "ac.ke",
  "ci.ke",
  "co.ke",
  "go.ke",
  "me.ke",
  "ne.ke",
  "or.ke",
  "sc.ke",
  "co.uk",
  "org.uk",
  "com.au",
  "co.nz",
  "co.za",
  "com.br",
  "com.cn",
]);

export function deriveBaseDomain(domain: string): string {
  const hostname = domain.trim().toLowerCase().replace(/^\*\./, "");
  const labels = hostname.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".") || "unknown";

  const suffix = labels.slice(-2).join(".");
  return labels
    .slice(-(MULTI_LABEL_PUBLIC_SUFFIXES.has(suffix) ? 3 : 2))
    .join(".");
}

export async function discoverAndImport(apiEndpoint: string): Promise<{
  servers: Server[];
  imported: number;
  skipped: number;
  sites: Site[];
}> {
  const provider = new CaddyProvider({ apiEndpoint });
  const config = await provider.getConfig();
  const parsed = parseSitesFromConfig(config);
  if (parsed.length === 0) throw new Error("No sites found in Caddy config");

  const hostname = hostnameFromUrl(apiEndpoint);

  const allServers = await serverRepo.findAll();
  const servers = new Map<string, Server>();
  const getServer = async (name: string): Promise<Server> => {
    const existing = servers.get(name);
    if (existing) return existing;

    const found = allServers.find(
      (s) => s.apiEndpoint === apiEndpoint && s.name === name,
    );
    const server = found
      ? found.hostname === name
        ? found
        : ((await serverRepo.update(found.id, { hostname: name })) ?? found)
      : await serverRepo.create({ name, hostname: name, apiEndpoint });
    servers.set(name, server);
    return server;
  };

  let imported = 0;
  let skipped = 0;
  const sites: Site[] = [];

  for (const p of parsed) {
    const server = await getServer(deriveBaseDomain(p.domain));
    const existing = await siteRepo.findByDomainAndServer(p.domain, server.id);
    if (existing) {
      skipped++;
      const updated = await siteRepo.update(existing.id, {
        routeId: p.routeId,
        routeConfig: p.routeConfig,
      });
      sites.push(updated ?? existing);
      continue;
    }
    const site = await siteRepo.create({
      serverId: server.id,
      domain: p.domain,
      upstream: p.upstream,
      routeId: p.routeId,
      caddyServerName: p.caddyServerName,
      tlsEnabled: p.tlsEnabled,
      routeConfig: p.routeConfig,
    });
    imported++;
    sites.push(site);
  }

  await backfillSiteInventory();
  return { servers: [...servers.values()], imported, skipped, sites };
}

export async function getServerConfig(
  provider: CaddyProvider,
): Promise<Record<string, unknown>> {
  return provider.getConfig();
}

export async function reloadServerConfig(
  provider: CaddyProvider,
  server: Server,
  sites: Site[],
): Promise<void> {
  const serverNames = new Set(
    sites
      .map((site) => site.caddyServerName)
      .filter((name): name is string => !!name),
  );
  if (serverNames.size === 0) {
    const names = await provider.getServerNames();
    if (names[0]) serverNames.add(names[0]);
  }
  for (const serverName of serverNames) {
    await syncDynamicRoutes(
      provider,
      serverName,
      sites.filter(
        (site) => !site.caddyServerName || site.caddyServerName === serverName,
      ),
    );
  }
}

export async function syncDynamicRoutes(
  provider: CaddyProvider,
  caddyServerName: string,
  sites: DynamicRouteSite[],
): Promise<void> {
  await provider.withDynamicRouteLock(caddyServerName, async () => {
    const dynamicSites = sites.filter(
      (site) => site.routeId !== undefined && site.routeId !== null,
    );
    const desired = buildDynamicRoutes(dynamicSites);
    const legacy = await provider.findLegacyRoutes(
      caddyServerName,
      desired.map((route) => route["@id"] as string),
    );
    await provider.replaceDynamicRoutes(caddyServerName, desired);
    await provider.ensureTlsAutomation(
      dynamicSites.filter((site) => site.tlsEnabled).map((site) => site.domain),
    );
    const actual = (await provider.getServerRoutes(caddyServerName)).filter(
      (route) => desired.some((candidate) => candidate["@id"] === route["@id"]),
    );
    if (
      actual.length !== desired.length ||
      actual.some(
        (route) =>
          !desired.some((candidate) => candidate["@id"] === route["@id"]),
      )
    ) {
      throw new Error(
        "Caddy dynamic route verification failed: runtime route set differs from desired state",
      );
    }
    for (const route of desired) {
      const found = actual.find(
        (candidate) => candidate["@id"] === route["@id"],
      );
      const expectedHosts = ((
        route.match as Array<Record<string, unknown>> | undefined
      )?.[0]?.host ?? []) as string[];
      const actualHosts = ((
        found?.match as Array<Record<string, unknown>> | undefined
      )?.[0]?.host ?? []) as string[];
      if (
        !found ||
        found["@id"] !== route["@id"] ||
        stableJson([...actualHosts].sort()) !==
          stableJson([...expectedHosts].sort()) ||
        routeBehavior(found) !== routeBehavior(route)
      ) {
        throw new Error(
          `Caddy dynamic route verification failed for '${route["@id"]}'`,
        );
      }
    }
    for (const route of legacy)
      await provider.deleteRouteByID(route["@id"] as string);
  });
}
