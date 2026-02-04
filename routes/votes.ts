// server/routes/votes.ts
import { Router } from "@oak/oak";
import { APIException, ApiErrorCode, ok } from "../types/api.ts";
import { db } from "../db.ts";

const router = new Router({ prefix: "/polls" });

router.post("/:pollId/votes", async (ctx) => {
  const pollId = ctx.params.pollId;
  if (!pollId) throw new APIException(ApiErrorCode.BAD_REQUEST, 400, "Missing pollId");

  let body: unknown;
  try {
    body = await ctx.request.body.json();
  } catch {
    throw new APIException(ApiErrorCode.BAD_REQUEST, 400, "Invalid JSON body");
  }

  const input = body as Partial<{
    id: string;
    optionId: string;
    userId?: string | null;
    guestToken?: string | null;
  }>;

  if (!input.id || !input.optionId) {
    throw new APIException(
      ApiErrorCode.VALIDATION_ERROR,
      422,
      'Expected body: { "id": string, "optionId": string, "userId"?: string, "guestToken"?: string }',
    );
  }

  const userId = input.userId ?? null;
  const guestToken = input.guestToken ?? null;

  const xorOk = (userId && !guestToken) || (!userId && guestToken);
  if (!xorOk) {
    throw new APIException(ApiErrorCode.VALIDATION_ERROR, 422, "Provide either userId OR guestToken (exactly one)");
  }

  try {
    db.prepare(
      `INSERT INTO votes (id, poll_id, option_id, user_id, guest_token)
       VALUES (?, ?, ?, ?, ?);`,
    ).run(input.id, pollId, input.optionId, userId, guestToken);
  } catch {
    throw new APIException(ApiErrorCode.CONFLICT, 409, "Vote already exists or invalid FK/constraint");
  }

  ctx.response.status = 201;
  ctx.response.body = ok({ id: input.id });
});

export default router;
