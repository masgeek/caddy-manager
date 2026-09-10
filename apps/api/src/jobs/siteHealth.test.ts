import { describe, expect, it } from "vitest";
import {
  classifyHttpStatus,
  calculateRetryDelay,
  configContainsSite,
  hasUntrackedDynamicSite,
  isHealthCheckableSite,
} from "./siteHealth";

describe("classifyHttpStatus", () => {
  it("treats 4xx responses as warnings", () => {
    expect(classifyHttpStatus(404)).toBe("warning");
  });

  it("treats 5xx responses as errors", () => {
    expect(classifyHttpStatus(503)).toBe("error");
  });

  it("treats successful responses as active", () => {
    expect(classifyHttpStatus(200)).toBe("active");
  });
});

describe("calculateRetryDelay", () => {
  it("doubles the maximum delay for each retry", () => {
    expect(calculateRetryDelay(250, 0, () => 1)).toBe(250);
    expect(calculateRetryDelay(250, 1, () => 1)).toBe(500);
  });

  it("adds jitter within the exponential window", () => {
    expect(calculateRetryDelay(250, 2, () => 0.4)).toBe(400);
  });

  it("caps the exponential delay", () => {
    expect(calculateRetryDelay(60_000, 4, () => 1)).toBe(60_000);
  });
});

describe("configContainsSite", () => {
  it("finds a route by its persisted route id", () => {
    expect(
      configContainsSite(
        {
          apps: {
            http: {
              servers: {
                proxy: { routes: [{ "@id": "imported-route" }] },
              },
            },
          },
        },
        { domain: "example.com", routeId: "imported-route" },
      ),
    ).toBe(true);
  });

  it("finds imported routes without an id by their host", () => {
    expect(
      configContainsSite(
        {
          apps: {
            http: {
              servers: {
                proxy: {
                  routes: [
                    {
                      handle: [
                        { routes: [{ match: [{ host: ["example.com"] }] }] },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
        { domain: "example.com" },
      ),
    ).toBe(true);
  });

  it("returns false when the site route is missing", () => {
    expect(
      configContainsSite(
        { apps: { http: { servers: { proxy: { routes: [] } } } } },
        {
          domain: "missing.example.com",
          routeId: "missing-route",
        },
      ),
    ).toBe(false);
  });

  it("can restrict route detection to the selected server block", () => {
    const config = {
      apps: {
        http: {
          servers: {
            public: { routes: [{ match: [{ host: ["example.com"] }] }] },
            internal: { routes: [] },
          },
        },
      },
    };

    expect(
      configContainsSite(config, { domain: "example.com" }, "internal"),
    ).toBe(false);
    expect(
      configContainsSite(config, { domain: "example.com" }, "public"),
    ).toBe(true);
  });
});

describe("isHealthCheckableSite", () => {
  it("includes API-managed sites with a route ID", () => {
    expect(isHealthCheckableSite({ routeId: "dynamic-route" })).toBe(true);
  });

  it("excludes Caddyfile-managed sites without a route ID", () => {
    expect(isHealthCheckableSite({ routeId: undefined })).toBe(false);
  });
});

describe("hasUntrackedDynamicSite", () => {
  it("detects an API-managed site missing from inventory", () => {
    expect(
      hasUntrackedDynamicSite(
        [{ domain: "api.example.com", routeId: "api-route" }],
        [],
        "proxy",
      ),
    ).toBe(true);
  });

  it("does not block reconciliation for tracked or Caddyfile sites", () => {
    expect(
      hasUntrackedDynamicSite(
        [
          { domain: "api.example.com", routeId: "api-route" },
          { domain: "legacy.example.com" },
        ],
        [
          {
            domain: "api.example.com",
            managementType: "dynamic",
          },
        ],
        "proxy",
      ),
    ).toBe(false);
  });
});
