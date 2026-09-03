import { describe, expect, it, vi } from "vitest";

vi.mock("@caddy-manager/db", () => ({
  serverRepo: {},
  siteRepo: {},
}));

import {
  buildCaddyConfig,
  buildCaddyRoute,
  buildDynamicRoutes,
  deriveBaseDomain,
  parseSitesFromConfig,
} from "./config";

describe("site config preservation", () => {
  it.each([
    ["dashboard.agwise.org", "agwise.org"],
    ["api.munywele.ci.ke", "munywele.ci.ke"],
    ["example.com", "example.com"],
  ])("derives %s as %s", (domain, expected) => {
    expect(deriveBaseDomain(domain)).toBe(expected);
  });

  it("keeps the complete route, including path matchers and handlers", () => {
    const route = {
      "@id": "api-route",
      match: [{ host: ["example.com"], path: ["/api/*"] }],
      handle: [
        { handler: "rewrite", uri: "/index.php" },
        { handler: "reverse_proxy", upstreams: [{ dial: "backend:8080" }] },
      ],
      terminal: true,
    };

    const [site] = parseSitesFromConfig({
      apps: {
        http: {
          servers: {
            proxy: { routes: [route] },
          },
        },
      },
    });

    expect(site.routeConfig).toEqual(route);
    expect(site.upstream).toBe("http://backend:8080");
    expect(buildCaddyRoute(site)).toEqual(route);
  });

  it("does not mutate the stored route when assigning a route id", () => {
    const routeConfig = {
      match: [{ host: ["example.com"], path: ["/files/*"] }],
      handle: [{ handler: "file_server", root: "/srv/www" }],
    };

    const route = buildCaddyRoute({
      domain: "example.com",
      upstream: "http://unused:8080",
      routeId: "files-route",
      routeConfig,
    });

    expect(route).toMatchObject({
      "@id": "files-route",
      match: routeConfig.match,
      handle: routeConfig.handle,
    });
    expect(routeConfig).not.toHaveProperty("@id");
  });

  it("imports and preserves routes that do not have a reverse proxy upstream", () => {
    const route = {
      "@id": "shortener-web",
      match: [{ host: ["lnk-admin.example.com"] }],
      handle: [
        {
          handler: "static_response",
          headers: { Location: ["https://lnk.example.com{http.request.uri}"] },
          status_code: 301,
        },
      ],
      terminal: true,
    };

    const [site] = parseSitesFromConfig({
      apps: { http: { servers: { proxy: { routes: [route] } } } },
    });

    expect(site).toMatchObject({
      domain: "lnk-admin.example.com",
      upstream: undefined,
      routeConfig: route,
    });
    expect(buildCaddyRoute(site)).toEqual(route);
  });

  it("updates the host while preserving imported path matchers", () => {
    const route = buildCaddyRoute({
      domain: "new.example.com",
      upstream: "http://unused:8080",
      routeConfig: {
        "@id": "api-route",
        match: [{ host: ["old.example.com"], path: ["/api/*"] }],
        handle: [
          { handler: "reverse_proxy", upstreams: [{ dial: "backend:8080" }] },
        ],
      },
    });

    expect(route).toMatchObject({
      match: [{ host: ["new.example.com"], path: ["/api/*"] }],
    });
  });

  it("preserves imported routes when generating the full server config", () => {
    const routeConfig = {
      "@id": "files-route",
      match: [{ host: ["example.com"], path: ["/files/*"] }],
      handle: [{ handler: "file_server", root: "/srv/www" }],
    };

    const config = buildCaddyConfig({} as never, [
      {
        id: "site-id",
        serverId: "server-id",
        domain: "example.com",
        upstream: "http://unused:8080",
        routeId: "files-route",
        routeConfig,
        tlsEnabled: false,
        synced: true,
        status: "active",
        consecutiveFailures: 0,
        createdAt: "",
        updatedAt: "",
      },
    ]);

    expect(config.apps as Record<string, unknown>).toMatchObject({
      http: {
        servers: {
          srv0: {
            routes: [routeConfig],
          },
        },
      },
    });
  });

  it("groups hosts with identical route behavior into one route", () => {
    const routes = buildDynamicRoutes([
      {
        domain: "prod-a.example.com",
        routeId: "fee-syncer-prod",
        upstream: "http://127.0.0.1:9400",
        tlsEnabled: true,
      } as never,
      {
        domain: "prod-b.example.com",
        routeId: "fee-syncer-prod",
        upstream: "http://127.0.0.1:9400",
        tlsEnabled: true,
      } as never,
      {
        domain: "dev.example.com",
        routeId: "fee-syncer-dev",
        upstream: "http://127.0.0.1:9401",
        tlsEnabled: true,
      } as never,
    ]);

    expect(routes).toHaveLength(2);
    expect(
      routes.find(
        (route) => (route.match as Array<Record<string, unknown>>)[0].host,
      )?.match,
    ).toEqual([{ host: ["prod-a.example.com", "prod-b.example.com"] }]);
  });

  it("is idempotent for duplicate hosts and removes the last service route", () => {
    const site = {
      domain: "same.example.com",
      routeId: "service-a",
      upstream: "http://127.0.0.1:9400",
      tlsEnabled: true,
    } as never;
    const routes = buildDynamicRoutes([site, site]);

    expect(routes).toHaveLength(1);
    expect((routes[0].match as Array<Record<string, unknown>>)[0].host).toEqual(
      ["same.example.com"],
    );
    expect(buildDynamicRoutes([])).toEqual([]);
  });

  it("does not group routes whose handlers differ", () => {
    const routes = buildDynamicRoutes([
      {
        domain: "a.example.com",
        routeId: "service-a",
        upstream: "http://127.0.0.1:9400",
        routeConfig: {
          match: [{ host: ["a.example.com"] }],
          handle: [
            {
              handler: "reverse_proxy",
              upstreams: [{ dial: "127.0.0.1:9400" }],
            },
          ],
        },
      } as never,
      {
        domain: "b.example.com",
        routeId: "service-b",
        upstream: "http://127.0.0.1:9400",
        routeConfig: {
          match: [{ host: ["b.example.com"] }],
          handle: [{ handler: "file_server", root: "/srv/www" }],
        },
      } as never,
    ]);

    expect(routes).toHaveLength(2);
  });

  it("excludes Caddyfile-managed records from desired dynamic state", () => {
    expect(
      buildDynamicRoutes([
        {
          domain: "static.example.com",
          upstream: "http://127.0.0.1:9400",
          tlsEnabled: true,
        } as never,
      ]),
    ).toEqual([]);
  });

  it("keeps distinct route IDs separate when configuration matches", () => {
    const routes = buildDynamicRoutes([
      {
        domain: "prod.example.com",
        routeId: "fee-syncer-prod",
        upstream: "http://127.0.0.1:9400",
        tlsEnabled: true,
      } as never,
      {
        domain: "dev.example.com",
        routeId: "fee-syncer-dev",
        upstream: "http://127.0.0.1:9400",
        tlsEnabled: true,
      } as never,
    ]);
    expect(routes.map((route) => route["@id"])).toEqual([
      "fee-syncer-prod",
      "fee-syncer-dev",
    ]);
  });

  it("rejects conflicting configuration within one route ID", () => {
    expect(() =>
      buildDynamicRoutes([
        {
          domain: "a.example.com",
          routeId: "service-a",
          upstream: "http://127.0.0.1:9400",
          tlsEnabled: true,
        } as never,
        {
          domain: "b.example.com",
          routeId: "service-a",
          upstream: "http://127.0.0.1:9401",
          tlsEnabled: true,
        } as never,
      ]),
    ).toThrow("Conflicting configuration for dynamic route 'service-a'");
  });
});
