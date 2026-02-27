// server/types/ws.ts
import type { ApiError } from "./api.ts";

export interface VoteCastMessage {
  type: "vote_cast";
  pollId: string;
  optionId: string;
  userId?: string;
}

export interface VoteAckMessage {
  type: "vote_ack";
  pollId: string;
  optionId: string;
  success: boolean;
  error?: ApiError;
}

export interface VotesUpdateMessage {
  type: "votes_update";
  pollId: string;
  optionId: string;
  voteCount: number;
}

export type WsMessage = VoteCastMessage | VoteAckMessage | VotesUpdateMessage;
