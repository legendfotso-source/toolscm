import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Keeps the Supabase session cookie fresh.
 *
 * In Next.js 16 this file is called `proxy` — it is what used to be named
 * middleware. Without it, an access token that expires mid-visit would log the
 * person out on their next navigation even though their refresh token is still
 * good.
 *
 * This is deliberately NOT where authorisation happens. It refreshes a cookie
 * and nothing more; every real decision about Pro status or admin access is
 * made in a route handler against the database, where it cannot be spoofed.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // With no Supabase configured the site has no sessions to refresh.
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(items) {
        for (const { name, value } of items) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() revalidates the token with Supabase, which is what triggers the
  // refresh. getSession() would read the cookie without verifying it.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip static assets and image requests — refreshing a session for a PNG
  // would add a network round-trip to every icon on the page.
  matcher: [
    "/((?!_next/static|_next/image|pdfjs|vendor|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
