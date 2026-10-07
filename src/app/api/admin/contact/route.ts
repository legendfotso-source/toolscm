import { NextResponse } from "next/server";
import { z } from "zod";

import { currentRole } from "@/lib/admin";
import { currentUser } from "@/lib/supabase/server-client";
import { adminClient } from "@/lib/supabase/admin";
import { record } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * The contact inbox.
 *
 * Reading messages is not logged. An audit trail of every page somebody looked
 * at is an audit trail nobody reads, and it would bury the entries that
 * matter — the decisions. Changing a message's state IS logged, because that
 * is a decision about a customer.
 */

const Change = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "read", "replied", "closed"]),
});

export async function GET(request: Request) {
  if ((await currentRole()) === "user") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const client = adminClient();
  if (!client) return NextResponse.json({ messages: [] });

  const wanted = new URL(request.url).searchParams.get("status") ?? "";
  let query = client
    .from("contact_messages")
    .select("id, name, email, subject, message, status, emailed, email_error, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (["new", "read", "replied", "closed"].includes(wanted)) {
    query = query.eq("status", wanted);
  }

  const { data, error } = await query;
  if (error) {
    // An empty inbox and a missing table look the same to the page, which is
    // right: both mean "nothing to show", and the health panel is where a
    // missing table is reported.
    console.error("[Tools.cm] could not read the contact inbox:", error.message);
    return NextResponse.json({ messages: [] });
  }
  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(request: Request) {
  const role = await currentRole();
  if (role === "user") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let parsed;
  try {
    parsed = Change.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const client = adminClient();
  if (!client) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const user = await currentUser();
  const { error } = await client
    .from("contact_messages")
    .update({
      status: parsed.data.status,
      handled_at: new Date().toISOString(),
      handled_by: user?.id ?? null,
    })
    .eq("id", parsed.data.id);

  if (error) {
    console.error("[Tools.cm] could not update a contact message:", error.message);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }

  await record({
    action: "contact.status",
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    actorRole: role,
    metadata: { messageId: parsed.data.id, status: parsed.data.status },
  });

  return NextResponse.json({ ok: true });
}
