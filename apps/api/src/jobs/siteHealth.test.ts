import { describe, expect, it } from "vitest";
import { classifyHttpStatus, configContainsSite } from "./siteHealth";

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
