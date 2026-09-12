import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { getToolIds } from "@/lib/tools/registry";

export const dynamic = "force-dynamic";

/**
 * Product analytics, deliberately contentless.
 *
 * Without this there is no way to know which tools people actually use: the
 * usage counters only fill up when the daily limit is switched on, and the
 * whole point of leaving it off at the start is to find out what people want
 * before charging for it.
 *
 * What this endpoint will accept is tightly bounded, because an events
 * endpoint is the classic place where private data leaks in by accident:
 *
 *   - the tool id must be one that exists in the catalog;
 *   - the event must be one of three names;
 *   - the only extra facts are a duration and an error key, both validated.
 *
 * There is no free-form field. A filename cannot be sent through here even by
 * mistake, because there is nowhere to put one.
 */
const Body = z.object({
  tool: z.string().trim().max(64),
  event: z.enum(["start", "success", "error"]),
  /** Milliseconds the work took. Bounded so a broken client cannot store junk. */
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
  /** One of our own error keys — never a message, never a filename. */
  errorKey: z.string().trim().max(48).regex(/^[a-z0-9_.-]+$/i).optional(),
});

export async function POST(request: Request) {
  const client = adminClient();
  // No database configured: accept and discard, so the client never has to
  // care whether analytics exist.
  if (!client) return NextResponse.json({ ok: true });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ ok: true });
  if (!getToolIds().includes(parsed.data.tool)) return NextResponse.json({ ok: true });

  // Failures here are silent on purpose. A visitor's tool must never break, or
  // even slow down, because an analytics row could not be written.
  const { error } = await client.from("tool_events").insert({
    tool: parsed.data.tool,
    event: parsed.data.event,
    meta: {
      ...(parsed.data.durationMs !== undefined ? { durationMs: parsed.data.durationMs } : {}),
      ...(parsed.data.errorKey ? { errorKey: parsed.data.errorKey } : {}),
    },
  });

  if (error) console.error("[Tools.cm] could not record an event:", error.message);

  return NextResponse.json({ ok: true });
}
