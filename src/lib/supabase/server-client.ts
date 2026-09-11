import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

/**
 * The request-scoped client, running as the signed-in user (or as anon).
 *
 * Row level security applies to everything it does, which is the point: even
 * if this code had a bug, a user could only ever reach their own rows.
 *
 * `cookies()` is async in this version of Next.js.
 */
export async function serverClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;

  const store = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(items) {
        try {
          for (const { name, value, options } of items) {
            store.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Session refresh is handled in the proxy instead.
        }
      },
    },
  });
}

/** The signed-in user for this request, or null. */
export async function currentUser() {
  const client = await serverClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data.user;
}
