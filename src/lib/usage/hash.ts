import { createHash } from "node:crypto";

/**
 * The two fingerprints this project computes, as plain functions.
 *
 * They take the salt as an argument rather than reading it from the
 * environment. That is not ceremony: it makes them importable on their own,
 * with no database client and no server-only guard dragged along, which is the
 * difference between a property that is asserted in a comment and one that is
 * proven by a test. `tests/run-config-tests.mjs` compiles this file by itself.
 *
 * Neither function is reversible and neither ever receives — or returns — a
 * raw IP address to anything that stores one.
 */

/**
 * Stable across days. Used for the anti-abuse ceiling, which has to recognise
 * the same network tomorrow to be worth anything.
 */
export function stableFingerprint(salt: string, ip: string, agent: string): string {
  return digest(`${salt}|${ip}|${agent}`);
}

/**
 * Deliberately forgetful: the day is mixed in, so the same visitor is a
 * different value tomorrow.
 *
 * This is what makes "how many people came today" answerable while "what has
 * this person been doing all week" stays unanswerable — not by policy, not by
 * access control, but because the data required to answer it was never
 * written down.
 */
export function dailyFingerprint(
  salt: string,
  day: string,
  ip: string,
  agent: string,
): string {
  return digest(`${salt}|${day}|${ip}|${agent}`);
}

/** Today in UTC, matching the `day` column's default in the database. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function digest(input: string): string {
  return createHash("sha256").update(input).digest("base64url").slice(0, 32);
}
