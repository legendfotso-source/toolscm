import "server-only";

import { adminClient } from "./supabase/admin";
import { currentUser } from "./supabase/server-client";

/**
 * Is the caller an administrator?
 *
 * Read from the `is_admin` column, which only the service role can write —
 * there is no way to grant yourself admin from the browser, because the
 * browser has no UPDATE privilege on that column at all (see the grants at the
 * end of the migration: `update (email)`, and nothing else).
 */
export async function isAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;

  const client = adminClient();
  if (!client) return false;

  const { data, error } = await client
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return false;
  return (data as { is_admin: boolean }).is_admin === true;
}

export type AdminStats = {
  operationsToday: number;
  operations7d: number;
  devicesToday: number;
  activeSubscriptions: number;
  revenueXaf: number;
  topTools: { tool: string; count: number }[];
};

/** The figures the dashboard shows. All computed from real rows. */
export async function getAdminStats(): Promise<AdminStats | null> {
  const client = adminClient();
  if (!client) return null;

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const [usageToday, usageWeek, subscriptions, payments] = await Promise.all([
    client
      .from("usage_logs")
      .select("subject, count, tool")
      .eq("subject_type", "device")
      .eq("day", today),
    client
      .from("usage_logs")
      .select("count, tool")
      .eq("subject_type", "device")
      .gte("day", weekAgo),
    client
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    client.from("payments").select("amount, currency").eq("status", "succeeded"),
  ]);

  const todayRows = (usageToday.data ?? []) as { subject: string; count: number }[];
  const weekRows = (usageWeek.data ?? []) as { count: number; tool: string }[];
  const paymentRows = (payments.data ?? []) as { amount: number; currency: string }[];

  const byTool = new Map<string, number>();
  for (const row of weekRows) {
    byTool.set(row.tool, (byTool.get(row.tool) ?? 0) + row.count);
  }

  return {
    operationsToday: todayRows.reduce((sum, row) => sum + row.count, 0),
    operations7d: weekRows.reduce((sum, row) => sum + row.count, 0),
    devicesToday: new Set(todayRows.map((row) => row.subject)).size,
    activeSubscriptions: subscriptions.count ?? 0,
    // Only XAF is totalled here; mixing currencies into one number would be a
    // figure that means nothing.
    revenueXaf: paymentRows
      .filter((row) => row.currency === "XAF")
      .reduce((sum, row) => sum + row.amount, 0),
    topTools: [...byTool.entries()]
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };
}
