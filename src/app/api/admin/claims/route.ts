import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { currentUser } from "@/lib/supabase/server-client";
import { approveClaim, listClaims, rejectClaim } from "@/lib/payments/claims";

export const dynamic = "force-dynamic";

/**
 * The approval queue, from the admin's side.
 *
 * `notFound` rather than `forbidden` for a caller who is not an admin, the
 * same as /admin itself: a stranger should not even learn that this endpoint
 * exists.
 *
 * Approving goes through `approveClaim`, which goes through `grantPro`, which
 * is idempotent on (provider, transaction_id). So two admins pressing
 * Approuver on the same claim at the same moment grant one month between
 * them, not two.
 */
const Decide = z.object({
  action: z.enum(["approve", "reject"]),
  claimId: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const status = new URL(request.url).searchParams.get("status");
  const wanted =
    status === "approved" || status === "rejected" ? status : ("pending" as const);

  return NextResponse.json({ claims: await listClaims(wanted) });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Who decided. Recorded on the row so a disputed activation can be traced
  // to a person rather than to "the admin screen".
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = Decide.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result =
    parsed.data.action === "approve"
      ? await approveClaim(parsed.data.claimId, user.id, parsed.data.note)
      : await rejectClaim(parsed.data.claimId, user.id, parsed.data.note);

  if (!result.ok) {
    // 409 for "somebody already dealt with it", which is a race rather than a
    // mistake and needs a different sentence from a real failure.
    const status = result.reason === "grant_failed" ? 500 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json(result);
}
