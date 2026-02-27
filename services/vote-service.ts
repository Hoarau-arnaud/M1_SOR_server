// server/services/vote-service.ts
import type { DatabaseSync } from "node:sqlite";
import { APIException, ApiErrorCode } from "../types/api.ts";
import type { VoteCastMessage, VoteAckMessage, VotesUpdateMessage } from "../types/ws.ts";

// PollId -> Set<WebSocket>
const subscriptions = new Map<string, Set<WebSocket>>();

// Un token invité stable par socket (pour satisfaire le CHECK user_id XOR guest_token)
const guestTokenBySocket = new WeakMap<WebSocket, string>();

function ensureGuestToken(ws: WebSocket): string {
  let t = guestTokenBySocket.get(ws);
  if (!t) {
    t = crypto.randomUUID();
    guestTokenBySocket.set(ws, t);
  }
  return t;
}


/**
 * Variant guest vote (avec guestToken), utilisé par handleVoteMessage.
 */
function castVoteGuest(
  db: DatabaseSync,
  pollId: string,
  optionId: string,
  guestToken: string,
): number {
  const voteId = crypto.randomUUID();

  try {
    db.prepare(
      `INSERT INTO votes (id, poll_id, option_id, user_id, guest_token)
       VALUES (?, ?, ?, NULL, ?);`,
    ).run(voteId, pollId, optionId, guestToken);
  } catch (err) {
    console.error(err);
    throw new APIException(ApiErrorCode.CONFLICT, 409, "Vote already exists or constraint violation");
  }

  const row = db.prepare(`SELECT COUNT(*) AS c FROM votes WHERE option_id = ?;`)
    .get(optionId) as Record<string, unknown> | undefined;

  return Number(row?.c ?? 0);
}

export function subscribe(ws: WebSocket, pollId: string): void {
  let set = subscriptions.get(pollId);
  if (!set) {
    set = new Set<WebSocket>();
    subscriptions.set(pollId, set);
  }
  set.add(ws);

  // prépare le token invité pour ce socket (si jamais il vote sans userId)
  ensureGuestToken(ws);
}

export function unsubscribe(ws: WebSocket, pollId: string): void {
  const set = subscriptions.get(pollId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) subscriptions.delete(pollId);
}

export function broadcast(pollId: string, message: VotesUpdateMessage): void {
  const set = subscriptions.get(pollId);
  if (!set) return;

  const payload = JSON.stringify(message);
  for (const client of set) {
    try {
      client.send(payload);
    } catch {
      // ignore
    }
  }
}

export function sendError(ws: WebSocket, exception: APIException): void {
  const ack: VoteAckMessage = {
    type: "vote_ack",
    pollId: "",       // on ne sait pas toujours
    optionId: "",
    success: false,
    error: { code: exception.code, message: exception.message },
  };
  try {
    ws.send(JSON.stringify(ack));
  } catch {
    // ignore
  }
}

/**
 * Traite un message vote_cast :
 * - enregistre en DB
 * - envoie vote_ack au WS émetteur
 * - broadcast votes_update à tous les clients abonnés à ce poll
 */
export function handleVoteMessage(
  db: DatabaseSync,
  ws: WebSocket,
  msg: VoteCastMessage,
): void {
  try {
    // sécurité simple
    if (!msg.pollId || !msg.optionId) {
      throw new APIException(ApiErrorCode.BAD_REQUEST, 400, "Missing pollId/optionId");
    }

    // vote + nouveau compteur
    let voteCount: number;

    if (msg.userId) {
      // user authentifié
      voteCount = castVoteWithUser(db, msg.pollId, msg.optionId, msg.userId);
    } else {
      // invité
      const guestToken = ensureGuestToken(ws);
      voteCount = castVoteGuest(db, msg.pollId, msg.optionId, guestToken);
    }

    // ack succès
    const ack: VoteAckMessage = {
      type: "vote_ack",
      pollId: msg.pollId,
      optionId: msg.optionId,
      success: true,
    };
    ws.send(JSON.stringify(ack));

    // broadcast update
    broadcast(msg.pollId, {
      type: "votes_update",
      pollId: msg.pollId,
      optionId: msg.optionId,
      voteCount,
    });
  } catch (err) {
    if (err instanceof APIException) {
      const ack: VoteAckMessage = {
        type: "vote_ack",
        pollId: msg.pollId ?? "",
        optionId: msg.optionId ?? "",
        success: false,
        error: { code: err.code, message: err.message },
      };
      try {
        ws.send(JSON.stringify(ack));
      } catch {
        // ignore
      }
      return;
    }

    console.error(err);
    const ack: VoteAckMessage = {
      type: "vote_ack",
      pollId: msg.pollId ?? "",
      optionId: msg.optionId ?? "",
      success: false,
      error: { code: ApiErrorCode.SERVER_ERROR, message: "Unexpected server error" },
    };
    try {
      ws.send(JSON.stringify(ack));
    } catch {
      // ignore
    }
  }
}

// Petite extraction (car castVote() plus haut throw si guest)
function castVoteWithUser(
  db: DatabaseSync,
  pollId: string,
  optionId: string,
  userId: string,
): number {
  const voteId = crypto.randomUUID();
  try {
    db.prepare(
      `INSERT INTO votes (id, poll_id, option_id, user_id, guest_token)
       VALUES (?, ?, ?, ?, NULL);`,
    ).run(voteId, pollId, optionId, userId);
  } catch (err) {
    console.error(err);
    throw new APIException(ApiErrorCode.CONFLICT, 409, "Vote already exists or constraint violation");
  }

  const row = db.prepare(`SELECT COUNT(*) AS c FROM votes WHERE option_id = ?;`)
    .get(optionId) as Record<string, unknown> | undefined;

  return Number(row?.c ?? 0);
}
