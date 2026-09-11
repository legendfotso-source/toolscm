import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server-client";

/**
 * Where Supabase sends people back after a Google sign-in or an email
 * confirmation link. Exchanges the one-time code for a session cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/account";

  if (!code) {
    return NextResponse.redirect(new URL("/signin?error=missing_code", url.origin));
  }

  const client = await serverClient();
  if (!client) {
    return NextResponse.redirect(new URL("/signin?error=not_configured", url.origin));
  }

  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/signin?error=exchange_failed", url.origin));
  }

  // Only ever redirect to a path on this site: an open redirect here would let
  // someone craft a link that lands on their own page carrying our origin.
  const destination = next.startsWith("/") ? next : "/account";
  return NextResponse.redirect(new URL(destination, url.origin));
}
