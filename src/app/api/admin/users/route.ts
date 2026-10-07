import { NextResponse } from "next/server";
import { z } from "zod";

import { currentRole } from "@/lib/admin";
import { currentUser } from "@/lib/supabase/server-client";
import { findUsers } from "@/lib/admin-users";
import {
  addNote,
  grantAccess,
  revokeGrant,
  setAdmin,
  setStatus,
  type Actor,
} from "@/lib/admin-actions";

export const dynamic = "force-dynamic";

/**
 * Searching accounts, and acting on one.
 *
 * 404 rather than 403 throughout, matching every other admin route here: a
 * stranger learns nothing about whether this endpoint exists.
 *
 * The role is read once per request and passed down. Every action module then
 * receives the actor rather than working it out for itself — a module that
 * finds its own caller is a module that can be called from somewhere that has
 * not checked.
 */

const Search = z.object({
  query: z.string().max(200).optional(),
  status: z.enum(["all", "active", "suspended", "blocked", "deactivated"]).optional(),
  tier: z.enum(["all", "paying", "free", "pro", "max", "owner"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const Action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    userId: z.string().uuid(),
    status: z.enum(["active", "suspended", "blocked", "deactivated"]),
    reason: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("grant"),
    userId: z.string().uuid(),
    tier: z.enum(["pro", "max", "unlimited"]),
    kind: z.enum(["admin", "promotional", "trial", "compensation", "staff"]).optional(),
    // Accepted as a date string or left out entirely. Absent means for ever,
    // which is a different thing from "today", and a form that cannot express
    // "for ever" forces somebody to type a date in 2099.
    expiresAt: z.string().datetime().nullable().optional(),
    reason: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("revoke"),
    grantId: z.string().uuid(),
    reason: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("note"),
    userId: z.string().uuid(),
    body: z.string().min(1).max(4000),
  }),
  z.object({
    action: z.literal("admin"),
    userId: z.string().uuid(),
    makeAdmin: z.boolean(),
    reason: z.string().max(500).optional(),
  }),
]);

export async function GET(request: Request) {
  if ((await currentRole()) === "user") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = Search.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const page = await findUsers(parsed.data);
  return NextResponse.json(page);
}

export async function POST(request: Request) {
  const role = await currentRole();
  if (role === "user") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let parsed;
  try {
    parsed = Action.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const user = await currentUser();
  const actor: Actor = { id: user?.id ?? null, email: user?.email ?? null, role };
  const input = parsed.data;

  const result =
    input.action === "status"
      ? await setStatus(input.userId, input.status, actor, input.reason)
      : input.action === "grant"
        ? await grantAccess(
            input.userId,
            {
              tier: input.tier,
              kind: input.kind,
              expiresAt: input.expiresAt ?? null,
              reason: input.reason,
            },
            actor,
          )
        : input.action === "revoke"
          ? await revokeGrant(input.grantId, actor, input.reason)
          : input.action === "note"
            ? await addNote(input.userId, input.body, actor)
            : await setAdmin(input.userId, input.makeAdmin, actor, input.reason);

  if (!result.ok) {
    const status =
      result.reason === "not_found" ? 404 : result.reason === "forbidden" ? 403 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ ok: true });
}
