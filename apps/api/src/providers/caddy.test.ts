import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@caddy-manager/config", () => ({
  config: {
    caddyAdminToken: "test-token",
    caddyAllowedHosts: [
      "caddy.test",
    ],
  },
}));

import { CaddyProvider } from "./caddy";

const fetchMock = vi.fn();

function response(
  body: unknown,
  options: { ok?: boolean; status?: number; statusText?: string } = {},
) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
    text: vi
      .fn()
      .mockResolvedValue(body === undefined ? "" : JSON.stringify(body)),
  };
}

describe("CaddyProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends authenticated requests to an allowlisted endpoint", async () => {
    fetchMock.mockResolvedValue(response({ apps: {} }));
    const provider = new CaddyProvider({
      apiEndpoint: "https://caddy.test:2019",
    });

    await provider.getConfig();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://caddy.test:2019/config/",
      expect.objectContaining({
        redirect: "follow",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          Origin: "http://localhost:2019",
        }),
      }),
    );
  });

  it("uses the selected server block when adding a route", async () => {
    fetchMock.mockResolvedValue(response(undefined));
    const provider = new CaddyProvider({ apiEndpoint: "https://caddy.test" });
    const route = {
      "@id": "example-route",
      match: [
        {
          host: [
            "example.com",
          ],
        },
      ],
    };

    await provider.addRoute("internal", route);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://caddy.test/config/apps/http/servers/internal/routes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(route),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("returns server block names from the Caddy response", async () => {
    fetchMock.mockResolvedValue(response({ public: {}, internal: {} }));
    const provider = new CaddyProvider({ apiEndpoint: "https://caddy.test" });

    await expect(provider.getServerNames()).resolves.toEqual([
      "public",
      "internal",
    ]);
  });

  it("surfaces Caddy error responses including the response body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: vi.fn().mockResolvedValue("route missing"),
    });
    const provider = new CaddyProvider({ apiEndpoint: "https://caddy.test" });

    await expect(provider.deleteRouteByID("missing")).rejects.toThrow(
      "Caddy API error: 404 Not Found — route missing",
    );
  });

  it("replaces dynamic routes directly in the server route list", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response([
          {
            "@id": "static-route",
            match: [
              {
                host: [
                  "static.example.com",
                ],
              },
            ],
          },
          {
            "@id": "service-a",
            match: [
              {
                host: [
                  "first.example.com",
                  "second.example.com",
                ],
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(response(undefined));
    const provider = new CaddyProvider({ apiEndpoint: "https://caddy.test" });
    const routes = [
      {
        "@id": "service-a",
        match: [
          {
            host: [
              "first.example.com",
            ],
          },
        ],
      },
    ];

    await provider.replaceDynamicRoutes("srv0", routes);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://caddy.test/config/apps/http/servers/srv0/routes",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify([
          {
            "@id": "static-route",
            match: [
              {
                host: [
                  "static.example.com",
                ],
              },
            ],
          },
          routes[0],
        ]),
      }),
    );
  });

  it("loads TLS automation subjects for nested dynamic host routes", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ apps: { http: { servers: {} } } }))
      .mockResolvedValueOnce(response(undefined));
    const provider = new CaddyProvider({ apiEndpoint: "https://caddy.test" });

    await provider.ensureTlsAutomation([
      "koiwa.munywele.co.ke",
    ]);

    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://caddy.test/load",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"subjects":["koiwa.munywele.co.ke"]'),
      }),
    );
  });

  it("selects legacy routes only by application-owned IDs", async () => {
    fetchMock.mockResolvedValue(
      response([
        {
          "@id": "owned-route",
          match: [
            {
              host: [
                "owned.example.com",
              ],
            },
          ],
        },
        {
          "@id": "static-route",
          match: [
            {
              host: [
                "static.example.com",
              ],
            },
          ],
        },
      ]),
    );
    const provider = new CaddyProvider({ apiEndpoint: "https://caddy.test" });

    await expect(
      provider.findLegacyRoutes("internal", [
        "owned-route",
      ]),
    ).resolves.toEqual([
      {
        "@id": "owned-route",
        match: [
          {
            host: [
              "owned.example.com",
            ],
          },
        ],
      },
    ]);
  });
});
