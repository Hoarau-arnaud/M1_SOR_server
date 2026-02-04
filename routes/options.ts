// server/routes/options.ts
import { Router } from "@oak/oak";
import type { SQLOutputValue } from "node:sqlite";
import { APIException, ApiErrorCode, ok } from "../types/api.ts";
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

router.get("/:pollId/options", (ctx) => {
  const pollId = ctx.params.pollId;
  if (!pollId) throw new APIException(ApiErrorCode.BAD_REQUEST, 400, "Missing pollId");

  const rows = db.prepare(
    `SELECT id, poll_id, text, position, created_at
     FROM poll_options
     WHERE poll_id = ?
     ORDER BY position ASC;`,
  ).all(pollId) as Record<string, SQLOutputValue>[];

  const options = [];
  for (const r of rows) {
    if (!isOptionRow(r)) {
      throw new APIException(ApiErrorCode.INTERNAL_ERROR, 500, "Invalid option row shape from database");
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

router.post("/:pollId/options", async (ctx) => {
  const pollId = ctx.params.pollId;
  if (!pollId) throw new APIException(ApiErrorCode.BAD_REQUEST, 400, "Missing pollId");

  let body: unknown;
  try {
    body = await ctx.request.body.json();
  } catch {
    throw new APIException(ApiErrorCode.BAD_REQUEST, 400, "Invalid JSON body");
  }

  const input = body as Partial<{ id: string; text: string; position?: number }>;
  if (!input.id || !input.text) {
    throw new APIException(
      ApiErrorCode.VALIDATION_ERROR,
      422,
      'Expected body: { "id": string, "text": string, "position"?: number }',
    );
  }

  try {
    db.prepare(
      `INSERT INTO poll_options (id, poll_id, text, position) VALUES (?, ?, ?, ?);`,
    ).run(input.id, pollId, input.text, input.position ?? 0);
  } catch {
    throw new APIException(ApiErrorCode.CONFLICT, 409, "Failed to create option (id conflict or invalid poll_id)");
  }

  ctx.response.status = 201;
  ctx.response.body = ok({ id: input.id });
});

router.delete("/:pollId/options/:optionId", (ctx) => {
  const pollId = ctx.params.pollId;
  const optionId = ctx.params.optionId;
  if (!pollId || !optionId) throw new APIException(ApiErrorCode.BAD_REQUEST, 400, "Missing pollId or optionId");

  db.prepare(`DELETE FROM poll_options WHERE id = ? AND poll_id = ?;`).run(optionId, pollId);

  ctx.response.status = 200;
  ctx.response.body = ok({ deleted: true, id: optionId });
});

export default router;
