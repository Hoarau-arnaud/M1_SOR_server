import { Router } from "@oak/oak";
import type { SQLOutputValue } from "node:sqlite";
import { ApiErrorCode, fail, ok } from "../types/api.ts";
import { db } from "../db.ts";

type OptionRow = {
  id: string;
  poll_id: string;
  text: string;
  position: number | bigint;
  created_at: string;
  [key: string]: SQLOutputValue;
};

function isOptionRow(obj: Record<string, SQLOutputValue>): obj is OptionRow {
  return (
    "id" in obj && typeof obj.id === "string" &&
    "poll_id" in obj && typeof obj.poll_id === "string" &&
    "text" in obj && typeof obj.text === "string" &&
    "position" in obj && (typeof obj.position === "number" || typeof obj.position === "bigint") &&
    "created_at" in obj && typeof obj.created_at === "string"
  );
}

const toNumber = (v: number | bigint) => typeof v === "bigint" ? Number(v) : v;

const router = new Router({ prefix: "/polls" });

/** GET /polls/:pollId/options */
router.get("/:pollId/options", (ctx) => {
  const pollId = ctx.params.pollId;
  if (!pollId) {
    ctx.response.status = 400;
    ctx.response.body = fail(ApiErrorCode.BAD_REQUEST, "Missing pollId");
    return;
  }

  const rows = db.prepare(
    `SELECT id, poll_id, text, position, created_at
     FROM poll_options
     WHERE poll_id = ?
     ORDER BY position ASC;`,
  ).all(pollId) as Record<string, SQLOutputValue>[];

  const options = [];
  for (const r of rows) {
    if (!isOptionRow(r)) {
      ctx.response.status = 500;
      ctx.response.body = fail(ApiErrorCode.INTERNAL_ERROR, "Invalid option row shape from database");
      return;
    }
    options.push({
      id: r.id,
      pollId: r.poll_id,
      text: r.text,
      position: toNumber(r.position),
      createdAt: r.created_at,
    });
  }

  ctx.response.status = 200;
  ctx.response.body = ok(options);
});

/** POST /polls/:pollId/options */
router.post("/:pollId/options", async (ctx) => {
  const pollId = ctx.params.pollId;
  if (!pollId) {
    ctx.response.status = 400;
    ctx.response.body = fail(ApiErrorCode.BAD_REQUEST, "Missing pollId");
    return;
  }

  let body: unknown;
  try {
    body = await ctx.request.body.json();
  } catch {
    ctx.response.status = 400;
    ctx.response.body = fail(ApiErrorCode.BAD_REQUEST, "Invalid JSON body");
    return;
  }

  const input = body as Partial<{ id: string; text: string; position?: number }>;
  if (!input.id || !input.text) {
    ctx.response.status = 422;
    ctx.response.body = fail(ApiErrorCode.VALIDATION_ERROR, 'Expected body: { "id": string, "text": string, "position"?: number }');
    return;
  }

  try {
    db.prepare(
      `INSERT INTO poll_options (id, poll_id, text, position) VALUES (?, ?, ?, ?);`,
    ).run(input.id, pollId, input.text, input.position ?? 0);
  } catch (err) {
    console.error(err);
    ctx.response.status = 409;
    ctx.response.body = fail(ApiErrorCode.CONFLICT, "Failed to create option (id conflict or invalid poll_id)");
    return;
  }

  ctx.response.status = 201;
  ctx.response.body = ok({ id: input.id });
});

/** DELETE /polls/:pollId/options/:optionId */
router.delete("/:pollId/options/:optionId", (ctx) => {
  const pollId = ctx.params.pollId;
  const optionId = ctx.params.optionId;

  if (!pollId || !optionId) {
    ctx.response.status = 400;
    ctx.response.body = fail(ApiErrorCode.BAD_REQUEST, "Missing pollId or optionId");
    return;
  }

  const res = db.prepare(
    `DELETE FROM poll_options WHERE id = ? AND poll_id = ?;`,
  ).run(optionId, pollId);

  // SQLite run() retourne un objet driver-dependent; on ne peut pas toujours lire changes
  ctx.response.status = 200;
  ctx.response.body = ok({ deleted: true, id: optionId });
});

export default router;
