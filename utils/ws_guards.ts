// server/utils/ws_guards.ts

import type { VoteCastMessage } from "../types/ws.ts";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isVoteCastMessage(v: unknown): v is VoteCastMessage {
  if (!isRecord(v)) return false;

  return (
    v.type === "vote_cast" &&
    typeof v.pollId === "string" &&
    typeof v.optionId === "string" &&
    (v.userId === undefined || typeof v.userId === "string")
  );
}
