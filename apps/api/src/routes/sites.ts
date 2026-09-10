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
import { healthSettingsRepo } from "@caddy-manager/db";
import {
  checkAllSites,
  getSiteHealthJobStatus,
  getSiteHealthSettings,
  describeCron,
  previewSelectedSites,
  reconcileSelectedSites,
  startSiteHealthJob,
  stopSiteHealthJob,
} from "../jobs/siteHealth.js";
import { recordAuditEvent } from "../services/audit";

const dynamicCreateSiteSchema = createSiteSchema.extend({
  routeId: z.string().min(1).max(255),
});

export async function registerSiteRoutes(app: FastifyInstance) {
  app.get(
    "/sites",
    {
      schema: {
        tags: [
          "Sites",
        ],
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
        tags: [
          "Sites",
        ],
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
        tags: [
          "Sites",
        ],
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
      preHandler: app.authorize([
        "admin",
        "operator",
      ]),
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
        tags: [
          "Sites",
        ],
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
      preHandler: app.authorize([
        "admin",
        "operator",
      ]),
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
        tags: [
          "Sites",
        ],
        summary: "Delete a site",
        params: toJsonSchema(siteParamsSchema),
        response: { 204: { type: "null" } },
      },
      preHandler: app.authorize([
        "admin",
        "operator",
      ]),
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
        tags: [
          "Sites",
        ],
        summary: "Push site to Caddy config",
        params: toJsonSchema(siteParamsSchema),
        response: { 200: siteObjectSchema },
      },
      preHandler: app.authorize([
        "admin",
        "operator",
      ]),
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
        tags: [
          "Sites",
        ],
        summary: "Manually trigger site health check",
        response: { 200: successResponseSchema },
      },
      preHandler: app.authorize([
        "admin",
        "operator",
      ]),
    },
    async (request) => {
      void checkAllSites().catch((error) => {
        request.log.error({ err: error }, "Manual site health check failed");
      });
      return { success: true };
    },
  );

  app.post(
    "/sites/reconcile/preview",
    {
      schema: {
        tags: [
          "Sites",
        ],
        summary: "Preview selected site route reconciliation",
        body: toJsonSchema(
          z.object({ siteIds: z.array(z.string().uuid()).min(1) }),
        ),
      },
      preHandler: app.authorize([
        "admin",
        "operator",
      ]),
    },
    async (request) => {
      const { siteIds } = z
        .object({ siteIds: z.array(z.string().uuid()).min(1) })
        .parse(request.body);
      return { sites: await previewSelectedSites(siteIds) };
    },
  );

  app.post(
    "/sites/reconcile",
    {
      schema: {
        tags: [
          "Sites",
        ],
        summary: "Reconcile selected site routes",
        body: toJsonSchema(
          z.object({
            siteIds: z.array(z.string().uuid()).min(1),
          }),
        ),
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              results: { type: "array" },
            },
          },
        },
      },
      preHandler: app.authorize([
        "admin",
        "operator",
      ]),
    },
    async (request) => {
      const { siteIds } = z
        .object({ siteIds: z.array(z.string().uuid()).min(1) })
        .parse(request.body);
      try {
        const results = await reconcileSelectedSites(siteIds);
        const reconciled = results.filter((result) => result.success).length;
        await recordAuditEvent({
          userId: request.user.sub,
          action: "update",
          entity: "site",
          details: `Reconciled selected site routes: ${siteIds.join(", ")}`,
          result: results.every((result) => result.success)
            ? "success"
            : "failure",
        });
        return {
          success: results.every((result) => result.success),
          message: `Reconciled ${reconciled} of ${siteIds.length} selected site${siteIds.length === 1 ? "" : "s"}`,
          results,
        };
      } catch (error) {
        await recordAuditEvent({
          userId: request.user.sub,
          action: "update",
          entity: "site",
          details: `Failed to reconcile selected site routes: ${siteIds.join(", ")}`,
          result: "failure",
        });
        throw error;
      }
    },
  );

  app.get("/sites/health/status", async () => getSiteHealthJobStatus());
  app.get("/sites/health/settings", async () => getSiteHealthSettings());
  app.put(
    "/sites/health/settings",
    {
      schema: {
        body: toJsonSchema(
          z.object({
            enabled: z.boolean(),
            schedule: z.string().regex(/^\S+(\s+\S+){4,6}$/),
            timeoutMs: z.number().int().min(100).max(120000),
            concurrency: z.number().int().min(1).max(50),
            retries: z.number().int().min(0).max(10),
            retryDelayMs: z.number().int().min(0).max(60000),
          }),
        ),
      },
      preHandler: app.authorize([
        "admin",
        "operator",
      ]),
    },
    async (request) => {
      const data = z
        .object({
          enabled: z.boolean(),
          schedule: z.string().regex(/^\S+(\s+\S+){4,6}$/),
          timeoutMs: z.number().int().min(100).max(120000),
          concurrency: z.number().int().min(1).max(50),
          retries: z.number().int().min(0).max(10),
          retryDelayMs: z.number().int().min(0).max(60000),
        })
        .parse(request.body);
      const updated = await healthSettingsRepo.update(data);
      await recordAuditEvent({
        userId: request.user.sub,
        action: "update",
        entity: "config",
        details: "Updated persisted site health settings",
      });
      await stopSiteHealthJob();
      if (updated.enabled) await startSiteHealthJob();
      return {
        ...updated,
        scheduleDescription: describeCron(updated.schedule),
      };
    },
  );
  app.post(
    "/sites/health/pause",
    {
      preHandler: app.authorize([
        "admin",
        "operator",
      ]),
    },
    async () => {
      await stopSiteHealthJob();
      return getSiteHealthJobStatus();
    },
  );
  app.post(
    "/sites/health/resume",
    {
      preHandler: app.authorize([
        "admin",
        "operator",
      ]),
    },
    async () => {
      await startSiteHealthJob();
      return getSiteHealthJobStatus();
    },
  );
}
