import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app";

describe("API integration", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves the public health endpoint", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "online" });
  });

  it("protects server routes with JWT authentication", async () => {
    const response = await app.inject({ method: "GET", url: "/api/servers" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ message: "Unauthorized" });
  });

  it("rejects expired JWTs without running the protected handler", async () => {
    const token = app.jwt.sign(
      { sub: "expired-user", username: "expired-user", role: "admin" },
      { expiresIn: "1ms" },
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    const response = await app.inject({
      method: "GET",
      url: "/api/servers",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ message: "Unauthorized" });
  });
});
