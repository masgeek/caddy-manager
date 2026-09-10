import { config } from "@caddy-manager/config";
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { createStream } from "rotating-file-stream";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";

import { errorHandler } from "./lib/errors";
import { registerSwagger } from "./plugins/swagger";
import { registerAuth } from "./plugins/auth";
import { registerAuthRoutes } from "./routes/auth";
import { registerHealthRoutes } from "./routes/health";
import { registerServerRoutes } from "./routes/servers";
import { registerSiteRoutes } from "./routes/sites";
import { registerConfigRoutes } from "./routes/config";
import { registerLogRoutes } from "./routes/logs";
import { registerAuditRoutes } from "./routes/audit";
import { registerInventoryRoutes } from "./routes/inventory";
import { registerSiteGroupRoutes } from "./routes/site-groups";

export async function buildApp() {
  const logFile = isAbsolute(config.logFile)
    ? config.logFile
    : resolve(process.cwd(), config.logFile);
  mkdirSync(dirname(logFile), { recursive: true });
  const logStream = createStream(basename(logFile), {
    interval: "1d",
    maxFiles: 30,
    path: dirname(logFile),
  });

  const app = Fastify({
    logger: {
      level: config.logLevel,
      stream: logStream,
    },
    ajv: {
      customOptions: {
        strict: false,
      },
    },
  });

  const webRoot = resolve(process.cwd(), "apps/web/dist");
  if (existsSync(webRoot)) {
    await app.register(fastifyStatic, {
      root: webRoot,
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api")) {
        return reply.sendFile("index.html");
      }
      return reply.status(404).send({ statusCode: 404, message: "Not found" });
    });
  }

  app.setErrorHandler(errorHandler);

  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });
  await app.register(sensible);

  await registerSwagger(app);
  await registerAuth(app);

  await app.register(
    async (scoped) => {
      // Public routes (no JWT required)
      await scoped.register(async (public_) => {
        await registerAuthRoutes(public_);
        await registerHealthRoutes(public_);
      });

      // Protected routes (JWT required)
      await scoped.register(async (protected_) => {
        protected_.addHook("onRequest", async (request, reply) => {
          try {
            await app.authenticate(request, reply);
          } catch {
            return reply
              .status(401)
              .send({ statusCode: 401, message: "Unauthorized" });
          }
        });
        await registerServerRoutes(protected_);
        await registerSiteRoutes(protected_);
        await registerConfigRoutes(protected_);
        await registerLogRoutes(protected_);
        await registerAuditRoutes(protected_);
        await registerInventoryRoutes(protected_);
        await registerSiteGroupRoutes(protected_);
      });
    },
    { prefix: "/api" },
  );

  return app;
}
