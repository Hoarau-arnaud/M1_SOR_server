import { Router } from "@oak/oak";
import type { SQLOutputValue } from "node:sqlite";
import { ApiErrorCode, fail, ok } from "../types/api.ts";
import type { CreatePollInput, Poll } from "../types/domain.ts";
import { db } from "../db.ts";
import { isPollOptionRow, isPollRow } from "../utils/guards.ts";
import { pollRowToApi } from "../utils/mappers.ts";

const router = new Router({ prefix: "/polls" });

// GET /polls  -> liste (sans options pour simplicité)
router.get("/", (ctx) => {
  const rows = db.prepare(
    `SELECT id, owner_id, title, description, status, allow_guests, allow_multiple, created_at, expires_at
     FROM polls
     ORDER BY created_at DESC;`,
  ).all() as Record<string, SQLOutputValue>[];

  const polls: Poll[] = [];
  for (const r of rows) {
    if (!isPollRow(r)) {
      ctx.response.status = 500;
      ctx.response.body = fail(ApiErrorCode.INTERNAL_ERROR, "Invalid PollRow shape from database");
      return;
    }
    polls.push(pollRowToApi(r, [])); // options=[] ici
  }

  ctx.response.status = 200;
  ctx.response.body = ok(polls);
});

// GET /polls/:pollId -> détail + options + vote_count
router.get("/:pollId", (ctx) => {
  const pollId = ctx.params.pollId;
  if (!pollId) {
    ctx.response.status = 400;
    ctx.response.body = fail(ApiErrorCode.BAD_REQUEST, "Missing pollId");
    return;
  }

  const rawPoll = db.prepare(
    `SELECT id, owner_id, title, description, status, allow_guests, allow_multiple, created_at, expires_at
     FROM polls WHERE id = ?;`,
  ).get(pollId) as Record<string, SQLOutputValue> | undefined;

  if (!rawPoll) {
    ctx.response.status = 404;
    ctx.response.body = fail(ApiErrorCode.NOT_FOUND, `Poll "${pollId}" not found`);
    return;
  }
  if (!isPollRow(rawPoll)) {
    ctx.response.status = 500;
    ctx.response.body = fail(ApiErrorCode.INTERNAL_ERROR, "Invalid PollRow shape from database");
    return;
  }

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
      ctx.response.status = 500;
      ctx.response.body = fail(ApiErrorCode.INTERNAL_ERROR, "Invalid PollOptionRow shape from database");
      return;
    }
    optionRows.push(o);
  }

  ctx.response.status = 200;
  ctx.response.body = ok(pollRowToApi(rawPoll, optionRows));
});

// POST /polls -> création poll + options (transaction)
router.post("/", async (ctx) => {
  let body: unknown;
  try {
    body = await ctx.request.body.json();
  } catch {
    ctx.response.status = 400;
    ctx.response.body = fail(ApiErrorCode.BAD_REQUEST, "Invalid JSON body");
    return;
  }

  const input = body as Partial<CreatePollInput>;

  if (!input.id || !input.ownerId || !input.title || !Array.isArray(input.options) || input.options.length === 0) {
    ctx.response.status = 422;
    ctx.response.body = fail(
      ApiErrorCode.VALIDATION_ERROR,
      'Expected body: { id, ownerId, title, options:[{id,text}] }',
    );
    return;
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
      if (!opt?.id || !opt?.text) throw new Error("Invalid option");
      insertOpt.run(opt.id, input.id!, opt.text, opt.position ?? idx);
    });

    db.exec("COMMIT");
  } catch (err) {
    console.error(err);
    db.exec("ROLLBACK");
    ctx.response.status = 409;
    ctx.response.body = fail(ApiErrorCode.CONFLICT, "Failed to create poll (id conflict or invalid FK)");
    return;
  }

  ctx.response.status = 201;
  ctx.response.body = ok({ id: input.id });
});

export default router;
