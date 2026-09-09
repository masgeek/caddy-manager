import type { FastifyInstance } from "fastify";
import {
  createSiteGroupSchema,
  updateSiteGroupSchema,
} from "@caddy-manager/db";
import { toJsonSchema } from "../lib/schemas";
import * as groupService from "../services/site-group";

export async function registerSiteGroupRoutes(app: FastifyInstance) {
  app.get("/site-groups", async (request) => {
    const query = request.query as { serverId?: string };
    return groupService.listGroups(query.serverId);
  });

  app.get("/site-groups/:id", async (request) => {
    const { id } = request.params as { id: string };
    return groupService.getGroup(id);
  });

  app.post(
    "/site-groups",
    {
      schema: { body: toJsonSchema(createSiteGroupSchema) },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async (request, reply) => {
      const group = await groupService.createGroup(
        createSiteGroupSchema.parse(request.body),
      );
      return reply.status(201).send(group);
    },
  );

  app.put(
    "/site-groups/:id",
    {
      schema: { body: toJsonSchema(updateSiteGroupSchema) },
      preHandler: app.authorize(["admin", "operator"]),
    },
    async (request) => {
      const { id } = request.params as { id: string };
      return groupService.updateGroup(
        id,
        updateSiteGroupSchema.parse(request.body),
      );
    },
  );

  app.delete(
    "/site-groups/:id",
    { preHandler: app.authorize(["admin", "operator"]) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await groupService.deleteGroup(id);
      return reply.status(204).send();
    },
  );
}
