import { randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPassword } from "./password";

describe("verifyPassword", () => {
  it("verifies the scrypt format used by the seed script", () => {
    const password = "correct horse battery staple";
    const salt = randomBytes(16).toString("hex");
    const encoded = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;

    expect(verifyPassword(password, encoded)).toBe(true);
    expect(verifyPassword("wrong password", encoded)).toBe(false);
  });

  it("rejects malformed hashes", () => {
    expect(verifyPassword("password", "not-a-valid-hash")).toBe(false);
  });
});
