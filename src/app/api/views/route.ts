import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { dailyVisitorHash } from "@/lib/usage/server";

export const dynamic = "force-dynamic";

/**
 * Counting visits, without identifying visitors.
 *
 * The admin's question — "is anybody coming, and to which pages?" — is a fair
 * one, and it is answerable without knowing who anyone is. This endpoint is
 * built so that it *cannot* answer the other question:
 *
 *   - the browser sends one thing, a path. Nothing else it says is believed;
 *   - the country, device and referring site are read from the REQUEST on the
 *     server, so a forged payload cannot poison the figures;
 *   - the visitor hash includes today's date, so the same person is a
 *     different value tomorrow and no history can be assembled;
 *   - the raw IP address is never stored and never logged.
 *
 * Everything here fails quietly. A visit that cannot be counted is a number
 * the admin does not get; it must never be an error a visitor sees.
 */
const Body = z.object({
  /**
   * A path on this site. Query strings are stripped rather than rejected:
   * they are where personal data ends up by accident (an email in a share
   * link, a search term), and none of them are worth keeping.
   */
  path: z.string().trim().min(1).max(512),
});

/** Paths that are ours, spelled the way our own routes are spelled. */
const SAFE_PATH = /^\/[A-Za-z0-9\-._~/]*$/;

export async function POST(request: Request) {
  const client = adminClient();
  // No database configured: accept and discard, exactly like /api/events, so
  // the browser never has to know whether analytics exist.
  if (!client) return NextResponse.json({ ok: true });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ ok: true });

  const path = normalisePath(parsed.data.path);
  if (!path) return NextResponse.json({ ok: true });

  const headers = request.headers;

  const { error } = await client.rpc("record_page_view", {
    p_path: path,
    p_visitor: dailyVisitorHash(headers),
    p_country: country(headers),
    p_device: device(headers),
    p_referrer: referrerHost(headers),
  });

  if (error) console.error("[Tools.cm] could not record a view:", error.message);

  return NextResponse.json({ ok: true });
}

/**
 * Reduce whatever arrived to a path we are willing to store, or nothing.
 *
 * Anything with a query string loses it. Anything that does not look like one
 * of our own routes is dropped entirely rather than stored as a curiosity —
 * an analytics table is not the place to find out what strangers are probing.
 */
function normalisePath(raw: string): string | null {
  const withoutQuery = raw.split(/[?#]/)[0];
  if (!withoutQuery.startsWith("/")) return null;
  if (!SAFE_PATH.test(withoutQuery)) return null;

  // Trailing slash on anything but the root, so "/pricing" and "/pricing/"
  // are one line in the report rather than two.
  const trimmed = withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") : "/";
  return trimmed.slice(0, 128) || "/";
}

/** Two-letter country from the hosting layer, or nothing. Never a city. */
function country(headers: Headers): string | null {
  const value = headers.get("x-vercel-ip-country") ?? "";
  return /^[A-Za-z]{2}$/.test(value) ? value.toUpperCase() : null;
}

/**
 * Phone or computer, and nothing finer.
 *
 * The whole product is built for a cheap Android phone on a slow connection.
 * Knowing that split turns "the tools feel slow" from an argument into a
 * measurement. A full user-agent string would say far more than that, so it
 * is reduced to one of two words here and the original is never stored.
 */
function device(headers: Headers): string {
  const agent = headers.get("user-agent") ?? "";
  return /Mobi|Android|iPhone|iPad|iPod/i.test(agent) ? "mobile" : "desktop";
}

/**
 * Which site linked here — the host only.
 *
 * A full referring URL from a search engine can carry the words somebody
 * typed. The host answers the question worth asking ("is this WhatsApp or
 * Google?") and carries none of that.
 */
function referrerHost(headers: Headers): string | null {
  const raw = headers.get("referer") ?? "";
  if (!raw) return null;

  try {
    const { hostname } = new URL(raw);
    if (!hostname) return null;

    // Our own pages linking to each other are not a traffic source. The Host
    // header can carry a port; the referrer's hostname never does.
    const self = (headers.get("host") ?? "").split(":")[0];
    if (hostname === self) return null;

    return hostname.slice(0, 80);
  } catch {
    return null;
  }
}
