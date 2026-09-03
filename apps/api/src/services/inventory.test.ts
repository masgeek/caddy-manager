import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inventoryCreate: vi.fn(),
  inventoryFindById: vi.fn(),
  inventoryFindAll: vi.fn(),
  inventoryMarkProvisioning: vi.fn(),
  inventoryMarkProvisioned: vi.fn(),
  inventoryMarkFailed: vi.fn(),
  serverFindById: vi.fn(),
  serverFindAll: vi.fn(),
  siteFindByDomainAndServer: vi.fn(),
  siteCreate: vi.fn(),
  caddyConstructor: vi.fn(),
  syncDynamicRoutes: vi.fn(),
  buildDynamicRoutes: vi.fn(),
}));
vi.mock("@caddy-manager/db", () => ({
  serverRepo: {
    findById: mocks.serverFindById,
    findAll: mocks.serverFindAll,
  },
  siteRepo: {
    findByDomainAndServer: mocks.siteFindByDomainAndServer,
    create: mocks.siteCreate,
  },
  siteInventoryRepo: {
    create: mocks.inventoryCreate,
    findById: mocks.inventoryFindById,
    findAll: mocks.inventoryFindAll,
    markProvisioning: mocks.inventoryMarkProvisioning,
    markProvisioned: mocks.inventoryMarkProvisioned,
    markFailed: mocks.inventoryMarkFailed,
  },
}));
vi.mock("../providers/caddy", () => ({
  CaddyProvider: mocks.caddyConstructor,
}));
vi.mock("./config", () => ({
  syncDynamicRoutes: mocks.syncDynamicRoutes,
  buildDynamicRoutes: mocks.buildDynamicRoutes,
}));

import {
  createInventory,
  provisionInventory,
  ensureDynamicInfrastructure,
  shouldProvisionInventory,
} from "./inventory";

describe("site inventory", () => {
  it("creates a draft without contacting Caddy", async () => {
    const draft = {
      id: "inventory-id",
      serverId: "server-id",
      domain: "new.example.com",
      managementType: "dynamic",
      routeId: "service-a",
      state: "draft",
    };
    mocks.inventoryCreate.mockResolvedValueOnce(draft);

    await expect(
      createInventory({
        serverId: "server-id",
        domain: "new.example.com",
        managementType: "dynamic",
        routeId: "service-a",
        tlsEnabled: true,
        state: "draft",
      }),
    ).resolves.toEqual(draft);
    expect(mocks.inventoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ state: "draft" }),
    );
  });

  it("ensures dynamic containers for every configured Caddy server block", async () => {
    const ensureDynamicRouteContainer = vi.fn();
    mocks.serverFindAll.mockResolvedValueOnce([
      { id: "server-id", apiEndpoint: "http://caddy:2019" },
    ]);
    mocks.caddyConstructor.mockImplementationOnce(() => ({
      getServerNames: vi.fn().mockResolvedValue(["srv0", "srv1"]),
      ensureDynamicRouteContainer,
    }));

    await expect(ensureDynamicInfrastructure()).resolves.toEqual({
      servers: 1,
      serverBlocks: 2,
    });
    expect(ensureDynamicRouteContainer).toHaveBeenCalledWith("srv0");
    expect(ensureDynamicRouteContainer).toHaveBeenCalledWith("srv1");
  });

  it("reports which server failed while ensuring dynamic infrastructure", async () => {
    mocks.serverFindAll.mockResolvedValueOnce([
      {
        id: "server-id",
        name: "production",
        apiEndpoint: "http://caddy:2019",
      },
    ]);
    mocks.caddyConstructor.mockImplementationOnce(() => ({
      getServerNames: vi
        .fn()
        .mockRejectedValue(new Error("Caddy API error: 401 Unauthorized")),
    }));

    await expect(ensureDynamicInfrastructure()).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining(
        "Unable to discover Caddy server blocks on server 'production'",
      ),
    });
  });

  it("only treats intended lifecycle states as desired Caddy state", () => {
    expect(shouldProvisionInventory("draft")).toBe(false);
    expect(shouldProvisionInventory("disabled")).toBe(false);
    expect(shouldProvisionInventory("ready")).toBe(true);
    expect(shouldProvisionInventory("provisioned")).toBe(true);
    expect(shouldProvisionInventory("not_provisioned")).toBe(true);
  });

  it("provisions inventory and creates the observed site only after Caddy sync", async () => {
    const item = {
      id: "inventory-id",
      serverId: "server-id",
      domain: "new.example.com",
      managementType: "dynamic",
      routeId: "service-a",
      state: "ready",
      tlsEnabled: true,
    } as const;
    const observed = { id: "site-id" };
    mocks.inventoryFindById.mockResolvedValue(item);
    mocks.inventoryFindAll.mockResolvedValue([item]);
    mocks.serverFindById.mockResolvedValue({
      id: "server-id",
      apiEndpoint: "https://caddy.test",
    });
    mocks.caddyConstructor.mockImplementation(() => ({
      getServerNames: vi.fn().mockResolvedValue(["srv0"]),
    }));
    mocks.buildDynamicRoutes.mockReturnValue([
      { "@id": "service-a", match: [{ host: [item.domain] }] },
    ]);
    mocks.siteFindByDomainAndServer.mockResolvedValue(undefined);
    mocks.siteCreate.mockResolvedValue(observed);
    mocks.inventoryMarkProvisioned.mockResolvedValue({
      ...item,
      state: "provisioned",
      provisionedSiteId: observed.id,
    });

    await expect(provisionInventory(item.id)).resolves.toMatchObject({
      state: "ready",
    });
    expect(mocks.syncDynamicRoutes).toHaveBeenCalled();
    expect(mocks.siteCreate).toHaveBeenCalled();
    expect(mocks.inventoryMarkProvisioned).toHaveBeenCalledWith(
      item.id,
      observed.id,
    );
  });

  it("records a failed provisioning attempt without deleting inventory", async () => {
    const item = {
      id: "inventory-id",
      serverId: "server-id",
      domain: "new.example.com",
      managementType: "dynamic",
      routeId: "service-a",
      state: "ready",
      tlsEnabled: true,
    } as const;
    mocks.inventoryFindById.mockResolvedValue(item);
    mocks.serverFindById.mockResolvedValue({
      id: "server-id",
      apiEndpoint: "https://caddy.test",
    });
    mocks.caddyConstructor.mockImplementation(() => ({
      getServerNames: vi.fn().mockResolvedValue(["srv0"]),
    }));
    mocks.inventoryFindAll.mockResolvedValue([item]);
    mocks.syncDynamicRoutes.mockRejectedValue(
      new Error("Caddy rejected route"),
    );

    await expect(provisionInventory(item.id)).rejects.toThrow(
      "Caddy rejected route",
    );
    expect(mocks.inventoryMarkFailed).toHaveBeenCalledWith(
      item.id,
      "Caddy rejected route",
    );
  });
});
