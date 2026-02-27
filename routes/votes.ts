// server/routes/votes.ts
import { Router } from "@oak/oak";
import { APIException, ApiErrorCode, ok } from "../types/api.ts";
import { db } from "../db.ts";
import { isVoteCastMessage } from "../utils/ws_guards.ts";
import type { VoteAckMessage, VotesUpdateMessage } from "../types/ws.ts";

// ------------------------------
// 1) HTTP votes (déjà existant)
// ------------------------------
const httpRouter = new Router({ prefix: "/polls" });

httpRouter.post("/:pollId/votes", async (ctx) => {
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

// ------------------------------
// 2) WebSocket votes (TP4)
// GET /votes/:pollId
// ------------------------------
const wsRouter = new Router();

// clients abonnés par pollId
const channels = new Map<string, Set<WebSocket>>();
// token invité par socket (pour respecter le CHECK SQL user_id XOR guest_token)
const guestTokenBySocket = new WeakMap<WebSocket, string>();

function getChannel(pollId: string): Set<WebSocket> {
  let set = channels.get(pollId);
  if (!set) {
    set = new Set<WebSocket>();
    channels.set(pollId, set);
  }
  return set;
}

function broadcast(pollId: string, msg: VotesUpdateMessage) {
  const set = channels.get(pollId);
  if (!set) return;
  const payload = JSON.stringify(msg);
  for (const ws of set) {
    try {
      ws.send(payload);
    } catch {
      // ignore
    }
  }
}

function wsSendAck(ws: WebSocket, ack: VoteAckMessage) {
  ws.send(JSON.stringify(ack));
}

wsRouter.get("/votes/:pollId", (ctx) => {
  const pollId = ctx.params.pollId;
  if (!pollId) throw new APIException(ApiErrorCode.NOT_FOUND, 404, "Poll not found");

  if (!ctx.isUpgradable) {
    throw new APIException(ApiErrorCode.BAD_REQUEST, 400, "WebSocket required");
  }

  const ws = ctx.upgrade();
  const channel = getChannel(pollId);

  ws.onopen = () => {
    channel.add(ws);
    // on attribue un token invité stable pour ce socket
    guestTokenBySocket.set(ws, crypto.randomUUID());
  };

  ws.onclose = () => {
    channel.delete(ws);
    if (channel.size === 0) channels.delete(pollId);
  };

  ws.onerror = () => {
    channel.delete(ws);
    if (channel.size === 0) channels.delete(pollId);
  };

  ws.onmessage = (e) => {
    let raw: unknown;

    try {
      raw = JSON.parse(String(e.data));
    } catch {
      wsSendAck(ws, {
        type: "vote_ack",
        pollId,
        optionId: "",
        success: false,
        error: { code: ApiErrorCode.BAD_REQUEST, message: "Invalid JSON" },
      });
      return;
    }

    if (!isVoteCastMessage(raw)) {
      wsSendAck(ws, {
        type: "vote_ack",
        pollId,
        optionId: "",
        success: false,
        error: { code: ApiErrorCode.BAD_REQUEST, message: "Invalid message shape" },
      });
      return;
    }

    // sécurité : le client doit voter dans le poll auquel il est abonné
    if (raw.pollId !== pollId) {
      wsSendAck(ws, {
        type: "vote_ack",
        pollId,
        optionId: raw.optionId,
        success: false,
        error: { code: ApiErrorCode.BAD_REQUEST, message: "pollId mismatch" },
      });
      return;
    }

    // Insert vote
    const voteId = crypto.randomUUID();
    const userId = raw.userId ?? null;
    const guestToken = userId ? null : (guestTokenBySocket.get(ws) ?? crypto.randomUUID());

    try {
      db.prepare(
        `INSERT INTO votes (id, poll_id, option_id, user_id, guest_token)
         VALUES (?, ?, ?, ?, ?);`,
      ).run(voteId, pollId, raw.optionId, userId, guestToken);

      // ACK
      wsSendAck(ws, {
        type: "vote_ack",
        pollId,
        optionId: raw.optionId,
        success: true,
      });

      // Recompute vote_count and broadcast
      const row = db.prepare(
        `SELECT COUNT(*) AS c FROM votes WHERE option_id = ?;`,
      ).get(raw.optionId) as Record<string, unknown> | undefined;

      const voteCount = Number(row?.c ?? 0);

      broadcast(pollId, {
        type: "votes_update",
        pollId,
        optionId: raw.optionId,
        voteCount,
      });
    } catch {
      wsSendAck(ws, {
        type: "vote_ack",
        pollId,
        optionId: raw.optionId,
        success: false,
        error: { code: ApiErrorCode.CONFLICT, message: "Vote already exists or constraint violation" },
      });
    }
  };
});

// Export un routeur "combiné"
const router = new Router();
router.use(httpRouter.routes(), httpRouter.allowedMethods());
router.use(wsRouter.routes(), wsRouter.allowedMethods());

export default router;
