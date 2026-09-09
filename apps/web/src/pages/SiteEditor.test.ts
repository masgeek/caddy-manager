import { describe, expect, it } from "vitest";
import { previewRoute } from "./SiteEditor";

describe("SiteEditor route preview", () => {
  it("builds one route from multiple hostname names", () => {
    const route = previewRoute({
      serverId: "server-1",
      name: "fees\napi",
      baseDomain: "example.com",
      routeMode: "reverse_proxy",
      upstream: "http://127.0.0.1:8080",
      responseHeaders: [],
      tlsEnabled: true,
    } as never);

    expect((route?.match as Array<Record<string, unknown>>)[0].host).toEqual([
      "fees.example.com",
      "api.example.com",
    ]);
  });

  it("preserves all hostnames in a shared custom route", () => {
    const route = previewRoute({
      serverId: "server-1",
      name: ["koelel-dev", "utumishi-dev", "koiwa-dev", "kambui"].join("\n"),
      baseDomain: "munywele.co.ke",
      routeMode: "custom",
      routeConfigJson: JSON.stringify({
        "@id": "fee-syncer-dev",
        match: [{ host: ["koelel-dev.munywele.co.ke"] }],
        handle: [
          { handler: "headers", response: { set: {} } },
          {
            handler: "reverse_proxy",
            upstreams: [{ dial: "127.0.0.1:9401" }],
          },
        ],
        terminal: true,
      }),
      responseHeaders: [],
      tlsEnabled: true,
    } as never);

    expect((route?.match as Array<Record<string, unknown>>)[0].host).toEqual([
      "koelel-dev.munywele.co.ke",
      "utumishi-dev.munywele.co.ke",
      "koiwa-dev.munywele.co.ke",
      "kambui.munywele.co.ke",
    ]);
    expect(route?.["@id"]).toBe("fee-syncer-dev");
  });

  it("adds response headers before a reverse proxy handler", () => {
    const route = previewRoute({
      serverId: "server-1",
      name: "caddy",
      baseDomain: "munywele.co.ke",
      routeMode: "reverse_proxy",
      upstream: "http://127.0.0.1:9621",
      responseHeaders: [
        {
          name: "Content-Security-Policy",
          value: "upgrade-insecure-requests",
        },
      ],
      tlsEnabled: true,
    } as never);

    expect(route?.handle).toEqual([
      {
        handler: "headers",
        response: {
          set: { "Content-Security-Policy": ["upgrade-insecure-requests"] },
        },
      },
      {
        handler: "reverse_proxy",
        upstreams: [{ dial: "127.0.0.1:9621" }],
      },
    ]);
  });
});
