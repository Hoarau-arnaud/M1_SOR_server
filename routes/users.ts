import { Router } from "@oak/oak";
import type { SQLOutputValue } from "node:sqlite";
import { ApiErrorCode, fail, ok } from "../types/api.ts";
import { db } from "../db.ts";

type UserRow = {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  created_at: string;
  [key: string]: SQLOutputValue;
};

function isUserRow(obj: Record<string, SQLOutputValue>): obj is UserRow {
  return (
    "id" in obj && typeof obj.id === "string" &&
    "email" in obj && typeof obj.email === "string" &&
    "role" in obj && (obj.role === "USER" || obj.role === "ADMIN") &&
    "created_at" in obj && typeof obj.created_at === "string"
  );
}

const router = new Router({ prefix: "/users" });

/** GET /users : liste (admin dans le futur, mais TP-friendly) */
router.get("/", (ctx) => {
  const rows = db.prepare(
    `SELECT id, email, role, created_at FROM users ORDER BY created_at DESC;`,
  ).all() as Record<string, SQLOutputValue>[];

  const users = [];
  for (const r of rows) {
    if (!isUserRow(r)) {
      ctx.response.status = 500;
      ctx.response.body = fail(ApiErrorCode.INTERNAL_ERROR, "Invalid user row shape from database");
      return;
    }
    users.push({
      id: r.id,
      email: r.email,
      role: r.role,
      createdAt: r.created_at,
    });
  }

  ctx.response.status = 200;
  ctx.response.body = ok(users);
});

/** POST /users : création simple (TP) */
router.post("/", async (ctx) => {
  let body: unknown;
  try {
    body = await ctx.request.body.json();
  } catch {
    ctx.response.status = 400;
    ctx.response.body = fail(ApiErrorCode.BAD_REQUEST, "Invalid JSON body");
    return;
  }

  const input = body as Partial<{ id: string; email: string; passwordHash: string; role?: "USER" | "ADMIN" }>;

  if (!input.id || !input.email || !input.passwordHash) {
    ctx.response.status = 422;
    ctx.response.body = fail(
      ApiErrorCode.VALIDATION_ERROR,
      'Expected body: { "id": string, "email": string, "passwordHash": string, "role"?: "USER"|"ADMIN" }',
    );
    return;
  }

  const role = input.role ?? "USER";

  try {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?);`,
    ).run(input.id, input.email, input.passwordHash, role);
  } catch (err) {
    console.error(err);
    ctx.response.status = 409;
    ctx.response.body = fail(ApiErrorCode.CONFLICT, "User already exists or email already used");
    return;
  }

  ctx.response.status = 201;
  ctx.response.body = ok({ id: input.id });
});

export default router;
