import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, isServerConfigured, serviceRoleKey } from "./config";

/**
 * The service-role client. Bypasses row level security, so it exists only
 * here, behind `server-only`, and is used exclusively by route handlers and
 * webhook receivers.
 *
 * Everything the browser is allowed to know comes through the anon client and
 * the RLS policies in the migration — never through this.
 */
let cached: SupabaseClient | null = null;

export function adminClient(): SupabaseClient | null {
  if (!isServerConfigured()) return null;
  cached ??= createClient(SUPABASE_URL, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "toolscm-server" } },
  });
  return cached;
}

/** Throws rather than silently doing nothing, for paths that require a database. */
export function requireAdminClient(): SupabaseClient {
  const client = adminClient();
  if (!client) {
    throw new Error(
      "Supabase is not configured on the server (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  return client;
}
