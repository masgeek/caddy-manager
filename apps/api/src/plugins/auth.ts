import { config } from "@caddy-manager/config";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fjwt from "@fastify/jwt";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";
import type { UserRole } from "@caddy-manager/shared-types";

export async function registerAuth(app: FastifyInstance) {
  await app.register(fjwt, { secret: config.jwtSecret });

  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        throw new UnauthorizedError("Invalid or expired token");
      }
    },
  );

  app.decorate(
    "authorize",
    (roles: UserRole[]) => async (request: FastifyRequest) => {
      if (!roles.includes(request.user.role)) {
        throw new ForbiddenError();
      }
    },
  );
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; username: string; role: UserRole };
    user: { sub: string; username: string; role: UserRole };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    authorize: (
      roles: UserRole[],
    ) => (request: FastifyRequest) => Promise<void>;
  }
}
