// server/routes/polls.ts
import { Router } from "@oak/oak";
import type { SQLOutputValue } from "node:sqlite";
import { APIException, ApiErrorCode, ok } from "../types/api.ts";
import type { CreatePollInput, Poll } from "../types/domain.ts";
import { db } from "../db.ts";
import { isPollOptionRow, isPollRow } from "../utils/guards.ts";
import { pollRowToApi } from "../utils/mappers.ts";

const router = new Router({ prefix: "/polls" });

// GET /polls (liste)
router.get("/", (ctx) => {
  const rows = db.prepare(
    `SELECT id, owner_id, title, description, status, allow_guests, allow_multiple, created_at, expires_at
     FROM polls
     ORDER BY created_at DESC;`,
  ).all() as Record<string, SQLOutputValue>[];

  const polls: Poll[] = [];
  for (const r of rows) {
    if (!isPollRow(r)) {
      throw new APIException(ApiErrorCode.INTERNAL_ERROR, 500, "Invalid PollRow shape from database");
    }
    polls.push(pollRowToApi(r, []));
  }

  ctx.response.status = 200;
  ctx.response.body = ok(polls);
});

// GET /polls/:pollId (détail + options + vote_count)
router.get("/:pollId", (ctx) => {
  const pollId = ctx.params.pollId;
  if (!pollId) throw new APIException(ApiErrorCode.BAD_REQUEST, 400, "Missing pollId");

  const rawPoll = db.prepare(
    `SELECT id, owner_id, title, description, status, allow_guests, allow_multiple, created_at, expires_at
     FROM polls WHERE id = ?;`,
  ).get(pollId) as Record<string, SQLOutputValue> | undefined;

  if (!rawPoll) throw new APIException(ApiErrorCode.NOT_FOUND, 404, `Poll "${pollId}" not found`);
  if (!isPollRow(rawPoll)) throw new APIException(ApiErrorCode.INTERNAL_ERROR, 500, "Invalid PollRow shape from database");

  const rawOptions = db.prepare(
    `SELECT
        o.id,
        o.poll_id,
        o.text,
        o.position,
        o.created_at,
        COUNT(v.id) AS vote_count
     FROM poll_options o
     LEFT JOIN votes v ON v.option_id = o.id
     WHERE o.poll_id = ?
     GROUP BY o.id, o.poll_id, o.text, o.position, o.created_at
     ORDER BY o.position ASC;`,
  ).all(pollId) as Record<string, SQLOutputValue>[];

  const optionRows = [];
  for (const o of rawOptions) {
    if (!isPollOptionRow(o)) {
      throw new APIException(ApiErrorCode.INTERNAL_ERROR, 500, "Invalid PollOptionRow shape from database");
    }
    optionRows.push(o);
  }

  ctx.response.status = 200;
  ctx.response.body = ok(pollRowToApi(rawPoll, optionRows));
});

// POST /polls (création poll + options)
router.post("/", async (ctx) => {
  let body: unknown;
  try {
    body = await ctx.request.body.json();
  } catch {
    throw new APIException(ApiErrorCode.BAD_REQUEST, 400, "Invalid JSON body");
  }

  const input = body as Partial<CreatePollInput>;

  if (!input.id || !input.ownerId || !input.title || !Array.isArray(input.options) || input.options.length === 0) {
    throw new APIException(
      ApiErrorCode.VALIDATION_ERROR,
      422,
      'Expected body: { id, ownerId, title, options:[{id,text}] }',
    );
  }

  const status = input.status ?? "ACTIVE";
  const allowGuests = input.allowGuests ? 1 : 0;
  const allowMultiple = input.allowMultiple ? 1 : 0;
  const description = input.description ?? null;
  const expiresAt = input.expiresAt ?? null;

  try {
    db.exec("BEGIN");

    db.prepare(
      `INSERT INTO polls (id, owner_id, title, description, status, allow_guests, allow_multiple, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    ).run(input.id, input.ownerId, input.title, description, status, allowGuests, allowMultiple, expiresAt);

    const insertOpt = db.prepare(
      `INSERT INTO poll_options (id, poll_id, text, position)
       VALUES (?, ?, ?, ?);`,
    );

    input.options.forEach((opt, idx) => {
      if (!opt?.id || !opt?.text) {
        throw new APIException(ApiErrorCode.VALIDATION_ERROR, 422, "Invalid option object");
      }
      insertOpt.run(opt.id, input.id!, opt.text, opt.position ?? idx);
    });

    db.exec("COMMIT");
  } catch (err) {
    console.error(err);
    db.exec("ROLLBACK");
    throw new APIException(ApiErrorCode.CONFLICT, 409, "Failed to create poll (id conflict or invalid FK)");
  }

  ctx.response.status = 201;
  ctx.response.body = ok({ id: input.id });
});

export default router;
