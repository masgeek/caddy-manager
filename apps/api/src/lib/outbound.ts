import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { config } from "@caddy-manager/config";

function normalizedHostname(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");
}

export function isPrivateAddress(address: string): boolean {
  const value = normalizedHostname(address);
  const version = isIP(value);

  if (version === 4) {
    const octets = value.split(".").map(Number);
    const [first, second] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 100 && second >= 64 && second <= 127)
    );
  }

  if (version === 6) {
    return (
      value === "::1" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      value.startsWith("fe8") ||
      value.startsWith("fe9") ||
      value.startsWith("fea") ||
      value.startsWith("feb") ||
      (value.startsWith("::ffff:") && isPrivateAddress(value.slice(7)))
    );
  }

  return false;
}

function parseHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Outbound URL is invalid");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Outbound URL must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Outbound URL must not contain credentials");
  }
  return url;
}

export function assertAllowedCaddyEndpoint(raw: string): string {
  const url = parseHttpUrl(raw);
  const hostname = normalizedHostname(url.hostname);
  if (!config.caddyAllowedHosts.includes(hostname)) {
    throw new Error(`Caddy endpoint host is not allowlisted: ${hostname}`);
  }
  return url.toString().replace(/\/$/, "");
}

export async function assertSafeHealthUrl(raw: string): Promise<void> {
  const url = parseHttpUrl(raw);
  if (config.allowPrivateOutbound) return;

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error(
      "Health-check target resolves to a private or local network address",
    );
  }
}
