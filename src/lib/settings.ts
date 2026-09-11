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
const TTL_MS = 60_000;
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

export function invalidateSettingsCache(): void {
  cache = null;
}
