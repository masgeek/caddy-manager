import type { FastifyInstance } from "fastify";
import { userRepo } from "@caddy-manager/db";
import type { UserRole } from "@caddy-manager/shared-types";
import { loginSchema, loginResponseSchema, toJsonSchema } from "../lib/schemas";
import { AppError } from "../lib/errors";
import { verifyPassword } from "../lib/password";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post(
    "/auth/login",
    {
      schema: {
        tags: ["Auth"],
        summary: "Login",
        description:
          "Authenticate with username and password to receive a JWT token",
        security: [],
        body: {
          ...toJsonSchema(loginSchema),
          example: { username: "admin", password: "your-password" },
        },
        response: { 200: loginResponseSchema },
      },
    },
    async (request, reply) => {
      const { username, password } = loginSchema.parse(request.body);

      const user = await userRepo.findByUsername(username);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        throw new AppError(401, "Invalid credentials");
      }

      const token = await reply.jwtSign(
        {
          sub: user.id,
          username: user.username,
          role: user.role as UserRole,
        },
        { expiresIn: "24h" },
      );
      return { token, expiresIn: 86400 };
    },
  );
}
