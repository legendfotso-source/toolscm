import { NextResponse } from "next/server";

import { runScheduledWork } from "@/lib/scheduled";
import { isOwner } from "@/lib/admin";
import { bearerMatches } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * The daily run: renewal reminders, abandoned checkouts, housekeeping.
 *
 * Two ways in, and nothing else.
 *
 * **The platform**, with `Authorization: Bearer <CRON_SECRET>`. Vercel sends
 * that header on every scheduled invocation of a path listed in vercel.json.
 *
 * **The owner**, signed in, from /admin — because the first question about a
 * scheduled job is always "does it work", and the answer should not require
 * waiting until tomorrow morning to find out. The owner and not merely an
 * administrator: an administrator may READ this panel, but pressing the
 * button sends mail to customers, and who writes to customers is the owner's
 * decision. The button is owner-only in the interface, and this is the line
 * that makes that true rather than merely apparent.
 *
 * With CRON_SECRET unset this endpoint refuses EVERY unauthenticated request,
 * including the platform's. That is deliberate and it is the whole security
 * design here: the alternative — "no secret configured, so let anybody in" —
 * would publish an endpoint that sends mail to customers and writes to the
 * database, reachable by anyone who can type a URL. A scheduled job that is
 * not running is a problem the health panel reports; an open one is a problem
 * somebody else finds first.
 */

async function allowed(request: Request): Promise<boolean> {
  // The machine's way in. bearerMatches() lives in its own module because it
  // is the decision that must never fail open, and a decision like that is
  // worth being able to test without starting a server.
  if (bearerMatches(request.headers.get("authorization"), process.env.CRON_SECRET ?? "")) {
    return true;
  }

  // The owner, from the admin page. Checked second so that a scheduled
  // request never pays for a session lookup.
  return isOwner();
}

export async function GET(request: Request) {
  if (!(await allowed(request))) {
    // 404, like every other guarded path in this project: a stranger learns
    // nothing, including whether a scheduled job exists here at all.
    return new NextResponse(null, { status: 404 });
  }

  const results = await runScheduledWork();

  // Always 200 when the request was allowed, even if a job failed. A non-2xx
  // tells the platform to retry, and retrying a half-finished mail run is the
  // one way this code could send a customer the same message twice. What
  // failed is in the body, and in the admin panel.
  return NextResponse.json({ ok: results.every((result) => result.ok), results });
}

/** Vercel Cron sends GET; POST is here so the owner can trigger it from a form. */
export const POST = GET;
