// server/types/db.ts
import type { SQLOutputValue } from "node:sqlite";

export type IntLike = number | bigint;

/**
 * Ligne "polls" renvoyée par un SELECT (snake_case)
 * IMPORTANT: index signature exigée par l'énoncé.
 */
export interface PollRow {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  allow_guests: IntLike;   // 0/1
  allow_multiple: IntLike; // 0/1
  created_at: string;      // TEXT datetime
  expires_at: string | null;

  [key: string]: SQLOutputValue;
}

/**
 * Ligne d'option + vote_count (calculé)
 */
export interface PollOptionRow {
  id: string;
  poll_id: string;
  text: string;
  position: IntLike;
  created_at: string;
  vote_count: IntLike; // COUNT(*)

  [key: string]: SQLOutputValue;
}
