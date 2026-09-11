import "server-only";

import { createHash } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { usageHashSalt } from "@/lib/supabase/config";

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
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  const agent = headers.get("user-agent") ?? "";

  return createHash("sha256")
    .update(`${usageHashSalt()}|${ip}|${agent}`)
    .digest("base64url")
    .slice(0, 32);
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
  isPro,
}: {
  deviceId: string;
  tool: string;
  headers: Headers;
  isPro: boolean;
}): Promise<UsageVerdict> {
  const client = adminClient();
  if (!client) return UNLIMITED;

  const settings = await getSettings();
  if (!settings.limits_enabled) return UNLIMITED;
  if (isPro) return { ...UNLIMITED, reason: "unlimited" };

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
    p_limit: settings.free_daily_limit,
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
export async function peekUsage(deviceId: string, isPro: boolean): Promise<UsageVerdict> {
  const client = adminClient();
  if (!client) return UNLIMITED;

  const settings = await getSettings();
  if (!settings.limits_enabled) return UNLIMITED;
  if (isPro) return { ...UNLIMITED, reason: "unlimited" };

  const { data, error } = await client.rpc("peek_usage", {
    p_subject_type: "device",
    p_subject: deviceId,
  });

  if (error) return UNLIMITED;

  const used = typeof data === "number" ? data : 0;
  return {
    allowed: used < settings.free_daily_limit,
    used,
    remaining: Math.max(settings.free_daily_limit - used, 0),
    reason: used < settings.free_daily_limit ? "within_limit" : "limit_reached",
  };
}

type ConsumeRow = { allowed: boolean; used: number; remaining: number };

function firstRow(data: unknown): ConsumeRow | null {
  if (Array.isArray(data) && data.length > 0) return data[0] as ConsumeRow;
  if (data && typeof data === "object") return data as ConsumeRow;
  return null;
}
