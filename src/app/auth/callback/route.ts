import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server-client";
import { safeNext } from "@/lib/auth/access";

/**
 * Where Supabase sends people back after a Google sign-in or an email
 * confirmation link. Exchanges the one-time code for a session cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

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
  // A bare startsWith("/") used to be the check here, and "//evil.example"
  // passed it; safeNext refuses that and its variants.
  return NextResponse.redirect(new URL(next, url.origin));
}
