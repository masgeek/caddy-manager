import type { FastifyInstance } from "fastify";
import { healthResponseSchema } from "../lib/schemas";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Health check",
        response: { 200: healthResponseSchema },
      },
    },
    async () => {
      return {
        status: "online",
        version: "0.1.0",
        uptime: process.uptime(),
        checkedAt: new Date().toISOString(),
      };
    },
  );
}
