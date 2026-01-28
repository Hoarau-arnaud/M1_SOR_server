// server/utils/guards.ts
import type { SQLOutputValue } from "node:sqlite";
import type { PollRow, PollOptionRow } from "../types/db.ts";

function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isNullableString(v: unknown): v is string | null {
  return typeof v === "string" || v === null;
}
function isIntLike(v: unknown): v is number | bigint {
  return typeof v === "number" || typeof v === "bigint";
}
function isBool01(v: unknown): v is number | bigint {
  return isIntLike(v) && (v === 0 || v === 1 || v === 0n || v === 1n);
}
function isStatus(v: unknown): v is "ACTIVE" | "INACTIVE" {
  return v === "ACTIVE" || v === "INACTIVE";
}

export function isPollRow(obj: Record<string, SQLOutputValue>): obj is PollRow {
  return (
    "id" in obj && isString(obj.id) &&
    "owner_id" in obj && isString(obj.owner_id) &&
    "title" in obj && isString(obj.title) &&
    "description" in obj && isNullableString(obj.description) &&
    "status" in obj && isStatus(obj.status) &&
    "allow_guests" in obj && isBool01(obj.allow_guests) &&
    "allow_multiple" in obj && isBool01(obj.allow_multiple) &&
    "created_at" in obj && isString(obj.created_at) &&
    "expires_at" in obj && isNullableString(obj.expires_at)
  );
}

export function isPollOptionRow(obj: Record<string, SQLOutputValue>): obj is PollOptionRow {
  return (
    "id" in obj && isString(obj.id) &&
    "poll_id" in obj && isString(obj.poll_id) &&
    "text" in obj && isString(obj.text) &&
    "position" in obj && isIntLike(obj.position) &&
    "created_at" in obj && isString(obj.created_at) &&
    "vote_count" in obj && isIntLike(obj.vote_count)
  );
}
