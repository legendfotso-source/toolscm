import "server-only";

import { adminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { TIERS, type TierId } from "@/lib/payments/tiers";
import { usageHashSalt } from "@/lib/supabase/config";
import { dailyFingerprint, stableFingerprint, utcDay } from "./hash";

export type UsageVerdict = {
  allowed: boolean;
  /** Operations used today on this device. */
  used: number;
  /** Remaining today; -1 means no limit applies. */
  remaining: number;
  /** Why it was allowed — useful for the interface and for support. */
  reason: "unlimited" | "within_limit" | "limit_reached" | "network_abuse" | "disabled";
};

const UNLIMITED: UsageVerdict = {
  allowed: true,
  used: 0,
  remaining: -1,
  reason: "disabled",
};

/**
 * Turn the request's network information into an opaque, salted hash.
 *
 * The raw IP address is never stored, never logged, and never leaves this
 * function. What lands in the database is a one-way digest that we cannot turn
 * back into an address, and that changes whenever the salt is rotated.
 */
export function networkFingerprint(headers: Headers): string {
  const { ip, agent } = identify(headers);
  return stableFingerprint(usageHashSalt(), ip, agent);
}

/**
 * The same idea, but deliberately forgetful.
 *
 * `networkFingerprint` is stable so a daily allowance can be counted against
 * it. This one mixes the DATE into the hash, so the same visitor produces a
 * different value tomorrow. That is what lets the admin see "212 people came
 * today" without the database ever being able to answer "and what did this
 * one do last week".
 *
 * It costs us something real — there is no way to compute returning visitors —
 * and that is the trade being made on purpose. A site whose promise is that
 * files never leave the device should not keep a record that follows the
 * person holding it.
 */
export function dailyVisitorHash(headers: Headers, day: string = utcDay()): string {
  const { ip, agent } = identify(headers);
  return dailyFingerprint(usageHashSalt(), day, ip, agent);
}

/**
 * Pull the network identity out of a request.
 *
 * This is the only place a raw IP address is read, and it goes straight into a
 * hash without being returned, stored or logged anywhere else.
 */
function identify(headers: Headers): { ip: string; agent: string } {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  return {
    ip: forwarded.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown",
    agent: headers.get("user-agent") ?? "",
  };
}

/**
 * Decide whether one more free operation is allowed, and count it.
 *
 * Called from a route handler with the service role key. The browser is never
 * trusted for any part of this: not the count, not the Pro status, not the
 * limit itself.
 */
export async function consumeOperation({
  deviceId,
  tool,
  headers,
  tier,
}: {
  deviceId: string;
  tool: string;
  headers: Headers;
  tier: TierId;
}): Promise<UsageVerdict> {
  const client = adminClient();
  if (!client) return UNLIMITED;

  const settings = await getSettings();
  if (!settings.limits_enabled) return UNLIMITED;

  // The tier decides the allowance, and -1 means there is none. Reading it
  // from the tier table rather than from `isPro` is what lets Max exist
  // without a second branch here.
  const allowance = TIERS[tier].dailyOperations;
  if (allowance < 0) return { ...UNLIMITED, reason: "unlimited" };

  // The loose network ceiling is checked first and separately. It is set high
  // enough that a shared mobile gateway never trips it in normal use — it is
  // there to stop a script, not a person.
  const network = await client.rpc("consume_operation", {
    p_subject_type: "network",
    p_subject: networkFingerprint(headers),
    p_tool: tool,
    p_limit: settings.network_daily_limit,
  });

  if (!network.error) {
    const row = firstRow(network.data);
    if (row && row.allowed === false) {
      return { allowed: false, used: row.used, remaining: 0, reason: "network_abuse" };
    }
  }

  const device = await client.rpc("consume_operation", {
    p_subject_type: "device",
    p_subject: deviceId,
    p_tool: tool,
    // The admin setting is the FREE allowance; a paid tier with a finite
    // allowance would use its own. Today only free is finite.
    p_limit: tier === "free" ? settings.free_daily_limit : allowance,
  });

  if (device.error) {
    // If the counter itself is broken, let the person use the tool. A free
    // utility that refuses to work because of our database problem is worse
    // than one that occasionally gives away an extra operation.
    console.error("[Tools.cm] usage check failed:", device.error.message);
    return UNLIMITED;
  }

  const row = firstRow(device.data);
  if (!row) return UNLIMITED;

  return {
    allowed: row.allowed,
    used: row.used,
    remaining: row.remaining,
    reason: row.allowed ? "within_limit" : "limit_reached",
  };
}

/** Read today's usage without consuming anything. */
export async function peekUsage(deviceId: string, tier: TierId): Promise<UsageVerdict> {
  const client = adminClient();
  if (!client) return UNLIMITED;

  const settings = await getSettings();
  if (!settings.limits_enabled) return UNLIMITED;

  const allowance =
    TIERS[tier].dailyOperations < 0
      ? -1
      : tier === "free"
        ? settings.free_daily_limit
        : TIERS[tier].dailyOperations;
  if (allowance < 0) return { ...UNLIMITED, reason: "unlimited" };

  const { data, error } = await client.rpc("peek_usage", {
    p_subject_type: "device",
    p_subject: deviceId,
  });

  if (error) return UNLIMITED;

  const used = typeof data === "number" ? data : 0;
  return {
    allowed: used < allowance,
    used,
    remaining: Math.max(allowance - used, 0),
    reason: used < allowance ? "within_limit" : "limit_reached",
  };
}

type ConsumeRow = { allowed: boolean; used: number; remaining: number };

function firstRow(data: unknown): ConsumeRow | null {
  if (Array.isArray(data) && data.length > 0) return data[0] as ConsumeRow;
  if (data && typeof data === "object") return data as ConsumeRow;
  return null;
}
