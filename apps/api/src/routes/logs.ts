import type { FastifyInstance } from "fastify";
import { logQuerySchema, logListSchema, toJsonSchema } from "../lib/schemas";
import * as logService from "../services/log";

export async function registerLogRoutes(app: FastifyInstance) {
  app.get(
    "/logs",
    {
      schema: {
        tags: ["Logs"],
        summary: "Get application and Caddy logs",
        querystring: toJsonSchema(logQuerySchema),
        response: { 200: logListSchema },
      },
    },
    async (request) => {
      const query = logQuerySchema.parse(request.query);
      return logService.getLogs(query);
    },
  );
}
