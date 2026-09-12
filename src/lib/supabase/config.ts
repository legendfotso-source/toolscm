/**
 * Supabase is optional.
 *
 * With no environment variables set, the site behaves exactly as it does
 * today: every tool free, no limits, no accounts, no paywall. That is not a
 * fallback bolted on afterwards — it is the point. The business layer can be
 * switched on by adding keys, and switched off again by removing them, without
 * touching code or breaking a single tool.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True when the browser has enough configuration to talk to Supabase. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Server-only. Never import this into a client component: the service role key
 * bypasses row level security entirely, and a single accidental import into
 * client code would ship it to every visitor.
 */
export function serviceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (key && typeof window !== "undefined") {
    throw new Error("The service role key must never be read in the browser.");
  }
  return key;
}

export function isServerConfigured(): boolean {
  return Boolean(SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Salt for the network fingerprint. Without it we fall back to a build-local
 * constant, which still avoids storing raw IP addresses but is weaker — set
 * USAGE_HASH_SALT in production.
 */
export function usageHashSalt(): string {
  // Trimmed and checked rather than `??`: an empty USAGE_HASH_SALT would
  // otherwise salt every fingerprint with nothing at all, which is weaker than
  // the fallback it was meant to replace.
  const configured = process.env.USAGE_HASH_SALT?.trim();
  return configured || "toolscm-default-salt-change-me";
}
