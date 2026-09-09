import { describe, expect, it } from "vitest";
import { isPrivateAddress } from "./outbound";

describe("isPrivateAddress", () => {
  it("blocks private and local IPv4 ranges", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("10.0.0.8")).toBe(true);
    expect(isPrivateAddress("172.16.4.2")).toBe(true);
    expect(isPrivateAddress("192.168.1.20")).toBe(true);
  });

  it("blocks local IPv6 ranges", () => {
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("2001:4860:4860::8888")).toBe(false);
  });
});
