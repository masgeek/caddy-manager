import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { JsonSchema7Type } from "zod-to-json-schema";
import {
  createServerSchema,
  updateServerSchema,
  createSiteSchema,
  updateSiteSchema,
} from "@caddy-manager/db";

export {
  createServerSchema,
  updateServerSchema,
  createSiteSchema,
  updateSiteSchema,
};

export const serverParamsSchema = z.object({
  id: z.string().uuid(),
});

export const siteParamsSchema = z.object({
  id: z.string().uuid(),
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const logQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  search: z.string().optional(),
});

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

// ----------------------------------------------------------------
// Zod schemas for response shapes — single source of truth for docs
// Update these when the actual return types change
// ----------------------------------------------------------------
const serverResponseZod = z.object({
  id: z.string().uuid().describe("Server ID"),
  name: z.string().describe("Server name"),
  hostname: z.string().describe("Server hostname or IP"),
  apiEndpoint: z.string().url().describe("Caddy admin API endpoint"),
  status: z
    .enum(["online", "offline", "degraded", "unknown"])
    .describe("Server status"),
  version: z.string().optional().describe("Caddy version"),
  createdAt: z.string().describe("Creation timestamp"),
  updatedAt: z.string().describe("Last update timestamp"),
});

const siteResponseZod = z.object({
  id: z.string().uuid().describe("Site ID"),
  serverId: z.string().uuid().describe("Associated server ID"),
  domain: z.string().describe("Site domain name"),
  upstream: z
    .string()
    .url()
    .optional()
    .describe("Upstream target URL for reverse proxy routes"),
  routeId: z.string().optional().describe("Caddy route ID"),
  caddyServerName: z
    .string()
    .optional()
    .describe("Caddy HTTP server block name"),
  routeConfig: z
    .record(z.unknown())
    .optional()
    .describe("Complete imported Caddy route configuration"),
  tlsEnabled: z.boolean().describe("Whether TLS is enabled"),
  synced: z.boolean().describe("Whether config is synced to Caddy"),
  status: z
    .enum(["active", "inactive", "warning", "error"])
    .describe("Site status"),
  statusDetail: z
    .string()
    .optional()
    .describe("Detailed health-check result or error"),
  lastCheckedAt: z
    .string()
    .optional()
    .describe("Timestamp of the most recent health check"),
  healthLatencyMs: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Health-check latency in milliseconds"),
  consecutiveFailures: z
    .number()
    .int()
    .nonnegative()
    .describe("Number of consecutive failed checks"),
  healthEndpoint: z.string().optional().describe("Health check endpoint path"),
  healthHeaders: z
    .string()
    .optional()
    .describe("Health check headers as JSON string"),
  createdAt: z.string().describe("Creation timestamp"),
  updatedAt: z.string().describe("Last update timestamp"),
});

const auditEventZod = z.object({
  id: z.string().uuid().describe("Audit event ID"),
  userId: z.string().uuid().describe("User who performed the action"),
  action: z
    .enum(["create", "update", "delete", "reload", "login", "logout"])
    .describe("Action performed"),
  entity: z
    .enum(["site", "server", "config", "user"])
    .describe("Entity type affected"),
  entityId: z.string().optional().describe("ID of the affected entity"),
  details: z.string().optional().describe("Human-readable details"),
  timestamp: z.string().describe("When the event occurred"),
  result: z.enum(["success", "failure"]).describe("Outcome of the action"),
});

const logEntryZod = z.object({
  id: z.string().describe("Log entry ID"),
  serverId: z.string().describe("Associated server ID"),
  level: z.string().describe("Log level (info, warn, error, etc.)"),
  message: z.string().describe("Log message"),
  source: z.string().describe("Log source (app, caddy)"),
  timestamp: z.string().describe("When the log was recorded"),
});

const healthResponseZod = z.object({
  status: z.string().describe("Service status"),
  version: z.string().describe("API version"),
  uptime: z.number().describe("Server uptime in seconds"),
  checkedAt: z.string().describe("Timestamp of the health check"),
});

const loginResponseZod = z.object({
  token: z.string().describe("JWT access token"),
  expiresIn: z.number().int().describe("Token lifetime in seconds"),
});

const serverHealthZod = z.object({
  status: z.enum(["online", "offline"]).describe("Server connectivity status"),
  server: serverResponseZod,
});

const importResponseZod = z.object({
  imported: z.number().int().describe("Number of sites imported"),
  skipped: z.number().int().describe("Number of sites skipped"),
});

const discoverResponseZod = z.object({
  servers: z
    .array(serverResponseZod)
    .describe("Servers created or reused for discovered base domains"),
  imported: z.number().int().describe("Number of sites imported"),
  skipped: z.number().int().describe("Number of sites already present"),
  sites: z
    .array(siteResponseZod)
    .describe("Sites mapped to their discovered servers"),
});

const configReloadZod = z.object({
  success: z.literal(true).describe("Whether the reload succeeded"),
  message: z.string().describe("Status message"),
  siteCount: z.number().int().describe("Number of sites in the configuration"),
});

export const discoverBodySchema = z.object({
  apiEndpoint: z
    .string()
    .url()
    .describe("Caddy admin API endpoint to discover"),
});

// Convert zod response schemas to JSON Schema for Fastify / Swagger
// Strips additionalProperties so Fastify doesn't strip unknown response fields
function toResponseSchema(schema: z.ZodType): Record<string, unknown> {
  const result = zodToJsonSchema(schema, { target: "jsonSchema7" }) as Record<
    string,
    unknown
  >;
  delete result.$schema;
  delete result.additionalProperties;
  return result;
}

function toResponseArraySchema(schema: z.ZodType): Record<string, unknown> {
  return {
    type: "array",
    items: toResponseSchema(schema),
  };
}

export const serverObjectSchema = toResponseSchema(serverResponseZod);
export const serverListSchema = toResponseArraySchema(serverResponseZod);

export const siteObjectSchema = toResponseSchema(siteResponseZod);
export const siteListSchema = toResponseArraySchema(siteResponseZod);

export const auditEventSchema = toResponseSchema(auditEventZod);
export const auditListSchema = toResponseArraySchema(auditEventZod);

export const logEntrySchema = toResponseSchema(logEntryZod);
export const logListSchema = toResponseArraySchema(logEntryZod);

export const healthResponseSchema = toResponseSchema(healthResponseZod);
export const loginResponseSchema = toResponseSchema(loginResponseZod);
export const serverHealthResponseSchema = toResponseSchema(serverHealthZod);
export const importResponseSchema = toResponseSchema(importResponseZod);
export const discoverResponseSchema = toResponseSchema(discoverResponseZod);
export const configReloadResponseSchema = toResponseSchema(configReloadZod);

export const errorResponseSchema = {
  type: "object",
  properties: {
    statusCode: { type: "integer", description: "HTTP status code" },
    message: { type: "string", description: "Error message" },
    details: { type: "object", description: "Additional error details" },
  },
};

export const successResponseSchema = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    message: { type: "string" },
  },
};

export function toJsonSchema(schema: z.ZodType): JsonSchema7Type {
  return zodToJsonSchema(schema, { target: "jsonSchema7" });
}
