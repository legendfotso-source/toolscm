"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

/**
 * The browser client. Carries only the anon key, so every query it makes is
 * subject to row level security — a user can reach their own profile and
 * subscription and nothing else.
 */
let cached: SupabaseClient | null = null;

export function browserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  cached ??= createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cached;
}
