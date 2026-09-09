import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { configReloadResponseSchema, toJsonSchema } from "../lib/schemas";
import { CaddyProvider } from "../providers/caddy";
import * as serverService from "../services/server";
import * as siteService from "../services/site";
import * as configService from "../services/config";
import { recordAuditEvent } from "../services/audit";
import { NotFoundError } from "../lib/errors";

const serverIdParam = z.object({ serverId: z.string().min(1) });

const reloadBody = z.object({ serverId: z.string().min(1) });

export async function registerConfigRoutes(app: FastifyInstance) {
  app.get(
    "/config",
    {
      schema: {
        tags: ["Config"],
        summary: "Get active Caddy configuration",
        querystring: toJsonSchema(serverIdParam),
        response: {
          200: {
            type: "object",
            description: "Raw Caddy JSON configuration",
          },
        },
      },
    },
    async (request) => {
      const { serverId } = serverIdParam.parse(request.query);
      const server = await serverService.getServer(serverId);
      const provider = new CaddyProvider({ apiEndpoint: server.apiEndpoint });
      return configService.getServerConfig(provider);
    },
  );

  app.post(
    "/config/reload",
    {
      schema: {
        tags: ["Config"],
        summary: "Build and reload Caddy configuration",
        body: {
          ...toJsonSchema(reloadBody),
          example: { serverId: "3a5c7e8f-1b2d-4f6a-9c8d-7e6f5a4b3c2d" },
        },
        response: { 200: configReloadResponseSchema },
      },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async (request) => {
      const { serverId } = reloadBody.parse(request.body);
      const server = await serverService.getServer(serverId);
      const sites = await siteService.getSitesByServer(serverId);

      if (sites.length === 0) {
        throw new NotFoundError("Sites", "none found for this server");
      }

      const provider = new CaddyProvider({ apiEndpoint: server.apiEndpoint });
      await configService.reloadServerConfig(provider, server, sites);

      await recordAuditEvent({
        userId: request.user.sub,
        action: "reload",
        entity: "config",
        entityId: serverId,
        details: `Reloaded configuration for server ${server.name} with ${sites.length} sites`,
      });

      return {
        success: true,
        message: "Configuration reloaded",
        siteCount: sites.length,
      };
    },
  );

  app.get(
    "/config/generated",
    {
      schema: {
        tags: ["Config"],
        summary: "Preview generated configuration without deploying",
        querystring: toJsonSchema(serverIdParam),
        response: {
          200: {
            type: "object",
            description: "Generated Caddy JSON configuration",
          },
        },
      },
    },
    async (request) => {
      const { serverId } = serverIdParam.parse(request.query);
      const server = await serverService.getServer(serverId);
      const sites = await siteService.getSitesByServer(server.id);
      const config = configService.buildCaddyConfig(server, sites);
      return config;
    },
  );
}
