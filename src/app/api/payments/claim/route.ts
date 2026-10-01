import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server-client";
import { claimsForUser, createClaim } from "@/lib/payments/claims";

export const dynamic = "force-dynamic";

/**
 * "I have paid — here is my reference."
 *
 * The customer's half of the manual payment flow. It records a claim and
 * grants nothing at all; an admin confirms it against the Mobile Money
 * statement and presses Approuver, and that is what grants the term.
 *
 * Note what this body does NOT contain: an amount. The price is computed on
 * the server from the tier and the plan length, by the same function the
 * pricing page uses, so a request cannot declare that Max cost 100 FCFA. What
 * the customer supplies is only what the server cannot know — which operator
 * they sent from, which number, and the transaction id from their SMS.
 */
const Body = z.object({
  tier: z.enum(["pro", "max"]).default("pro"),
  plan: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  /**
   * The Mobile Money reference. Required, and this is the whole point of the
   * row: without it there is nothing for an admin to verify, and "approve"
   * would mean "take the customer's word for it".
   */
  transactionId: z.string().trim().min(3).max(120),
  operator: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(40).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const result = await createClaim({ userId: user.id, ...parsed.data });

  if (!result.ok) {
    // 409 for both refusals a customer can actually cause, with a distinct
    // reason so the page can say which one it was. "Already sent" and
    // "somebody has used that reference" need different sentences: the first
    // means wait, the second means check what you typed.
    const status = result.reason === "write_failed" ? 500 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({ ok: true, claim: result.claim });
}

/** The caller's own claims, so the page can say where the request stands. */
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  return NextResponse.json({ claims: await claimsForUser(user.id) });
}
