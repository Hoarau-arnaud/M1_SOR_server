// server/routes/users.ts
import { Router } from "@oak/oak";
import type { SQLOutputValue } from "node:sqlite";
import { APIException, ApiErrorCode, ok } from "../types/api.ts";
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

router.get("/", (ctx) => {
  const rows = db.prepare(
    `SELECT id, email, role, created_at FROM users ORDER BY created_at DESC;`,
  ).all() as Record<string, SQLOutputValue>[];

  const users = [];
  for (const r of rows) {
    if (!isUserRow(r)) {
      throw new APIException(ApiErrorCode.INTERNAL_ERROR, 500, "Invalid user row shape from database");
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

router.post("/", async (ctx) => {
  let body: unknown;
  try {
    body = await ctx.request.body.json();
  } catch {
    throw new APIException(ApiErrorCode.BAD_REQUEST, 400, "Invalid JSON body");
  }

  const input = body as Partial<{ id: string; email: string; passwordHash: string; role?: "USER" | "ADMIN" }>;
  if (!input.id || !input.email || !input.passwordHash) {
    throw new APIException(
      ApiErrorCode.VALIDATION_ERROR,
      422,
      'Expected body: { "id": string, "email": string, "passwordHash": string, "role"?: "USER"|"ADMIN" }',
    );
  }

  const role = input.role ?? "USER";

  try {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?);`,
    ).run(input.id, input.email, input.passwordHash, role);
  } catch {
    throw new APIException(ApiErrorCode.CONFLICT, 409, "User already exists or email already used");
  }

  ctx.response.status = 201;
  ctx.response.body = ok({ id: input.id });
});

export default router;
