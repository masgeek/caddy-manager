import type { FastifyInstance } from "fastify";
import {
  createSiteInventorySchema,
  updateSiteInventorySchema,
} from "@caddy-manager/db";
import { toJsonSchema } from "../lib/schemas";
import * as inventoryService from "../services/inventory";

export async function registerInventoryRoutes(app: FastifyInstance) {
  app.post(
    "/site-inventory/ensure-dynamic",
    { preHandler: app.authorize(["admin", "operator"]) },
    async () => inventoryService.ensureDynamicInfrastructure(),
  );

  app.get("/site-inventory", async (request) => {
    const query = request.query as { serverId?: string };
    return inventoryService.listInventory(query.serverId);
  });

  app.get("/site-inventory/:id", async (request) => {
    const { id } = request.params as { id: string };
    return inventoryService.getInventory(id);
  });

  app.post(
    "/site-inventory",
    {
      schema: { body: toJsonSchema(createSiteInventorySchema) },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async (request, reply) => {
      const item = await inventoryService.createInventory(
        createSiteInventorySchema.parse(request.body),
      );
      return reply.status(201).send(item);
    },
  );

  app.put(
    "/site-inventory/:id",
    {
      schema: { body: toJsonSchema(updateSiteInventorySchema) },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async (request) => {
      const { id } = request.params as { id: string };
      return inventoryService.updateInventory(
        id,
        updateSiteInventorySchema.parse(request.body),
      );
    },
  );

  app.post(
    "/site-inventory/:id/ready",
    { preHandler: app.authorize(["admin", "operator"]) },
    async (request) => {
      const { id } = request.params as { id: string };
      return inventoryService.markReady(id);
    },
  );

  app.post(
    "/site-inventory/:id/provision",
    { preHandler: app.authorize(["admin", "operator"]) },
    async (request) => {
      const { id } = request.params as { id: string };
      return inventoryService.provisionInventory(id);
    },
  );

  app.post(
    "/site-inventory/:id/disable",
    { preHandler: app.authorize(["admin", "operator"]) },
    async (request) => {
      const { id } = request.params as { id: string };
      return inventoryService.disableInventory(id);
    },
  );

  app.delete(
    "/site-inventory/:id",
    { preHandler: app.authorize(["admin", "operator"]) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await inventoryService.deleteInventory(id);
      return reply.status(204).send();
    },
  );
}
