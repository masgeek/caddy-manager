import type { SiteInventory } from "@caddy-manager/shared-types";
import {
  serverRepo,
  siteRepo,
  siteInventoryRepo,
  siteGroupRepo,
} from "@caddy-manager/db";
import { CaddyProvider } from "../providers/caddy";
import { buildDynamicRoutes, syncDynamicRoutes } from "./config";
import { AppError, ConflictError, NotFoundError } from "../lib/errors";

const provisioningLocks = new Map<string, Promise<void>>();
const PROVISIONABLE_STATES = new Set([
  "ready",
  "provisioning",
  "provisioned",
  "not_provisioned",
]);

export function shouldProvisionInventory(
  state: SiteInventory["state"],
): boolean {
  return PROVISIONABLE_STATES.has(state);
}

async function withProvisioningLock<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = provisioningLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  provisioningLocks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (provisioningLocks.get(key) === current) provisioningLocks.delete(key);
  }
}

export async function listInventory(
  serverId?: string,
): Promise<SiteInventory[]> {
  return siteInventoryRepo.findAll(serverId);
}

export async function ensureDynamicInfrastructure(): Promise<{
  servers: number;
  serverBlocks: number;
}> {
  const servers = await serverRepo.findAll();
  let serverBlocks = 0;

  for (const server of servers) {
    const provider = new CaddyProvider({ apiEndpoint: server.apiEndpoint });
    let serverNames: string[];
    try {
      serverNames = await provider.getServerNames();
    } catch (error) {
      throw caddySetupError(server, "discover Caddy server blocks", error);
    }
    for (const serverName of serverNames) {
      try {
        await provider.getServerRoutes(serverName);
      } catch (error) {
        throw caddySetupError(
          server,
          `ensure dynamic-sites and dynamic-site-router for server block '${serverName}'`,
          error,
        );
      }
      serverBlocks += 1;
    }
  }

  return { servers: servers.length, serverBlocks };
}

function caddySetupError(
  server: { id: string; name: string; apiEndpoint: string },
  operation: string,
  error: unknown,
): AppError {
  const cause = error instanceof Error ? error.message : String(error);
  let guidance = "Check the Caddy Admin API endpoint and Caddy logs.";
  if (/401|403/.test(cause))
    guidance = "Check CADDY_ADMIN_TOKEN and Admin API authorization.";
  else if (/404/.test(cause))
    guidance = "Check that this endpoint is Caddy's Admin API on port 2019.";
  else if (/ECONNREFUSED|ENOTFOUND|fetch failed/i.test(cause))
    guidance = "Check that Caddy is running and reachable from the API host.";
  else if (/abort|timed out/i.test(cause))
    guidance = "Check Caddy responsiveness and network connectivity.";

  return new AppError(
    502,
    `Unable to ${operation} on server '${server.name}' at ${server.apiEndpoint}: ${cause}. ${guidance}`,
    { serverId: server.id, operation, cause },
  );
}

export async function getInventory(id: string): Promise<SiteInventory> {
  const item = await siteInventoryRepo.findById(id);
  if (!item) throw new NotFoundError("Site inventory", id);
  return item;
}

export async function createInventory(
  data: Parameters<typeof siteInventoryRepo.create>[0],
): Promise<SiteInventory> {
  if (data.managementType === "dynamic" && !data.routeId) {
    throw new ConflictError("A dynamic inventory site requires route_id");
  }
  if (data.managementType === "caddyfile" && data.routeId) {
    throw new ConflictError(
      "A Caddyfile-managed inventory site cannot have route_id",
    );
  }
  return siteInventoryRepo.create({ ...data, state: data.state ?? "draft" });
}

export async function updateInventory(
  id: string,
  data: Parameters<typeof siteInventoryRepo.update>[1],
): Promise<SiteInventory> {
  const current = await getInventory(id);
  const next = { ...current, ...data };
  if (next.groupId) {
    const group = await siteGroupRepo.findById(next.groupId);
    if (!group || group.serverId !== next.serverId)
      throw new ConflictError("Site group must belong to the inventory server");
  }
  if (next.managementType === "dynamic" && !next.routeId)
    throw new ConflictError("A dynamic inventory site requires route_id");
  if (next.managementType === "caddyfile" && next.routeId)
    throw new ConflictError(
      "A Caddyfile-managed inventory site cannot have route_id",
    );
  const updated = await siteInventoryRepo.update(id, data);
  if (!updated) throw new NotFoundError("Site inventory", id);
  return updated;
}

export async function markReady(id: string): Promise<SiteInventory> {
  const current = await getInventory(id);
  if (current.managementType !== "dynamic")
    throw new ConflictError("Only dynamic inventory sites can be provisioned");
  if (!current.routeId)
    throw new ConflictError("A dynamic inventory site requires route_id");
  const updated = await siteInventoryRepo.update(id, {
    state: "ready",
    stateDetail: null,
  });
  if (!updated) throw new NotFoundError("Site inventory", id);
  return updated;
}

function routeSite(item: SiteInventory) {
  return {
    serverId: item.serverId!,
    domain: item.domain,
    routeId: item.routeId,
    caddyServerName: item.caddyServerName,
    upstream: item.upstream,
    routeConfig: item.routeConfig,
    tlsEnabled: item.tlsEnabled,
  };
}

export async function provisionInventory(id: string): Promise<SiteInventory> {
  const requested = await getInventory(id);
  if (!requested.serverId)
    throw new ConflictError("Inventory site is not attached to a server");
  if (requested.managementType !== "dynamic")
    throw new ConflictError(
      "Caddyfile-managed inventory cannot be provisioned",
    );
  if (!requested.routeId)
    throw new ConflictError("A dynamic inventory site requires route_id");
  if (
    ![
      "ready",
      "failed",
      "provisioning",
      "provisioned",
      "not_provisioned",
    ].includes(requested.state)
  ) {
    throw new ConflictError(
      `Inventory site is '${requested.state}', not eligible for provisioning`,
    );
  }
  const lockKey = `${requested.serverId}:${requested.routeId}`;

  return withProvisioningLock(lockKey, async () => {
    const current = await getInventory(id);
    if (!current.serverId)
      throw new ConflictError("Inventory site is not attached to a server");
    const server = await serverRepo.findById(current.serverId);
    if (!server) throw new NotFoundError("Server", current.serverId);
    await siteInventoryRepo.markProvisioning(id);
    try {
      const serverNames = await new CaddyProvider({
        apiEndpoint: server.apiEndpoint,
      }).getServerNames();
      const serverName = current.caddyServerName ?? serverNames[0];
      if (!serverName || !serverNames.includes(serverName))
        throw new Error(
          `Caddy server block not found: ${serverName ?? "(none)"}`,
        );
      const group = (await siteInventoryRepo.findAll(current.serverId)).filter(
        (item) =>
          item.serverId === current.serverId &&
          item.managementType === "dynamic" &&
          item.routeId === current.routeId &&
          (item.caddyServerName ?? serverName) === serverName &&
          shouldProvisionInventory(item.state),
      );
      if (!group.some((item) => item.id === id))
        throw new ConflictError("Inventory site is not ready for provisioning");
      const provider = new CaddyProvider({ apiEndpoint: server.apiEndpoint });
      const allDynamic = (
        await siteInventoryRepo.findAll(current.serverId)
      ).filter(
        (item) =>
          item.serverId === current.serverId &&
          item.managementType === "dynamic" &&
          (item.caddyServerName ?? serverName) === serverName &&
          shouldProvisionInventory(item.state),
      );
      for (const item of group) {
        const observed = await siteRepo.findByDomainAndServer(
          item.domain,
          item.serverId!,
        );
        if (observed && observed.routeId !== item.routeId)
          throw new ConflictError(
            `Observed site '${item.domain}' has a different route_id`,
          );
      }
      await syncDynamicRoutes(provider, serverName, allDynamic.map(routeSite));
      const desired = buildDynamicRoutes(group.map(routeSite));
      if (!desired.some((route) => route["@id"] === current.routeId))
        throw new Error(`Desired route '${current.routeId}' was not built`);

      for (const item of group) {
        let observed = await siteRepo.findByDomainAndServer(
          item.domain,
          item.serverId!,
        );
        if (observed && observed.routeId !== item.routeId)
          throw new ConflictError(
            `Observed site '${item.domain}' has a different route_id`,
          );
        if (!observed) {
          observed = await siteRepo.create({
            serverId: item.serverId!,
            domain: item.domain,
            routeId: item.routeId,
            caddyServerName: serverName,
            upstream: item.upstream,
            routeConfig: item.routeConfig,
            tlsEnabled: item.tlsEnabled,
          });
        }
        await siteInventoryRepo.markProvisioned(item.id, observed.id);
      }
      return await getInventory(id);
    } catch (error) {
      await siteInventoryRepo.markFailed(
        id,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  });
}

export async function disableInventory(id: string): Promise<SiteInventory> {
  const item = await getInventory(id);
  const updated = await siteInventoryRepo.update(id, { state: "disabled" });
  if (!updated) throw new NotFoundError("Site inventory", id);
  if (item.serverId && item.managementType === "dynamic" && item.routeId) {
    const server = await serverRepo.findById(item.serverId);
    if (server) {
      const provider = new CaddyProvider({ apiEndpoint: server.apiEndpoint });
      const serverName =
        item.caddyServerName ?? (await provider.getServerNames())[0];
      if (serverName) {
        const remaining = (
          await siteInventoryRepo.findAll(item.serverId)
        ).filter(
          (candidate) =>
            candidate.id !== item.id &&
            candidate.serverId === item.serverId &&
            candidate.managementType === "dynamic" &&
            (candidate.caddyServerName ?? serverName) === serverName &&
            shouldProvisionInventory(candidate.state),
        );
        await syncDynamicRoutes(provider, serverName, remaining.map(routeSite));
        const observed = await siteRepo.findByDomainAndServer(
          item.domain,
          item.serverId!,
        );
        if (observed) await siteRepo.delete(observed.id);
      }
    }
  }
  return getInventory(id);
}

export async function disableInventoryForSite(
  serverId: string,
  domain: string,
): Promise<void> {
  const item = await siteInventoryRepo.findByDomainAndServer(domain, serverId);
  if (!item) return;
  if (item.managementType === "dynamic") await disableInventory(item.id);
  else await siteInventoryRepo.update(item.id, { state: "disabled" });
}
