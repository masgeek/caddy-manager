import type { FastifyInstance } from "fastify";
import {
  createServerSchema,
  discoverBodySchema,
  discoverResponseSchema,
  importResponseSchema,
  serverHealthResponseSchema,
  serverListSchema,
  serverObjectSchema,
  serverParamsSchema,
  successResponseSchema,
  toJsonSchema,
  updateServerSchema,
} from "../lib/schemas";
import { AppError } from "../lib/errors";
import * as serverService from "../services/server";
import { CaddyProvider } from "../providers/caddy";
import {
  discoverAndImport,
  importSitesFromConfig,
  previewSitesFromConfig,
} from "../services/config";
import { recordAuditEvent } from "../services/audit";

export async function registerServerRoutes(app: FastifyInstance) {
  app.get(
    "/servers",
    {
      schema: {
        tags: ["Servers"],
        summary: "List all servers",
        response: { 200: serverListSchema },
      },
    },
    async () => {
      return serverService.listServers();
    },
  );

  app.get(
    "/servers/:id",
    {
      schema: {
        tags: ["Servers"],
        summary: "Get server by ID",
        params: toJsonSchema(serverParamsSchema),
        response: { 200: serverObjectSchema },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      return serverService.getServer(id);
    },
  );

  app.get(
    "/servers/:id/blocks",
    {
      schema: {
        tags: ["Servers"],
        summary: "List Caddy HTTP server blocks",
        params: toJsonSchema(serverParamsSchema),
        response: { 200: { type: "array", items: { type: "string" } } },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const server = await serverService.getServer(id);
      const provider = new CaddyProvider({ apiEndpoint: server.apiEndpoint });
      return provider.getServerNames();
    },
  );

  app.post(
    "/servers",
    {
      schema: {
        tags: ["Servers"],
        summary: "Create a server",
        body: {
          ...toJsonSchema(createServerSchema),
          example: {
            name: "prod-web-01",
            hostname: "web01.example.com",
            apiEndpoint: "http://10.0.0.1:2019",
          },
        },
        response: { 201: serverObjectSchema },
      },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async (request, reply) => {
      const data = createServerSchema.parse(request.body);
      const server = await serverService.createServer(data);

      await recordAuditEvent({
        userId: request.user.sub,
        action: "create",
        entity: "server",
        entityId: server.id,
        details: `Created server ${server.name}`,
      });

      return reply.status(201).send(server);
    },
  );

  app.put(
    "/servers/:id",
    {
      schema: {
        tags: ["Servers"],
        summary: "Update a server",
        params: toJsonSchema(serverParamsSchema),
        body: {
          ...toJsonSchema(updateServerSchema),
          example: {
            name: "prod-web-01-updated",
            hostname: "web01.example.com",
            apiEndpoint: "http://10.0.0.2:2019",
          },
        },
        response: { 200: serverObjectSchema },
      },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const data = updateServerSchema.parse(request.body);
      const server = await serverService.updateServer(id, data);

      await recordAuditEvent({
        userId: request.user.sub,
        action: "update",
        entity: "server",
        entityId: server.id,
        details: `Updated server ${server.name}`,
      });

      return server;
    },
  );

  app.delete(
    "/servers/:id",
    {
      schema: {
        tags: ["Servers"],
        summary: "Delete a server",
        params: toJsonSchema(serverParamsSchema),
        response: { 204: { type: "null" } },
      },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const server = await serverService.getServer(id);
      await serverService.deleteServer(id);

      await recordAuditEvent({
        userId: request.user.sub,
        action: "delete",
        entity: "server",
        entityId: id,
        details: `Deleted server ${server.name}`,
      });

      return reply.status(204).send();
    },
  );

  app.post(
    "/servers/:id/health",
    {
      schema: {
        tags: ["Servers"],
        summary: "Check server health",
        params: toJsonSchema(serverParamsSchema),
        response: { 200: serverHealthResponseSchema },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const server = await serverService.getServer(id);

      const provider = new CaddyProvider({ apiEndpoint: server.apiEndpoint });
      try {
        await provider.health();
        await serverService.updateServerStatus(id, "online", "online");
        return { status: "online", server: await serverService.getServer(id) };
      } catch {
        await serverService.updateServerStatus(id, "offline");
        return { status: "offline", server: await serverService.getServer(id) };
      }
    },
  );

  app.post(
    "/servers/:id/import",
    {
      schema: {
        tags: ["Servers"],
        summary: "Import sites from server config",
        params: toJsonSchema(serverParamsSchema),
        response: { 200: importResponseSchema },
      },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const server = await serverService.getServer(id);
      const provider = new CaddyProvider({ apiEndpoint: server.apiEndpoint });

      try {
        const result = await importSitesFromConfig(server, provider);

        await recordAuditEvent({
          userId: request.user.sub,
          action: "create",
          entity: "site",
          details: `Imported ${result.imported} sites from ${server.name} config (${result.skipped} skipped)`,
        });

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new AppError(
          502,
          `Failed to import config from ${server.apiEndpoint}: ${message}`,
        );
      }
    },
  );

  app.get(
    "/servers/:id/import/preview",
    {
      schema: {
        tags: ["Servers"],
        summary: "Preview sites available for import",
        params: toJsonSchema(serverParamsSchema),
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                domain: { type: "string" },
                upstream: { type: "string" },
                routeId: { type: "string" },
                caddyServerName: { type: "string" },
                tlsEnabled: { type: "boolean" },
                alreadyImported: { type: "boolean" },
              },
              required: [
                "domain",
                "caddyServerName",
                "tlsEnabled",
                "alreadyImported",
              ],
            },
          },
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const server = await serverService.getServer(id);
      const provider = new CaddyProvider({ apiEndpoint: server.apiEndpoint });
      return previewSitesFromConfig(server, provider);
    },
  );

  app.post(
    "/servers/discover",
    {
      schema: {
        tags: ["Servers"],
        summary: "Discover and import from Caddy admin API",
        body: {
          ...toJsonSchema(discoverBodySchema),
          example: { apiEndpoint: "http://127.0.0.1:2019" },
        },
        response: { 200: discoverResponseSchema },
      },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async (request, reply) => {
      const { apiEndpoint } = discoverBodySchema.parse(request.body);
      try {
        return await discoverAndImport(apiEndpoint);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new AppError(
          502,
          `Failed to discover from ${apiEndpoint}: ${message}`,
        );
      }
    },
  );
}
