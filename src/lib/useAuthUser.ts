"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type AuthUser = {
  id: string;
  email: string;
  /** "google", "email", or whatever else was used. Shown so a person can tell. */
  provider: string;
  /** Google gives us one; email signups do not. */
  avatarUrl: string | null;
  name: string | null;
};

export type AuthState = {
  user: AuthUser | null;
  /** False until Supabase has answered once. Nothing should flash before then. */
  known: boolean;
};

/**
 * Who is signed in, in the browser.
 *
 * The header needs this and the header is on every page, so it has to be cheap
 * and it has to be quiet: while `known` is false the caller renders nothing at
 * all rather than guessing. A "Se connecter" button that appears for half a
 * second on every page load for a signed-in person reads as a bug, and a
 * signed-out person briefly seeing their own avatar would be worse.
 *
 * It subscribes to auth changes, so signing in or out updates the header
 * without a reload — including after the Google round trip, which returns to
 * the site through /auth/callback.
 */
export function useAuthUser(): AuthState {
  const configured = isSupabaseConfigured();
  const [state, setState] = useState<AuthState>({ user: null, known: !configured });

  useEffect(() => {
    if (!configured) return;
    const client = browserClient();
    if (!client) return;

    let cancelled = false;

    void client.auth.getUser().then(({ data }) => {
      if (!cancelled) setState({ user: toAuthUser(data.user), known: true });
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setState({ user: toAuthUser(session?.user ?? null), known: true });
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [configured]);

  return state;
}

type SupabaseUserLike = {
  id: string;
  email?: string | null;
  app_metadata?: { provider?: string | null } | null;
  user_metadata?: Record<string, unknown> | null;
} | null;

function toAuthUser(user: SupabaseUserLike): AuthUser | null {
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  const avatar = meta.avatar_url ?? meta.picture;
  const name = meta.full_name ?? meta.name;

  return {
    id: user.id,
    email: user.email ?? "",
    provider: user.app_metadata?.provider ?? "email",
    avatarUrl: typeof avatar === "string" && avatar ? avatar : null,
    name: typeof name === "string" && name ? name : null,
  };
}

/** The letter shown in the circle when there is no picture. */
export function initialFor(user: AuthUser): string {
  const source = user.name || user.email || "?";
  return source.trim().charAt(0).toUpperCase() || "?";
}
