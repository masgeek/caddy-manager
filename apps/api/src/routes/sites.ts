import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createSiteSchema,
  updateSiteSchema,
  siteParamsSchema,
  siteObjectSchema,
  siteListSchema,
  successResponseSchema,
  toJsonSchema,
} from "../lib/schemas";
import * as siteService from "../services/site";
import * as inventoryService from "../services/inventory";
import { checkAllSites, reconcileAllSites } from "../jobs/siteHealth.js";
import { recordAuditEvent } from "../services/audit";

const dynamicCreateSiteSchema = createSiteSchema.extend({
  routeId: z.string().min(1).max(255),
});

export async function registerSiteRoutes(app: FastifyInstance) {
  app.get(
    "/sites",
    {
      schema: {
        tags: ["Sites"],
        summary: "List all sites",
        querystring: {
          type: "object",
          properties: { serverId: { type: "string" } },
        },
        response: { 200: siteListSchema },
      },
    },
    async (request) => {
      const query = request.query as { serverId?: string };
      return siteService.listSites(query.serverId);
    },
  );

  app.get(
    "/sites/:id",
    {
      schema: {
        tags: ["Sites"],
        summary: "Get site by ID",
        params: toJsonSchema(siteParamsSchema),
        response: { 200: siteObjectSchema },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      return siteService.getSite(id);
    },
  );

  app.post(
    "/sites",
    {
      schema: {
        tags: ["Sites"],
        summary: "Create a site",
        body: {
          ...toJsonSchema(dynamicCreateSiteSchema),
          example: {
            serverId: "3a5c7e8f-1b2d-4f6a-9c8d-7e6f5a4b3c2d",
            domain: "example.com",
            upstream: "http://localhost:3000",
            tlsEnabled: true,
            routeId: "route-example",
            healthEndpoint: "/health",
          },
        },
        response: { 201: { type: "object" } },
      },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async (request, reply) => {
      const data = dynamicCreateSiteSchema.parse(request.body);
      const site = await inventoryService.createInventory({
        ...data,
        state: "draft",
        managementType: "dynamic",
      });

      await recordAuditEvent({
        userId: request.user.sub,
        action: "create",
        entity: "site",
        entityId: site.id,
        details: `Created site ${site.domain} -> ${site.upstream}`,
      });

      return reply.status(201).send(site);
    },
  );

  app.put(
    "/sites/:id",
    {
      schema: {
        tags: ["Sites"],
        summary: "Update a site",
        params: toJsonSchema(siteParamsSchema),
        body: {
          ...toJsonSchema(updateSiteSchema),
          example: {
            domain: "example.com",
            upstream: "http://localhost:8080",
            tlsEnabled: false,
          },
        },
        response: { 200: siteObjectSchema },
      },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const data = updateSiteSchema.parse(request.body);
      const site = await siteService.updateSite(id, data);

      await recordAuditEvent({
        userId: request.user.sub,
        action: "update",
        entity: "site",
        entityId: site.id,
        details: `Updated site ${site.domain}`,
      });

      return site;
    },
  );

  app.delete(
    "/sites/:id",
    {
      schema: {
        tags: ["Sites"],
        summary: "Delete a site",
        params: toJsonSchema(siteParamsSchema),
        response: { 204: { type: "null" } },
      },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const site = await siteService.getSite(id);
      await siteService.deleteSite(id);

      await recordAuditEvent({
        userId: request.user.sub,
        action: "delete",
        entity: "site",
        entityId: id,
        details: `Deleted site ${site.domain}`,
      });

      return reply.status(204).send();
    },
  );

  app.post(
    "/sites/:id/sync",
    {
      schema: {
        tags: ["Sites"],
        summary: "Push site to Caddy config",
        params: toJsonSchema(siteParamsSchema),
        response: { 200: siteObjectSchema },
      },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const site = await siteService.syncSite(id);

      await recordAuditEvent({
        userId: request.user.sub,
        action: "update",
        entity: "site",
        entityId: id,
        details: `Synced site ${site.domain} to Caddy config`,
      });

      return site;
    },
  );

  app.post(
    "/sites/health-check",
    {
      schema: {
        tags: ["Sites"],
        summary: "Manually trigger site health check",
        response: { 200: successResponseSchema },
      },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async () => {
      await checkAllSites();
      return { success: true };
    },
  );

  app.post(
    "/sites/reconcile",
    {
      schema: {
        tags: ["Sites"],
        summary: "Recreate missing site routes",
        response: { 200: successResponseSchema },
      },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async () => {
      await reconcileAllSites();
      return { success: true };
    },
  );
}
