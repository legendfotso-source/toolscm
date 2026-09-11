import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { requireAdminClient } from "@/lib/supabase/admin";
import { invalidateSettingsCache } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Only these keys can be changed, and only to these shapes. An allow-list
 * rather than "write whatever JSON you send" — otherwise an admin session
 * could put a string where the code expects a number and break the limit
 * check for everyone.
 */
const Settings = z.object({
  free_daily_limit: z.number().int().min(0).max(1000).optional(),
  network_daily_limit: z.number().int().min(0).max(100_000).optional(),
  price_xaf: z.number().int().min(0).max(1_000_000).optional(),
  price_usd: z.number().int().min(0).max(10_000).optional(),
  payments_enabled: z.boolean().optional(),
  limits_enabled: z.boolean().optional(),
  ads_enabled: z.boolean().optional(),
  maintenance_mode: z.boolean().optional(),
});

export async function POST(request: Request) {
  // Checked here, on the server, against the database — not from any header
  // or flag the browser sent.
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = Settings.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const client = requireAdminClient();
  const { error } = await client.from("admin_settings").upsert(
    entries.map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "key" },
  );

  if (error) {
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  invalidateSettingsCache();
  return NextResponse.json({ ok: true });
}
