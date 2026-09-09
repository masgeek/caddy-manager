import { z } from "zod";
import { eq } from "drizzle-orm";
import type { User } from "@caddy-manager/shared-types";
import { db } from "../connection";
import { users } from "../schema";

export const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(1).max(30),
  role: z.string().optional(),
  passwordHash: z.string(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role as User["role"],
    createdAt: row.createdAt.toISOString(),
  };
}

class UserRepository {
  async findByEmail(
    email: string,
  ): Promise<typeof users.$inferSelect | undefined> {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row;
  }

  async findByUsername(
    username: string,
  ): Promise<typeof users.$inferSelect | undefined> {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return row;
  }

  async findById(id: string): Promise<User | undefined> {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ? toUser(row) : undefined;
  }

  async create(data: CreateUserInput): Promise<User> {
    const [row] = await db
      .insert(users)
      .values({
        email: data.email,
        username: data.username,
        role: data.role ?? "viewer",
        passwordHash: data.passwordHash,
      })
      .returning();
    return toUser(row);
  }
}

export const userRepo = new UserRepository();
