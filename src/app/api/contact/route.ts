import { NextResponse } from "next/server";
import { z } from "zod";

import { submitContact } from "@/lib/contact";
import { looksLikeEmail } from "@/lib/email/address";
import { networkFingerprint } from "@/lib/usage/server";
import { currentUser } from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";

/**
 * The contact form's only entry point.
 *
 * The browser has no privilege on `contact_messages` in either direction —
 * 0005 grants it nothing — so this route is the only way a row gets written.
 * That is the lesson of 0004 restated: a direct INSERT grant is a second door,
 * and the validation, the rate limit and the spam check all live here.
 *
 * The recipient is NOT taken from the request. It comes from CONTACT_TO_EMAIL
 * on the server, because an endpoint that emails wherever the body says is an
 * open relay with a nice form on it.
 */

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().min(3).max(320),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(10).max(5000),
  /**
   * The honeypot. A field no person can see and no person fills in; a bot
   * filling every input it finds fills this one too.
   *
   * Anything in it means the submission is discarded — and the response is the
   * same success a real visitor gets. Telling a bot it was caught only teaches
   * whoever wrote it which field to skip next time.
   */
  website: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = Body.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const input = parsed.data;

  if (input.website && input.website.trim().length > 0) {
    return NextResponse.json({ ok: true, emailed: true });
  }

  if (!looksLikeEmail(input.email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // Attached when the sender happens to be signed in, so the admin inbox can
  // link a message to an account. Never required: most people writing in have
  // not signed up, and demanding an account to ask a question is how you stop
  // hearing from customers.
  const user = await currentUser().catch(() => null);

  const result = await submitContact({
    ...input,
    senderHash: networkFingerprint(request.headers),
    userId: user?.id ?? null,
  });

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }

  // `emailed` is reported honestly. The message is saved either way, and the
  // page uses this to say "we have it" rather than "it has been emailed" when
  // the notification did not go out — a confirmation that claims more than
  // happened is the one thing a contact form must never do.
  return NextResponse.json({ ok: true, emailed: result.emailed });
}
