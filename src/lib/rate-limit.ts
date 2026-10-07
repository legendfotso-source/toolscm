import "server-only";

import { adminClient } from "./supabase/admin";

/**
 * A rate limit that works on Vercel.
 *
 * Counted in the database, not in a module variable. That is the whole design
 * decision: a counter in memory lives in one lambda, and the next request
 * lands in another one with an empty counter — a limit that works perfectly on
 * a laptop and does nothing at all in production, which is worse than no limit
 * because somebody believes it is there.
 *
 * The table is `rate_hits`, one row per (bucket, key, minute). Counting rows
 * in a window is one indexed query; no Redis, no extra service, no third
 * dependency that can be down on the day the site is being hammered.
 *
 * Every function fails OPEN. A rate limiter that refuses traffic when its own
 * storage hiccups has turned a database wobble into an outage — and these
 * limits exist to stop abuse, not to be the thing that takes the site down.
 */

const UNDEFINED_TABLE = "42P01";

export type Limit = {
  /** What is being limited: "webhook:campay", "contact", … */
  bucket: string;
  /** Who: a hash, an IP digest, an account id. Never a raw address. */
  key: string;
  /** How many are allowed in the window. */
  max: number;
  /** How long the window is, in seconds. */
  windowSeconds: number;
};

export type Verdict = { allowed: boolean; used: number; max: number };

/**
 * Record one hit and say whether it is over the limit.
 *
 * Writes first, then counts. The other order has a race that matters at
 * exactly the moment a limit is doing its job: a hundred simultaneous requests
 * would each count ninety-nine and each conclude it was fine. Writing first
 * means every request is in the count that every other request sees.
 */
export async function hit(limit: Limit): Promise<Verdict> {
  const client = adminClient();
  if (!client || !limit.key) return { allowed: true, used: 0, max: limit.max };

  const now = Date.now();
  const since = new Date(now - limit.windowSeconds * 1000).toISOString();

  const written = await client.from("rate_hits").insert({
    bucket: limit.bucket,
    key: limit.key.slice(0, 128),
  });
  if (written.error) {
    if (written.error.code !== UNDEFINED_TABLE) {
      console.error("[Tools.cm] could not record a rate-limit hit:", written.error.message);
    }
    return { allowed: true, used: 0, max: limit.max };
  }

  const { count, error } = await client
    .from("rate_hits")
    .select("id", { count: "exact", head: true })
    .eq("bucket", limit.bucket)
    .eq("key", limit.key.slice(0, 128))
    .gte("created_at", since);

  if (error) return { allowed: true, used: 0, max: limit.max };

  const used = count ?? 0;
  return { allowed: used <= limit.max, used, max: limit.max };
}

/**
 * Throw away hits older than a day.
 *
 * Called opportunistically rather than on a schedule — there is no cron on
 * this deployment, and a table that only grows is a table that eventually
 * costs money for nothing. One in roughly fifty calls does the sweep, so the
 * cost is amortised and no single request pays for it.
 */
export async function sweepOldHits(): Promise<void> {
  if (Math.random() > 0.02) return;
  const client = adminClient();
  if (!client) return;
  const cutoff = new Date(Date.now() - 86_400_000).toISOString();
  await client.from("rate_hits").delete().lt("created_at", cutoff);
}

/**
 * The caller's network identity, as a salted digest.
 *
 * Reuses the usage fingerprint so there is one definition of "who is this
 * request from" in the codebase, and so a raw IP address still never lands
 * anywhere — not in this table either.
 */
export async function requesterKey(headers: Headers): Promise<string> {
  const { networkFingerprint } = await import("./usage/server");
  return networkFingerprint(headers);
}
