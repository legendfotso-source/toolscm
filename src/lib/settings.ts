import "server-only";

import { adminClient } from "./supabase/admin";

/**
 * Settings the admin can change without a deployment.
 *
 * Both switches default to OFF. Adding Supabase keys to a deployment must not,
 * on its own, start turning people away at a limit they were never told about
 * — someone has to decide to enable it.
 */
export type AdminSettings = {
  free_daily_limit: number;
  network_daily_limit: number;
  price_xaf: number;
  price_usd: number;
  payments_enabled: boolean;
  limits_enabled: boolean;
  ads_enabled: boolean;
  maintenance_mode: boolean;
};

export const DEFAULT_SETTINGS: AdminSettings = {
  free_daily_limit: 3,
  network_daily_limit: 60,
  price_xaf: 2000,
  price_usd: 5,
  payments_enabled: false,
  limits_enabled: false,
  ads_enabled: false,
  maintenance_mode: false,
};

// A short cache: settings change rarely, and every tool run would otherwise
// cost a round-trip to the database before any work could start.
//
// Twelve seconds, not sixty. The cache lives in ONE lambda, and
// `invalidateSettingsCache()` clears it only in the instance that handled the
// POST — so every other warm instance keeps serving the old value until its
// own copy expires. That made a price change, or switching payments on, take
// effect at different moments on different instances: for up to a minute, one
// customer could be quoted the old price while another was quoted the new one.
//
// The honest fix is to make the window short enough not to matter rather than
// to pretend the invalidation is global. Twelve seconds costs five database
// reads a minute per warm instance — nothing — and bounds the disagreement to
// about the time it takes to notice a price looked wrong and reload.
const TTL_MS = 12_000;
let cache: { at: number; value: AdminSettings } | null = null;

export async function getSettings(): Promise<AdminSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const client = adminClient();
  if (!client) return DEFAULT_SETTINGS;

  const { data, error } = await client.from("admin_settings").select("key, value");
  if (error || !data) {
    // A database hiccup must not lock everyone out of a free tool. Falling back
    // to the defaults means limits stay off, which fails open — the right way
    // round for a utility people rely on.
    console.error("[Tools.cm] could not read admin settings:", error?.message);
    return DEFAULT_SETTINGS;
  }

  const merged = { ...DEFAULT_SETTINGS };
  for (const row of data as { key: string; value: unknown }[]) {
    if (!(row.key in merged)) continue;
    const current = merged[row.key as keyof AdminSettings];
    if (typeof current === "number" && typeof row.value === "number") {
      (merged as Record<string, unknown>)[row.key] = row.value;
    } else if (typeof current === "boolean" && typeof row.value === "boolean") {
      (merged as Record<string, unknown>)[row.key] = row.value;
    }
  }

  cache = { at: Date.now(), value: merged };
  return merged;
}

/**
 * Clear this instance's copy.
 *
 * THIS INSTANCE'S. The name has always promised more than it delivers: on
 * Vercel there is no way for one function invocation to reach into another's
 * memory, so this clears exactly one cache and the others expire on their own.
 * It is still worth calling — the administrator who just saved a setting is
 * usually the next person to load a page, and it is their instance that is
 * warm — but the TTL above is what actually bounds the disagreement.
 */
export function invalidateSettingsCache(): void {
  cache = null;
}
