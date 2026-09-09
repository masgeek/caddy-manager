import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiClientError } from "@caddy-manager/shared-api";

describe("ApiClient errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves structured backend error messages and details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: vi.fn().mockResolvedValue({
          message: "Invalid upstream URL",
          details: { field: "upstream" },
        }),
      }),
    );

    const request = new ApiClient("/api").getSites();

    await expect(request).rejects.toBeInstanceOf(ApiClientError);
    await expect(request).rejects.toMatchObject({
      statusCode: 422,
      message: "Invalid upstream URL",
      details: { field: "upstream" },
    });
  });

  it("calls the unauthorized handler for expired sessions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: vi
          .fn()
          .mockResolvedValue({ message: "Invalid or expired token" }),
      }),
    );
    const onUnauthorized = vi.fn();
    const client = new ApiClient("/api");
    client.setUnauthorizedHandler(onUnauthorized);

    await expect(client.getSites()).rejects.toMatchObject({ statusCode: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
});
