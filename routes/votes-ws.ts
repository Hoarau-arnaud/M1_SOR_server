import { Router } from "@oak/oak";
import { APIException, ApiErrorCode } from "../types/api.ts";
import { db } from "../db.ts";
import { isVoteCastMessage } from "../utils/ws_guards.ts";
import { subscribe, unsubscribe, handleVoteMessage } from "../services/vote-service.ts";

const router = new Router();

router.get("/votes/:pollId", (ctx) => {
  const pollId = ctx.params.pollId;
  if (!pollId) throw new APIException(ApiErrorCode.NOT_FOUND, 404, "Poll not found");

  if (!ctx.isUpgradable) {
    throw new APIException(ApiErrorCode.BAD_REQUEST, 400, "WebSocket required");
  }

  const ws = ctx.upgrade();

  ws.onopen = () => subscribe(ws, pollId);

  ws.onmessage = (e) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(e.data));
    } catch {
      // message mal formé => ignore / ou ack erreur
      return;
    }
    if (!isVoteCastMessage(parsed)) return;

    // optionnel : sécurité pollId mismatch
    if (parsed.pollId !== pollId) return;

    handleVoteMessage(db, ws, parsed);
  };

  ws.onclose = () => unsubscribe(ws, pollId);
  ws.onerror = () => unsubscribe(ws, pollId);
});

export default router;
