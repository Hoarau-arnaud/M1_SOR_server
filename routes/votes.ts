import { Router } from "@oak/oak";
import { ApiErrorCode, fail, ok } from "../types/api.ts";
import { db } from "../db.ts";

const router = new Router({ prefix: "/polls" });

/** POST /polls/:pollId/votes */
router.post("/:pollId/votes", async (ctx) => {
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

  const input = body as Partial<{
    id: string;
    optionId: string;
    userId?: string | null;
    guestToken?: string | null;
  }>;

  if (!input.id || !input.optionId) {
    ctx.response.status = 422;
    ctx.response.body = fail(ApiErrorCode.VALIDATION_ERROR, 'Expected body: { "id": string, "optionId": string, "userId"?: string, "guestToken"?: string }');
    return;
  }

  const userId = input.userId ?? null;
  const guestToken = input.guestToken ?? null;

  // contrainte XOR : userId ou guestToken, pas les deux, pas aucun
  const xorOk = (userId && !guestToken) || (!userId && guestToken);
  if (!xorOk) {
    ctx.response.status = 422;
    ctx.response.body = fail(ApiErrorCode.VALIDATION_ERROR, "Provide either userId OR guestToken (exactly one)");
    return;
  }

  try {
    db.prepare(
      `INSERT INTO votes (id, poll_id, option_id, user_id, guest_token)
       VALUES (?, ?, ?, ?, ?);`,
    ).run(input.id, pollId, input.optionId, userId, guestToken);
  } catch (err) {
    console.error(err);
    ctx.response.status = 409;
    ctx.response.body = fail(ApiErrorCode.CONFLICT, "Vote already exists or invalid FK/constraint");
    return;
  }

  ctx.response.status = 201;
  ctx.response.body = ok({ id: input.id });
});

export default router;
