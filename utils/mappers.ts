// server/utils/mappers.ts
import type { PollRow, PollOptionRow } from "../types/db.ts";
import type { Poll, PollOption } from "../types/domain.ts";

function intLikeToNumber(v: number | bigint): number {
  return typeof v === "bigint" ? Number(v) : v;
}
function bool01ToBoolean(v: number | bigint): boolean {
  return v === 1 || v === 1n;
}

export function pollOptionRowToApi(row: PollOptionRow): PollOption {
  return {
    id: row.id,
    pollId: row.poll_id,
    text: row.text,
    position: intLikeToNumber(row.position),
    createdAt: row.created_at,
    voteCount: intLikeToNumber(row.vote_count),
  };
}

export function pollRowToApi(row: PollRow, optionRows: PollOptionRow[]): Poll {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description,
    status: row.status,
    allowGuests: bool01ToBoolean(row.allow_guests),
    allowMultiple: bool01ToBoolean(row.allow_multiple),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    options: optionRows.map(pollOptionRowToApi),
  };
}
