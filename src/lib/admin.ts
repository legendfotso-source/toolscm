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
  if ((data as { is_admin: boolean }).is_admin === true) return true;

  return promoteFirstAdmin(user.id, user.email ?? "");
}

/**
 * Make the first administrator, once, from an environment variable.
 *
 * Without this there is a chicken-and-egg problem on every fresh deployment:
 * /admin needs an admin, and the only way to make one is a hand-written SQL
 * UPDATE against the production database. That is a step people get wrong, or
 * skip and then keep the service-role key somewhere convenient instead.
 *
 * Safe because ADMIN_EMAIL is a server-side variable — it is never sent to the
 * browser, and nobody can set it by signing up with a particular address. The
 * comparison is case-insensitive because email addresses are, and people do
 * not type their own address the same way twice.
 *
 * Clear the variable once you have access; the `is_admin` column is then the
 * only thing that grants it.
 */
async function promoteFirstAdmin(userId: string, email: string): Promise<boolean> {
  const configured = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!configured || !email || configured !== email.trim().toLowerCase()) return false;

  const client = adminClient();
  if (!client) return false;

  const { error } = await client
    .from("profiles")
    .update({ is_admin: true })
    .eq("id", userId);

  if (error) {
    console.error("[Tools.cm] could not promote the first admin:", error.message);
    return false;
  }

  console.warn(
    `[Tools.cm] ${email} was made an administrator from ADMIN_EMAIL. Clear that variable now.`,
  );
  return true;
}

export type DayCount = { day: string; views: number; visitors: number };

export type Audience = {
  viewsToday: number;
  visitorsToday: number;
  views7d: number;
  /**
   * Distinct visitors summed over each of the last seven days.
   *
   * Not the number of different people: the identifier is re-salted daily, so
   * somebody who came on three days is counted three times. That is the price
   * of not being able to follow anyone around, and the dashboard says so in
   * as many words rather than presenting a flattering number.
   */
  visitorDays7d: number;
  daily: DayCount[];
  topPages: { path: string; views: number }[];
  referrers: { host: string; views: number }[];
  countries: { country: string; views: number }[];
  devices: { mobile: number; desktop: number };
};

export type Member = {
  email: string;
  joinedAt: string;
  isAdmin: boolean;
  /** 'active' while Pro is paid up, otherwise the last status, or null. */
  proStatus: string | null;
  proUntil: string | null;
};

export type ExpiringRow = {
  email: string;
  phone: string | null;
  proUntil: string;
  daysLeft: number;
};

export type AdminStats = {
  operationsToday: number;
  operations7d: number;
  devicesToday: number;
  activeSubscriptions: number;
  revenueXaf: number;
  topTools: { tool: string; count: number }[];
  /** Subscriptions ending within the reminder window, soonest first. */
  expiring: ExpiringRow[];
  /**
   * Real usage over the last 7 days, from tool_events. Unlike the usage
   * counters, these fill up even while the daily limit is switched off — which
   * is the whole period when you most need to know what people are using.
   */
  activity: { tool: string; runs: number; failures: number; medianMs: number | null }[];
  eventsTotal: number;
};

/** The figures the dashboard shows. All computed from real rows. */
export async function getAdminStats(): Promise<AdminStats | null> {
  const client = adminClient();
  if (!client) return null;

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const soon = new Date(Date.now() + 4 * 86_400_000).toISOString();

  const [usageToday, usageWeek, subscriptions, payments, expiring, events] = await Promise.all([
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
    // Everyone whose access runs out in the next few days. Ordered soonest
    // first, because that is the order you would call them in.
    client
      .from("subscriptions")
      .select("user_id, end_date, profiles(email)")
      .eq("status", "active")
      .not("end_date", "is", null)
      .lte("end_date", soon)
      .order("end_date", { ascending: true })
      .limit(50),
    client
      .from("tool_events")
      .select("tool, event, meta")
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .limit(20_000),
  ]);

  const todayRows = (usageToday.data ?? []) as { subject: string; count: number }[];
  const weekRows = (usageWeek.data ?? []) as { count: number; tool: string }[];
  const paymentRows = (payments.data ?? []) as { amount: number; currency: string }[];

  const byTool = new Map<string, number>();
  for (const row of weekRows) {
    byTool.set(row.tool, (byTool.get(row.tool) ?? 0) + row.count);
  }

  return {
    ...summariseEvents((events.data ?? []) as EventRow[]),
    expiring: await withPhones(client, expiring.data ?? []),
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

/**
 * Who came, in numbers — and only in numbers.
 *
 * Every figure here is a count. There is no row in the database that says a
 * particular person visited a particular page, because the identifier the
 * counting happens against is thrown away and re-made every night. The admin
 * can see that 212 people arrived from WhatsApp on Tuesday and that most of
 * them were on a phone; nobody, including the admin, can see who they were.
 */
export async function getAudience(): Promise<Audience | null> {
  const client = adminClient();
  if (!client) return null;

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);

  // One row per (day, path, visitor), so this stays small: a person reading
  // eight pages is eight rows for that day, not one per refresh.
  const { data, error } = await client
    .from("page_views")
    .select("day, path, visitor, country, device, referrer, views")
    .gte("day", weekAgo)
    .limit(50_000);

  if (error) {
    console.error("[Tools.cm] could not read the audience:", error.message);
    return null;
  }

  const rows = (data ?? []) as {
    day: string;
    path: string;
    visitor: string;
    country: string | null;
    device: string | null;
    referrer: string | null;
    views: number;
  }[];

  const perDay = new Map<string, { views: number; visitors: Set<string> }>();
  const pages = new Map<string, number>();
  const referrers = new Map<string, number>();
  const countries = new Map<string, number>();
  const devices = { mobile: 0, desktop: 0 };

  for (const row of rows) {
    const day = perDay.get(row.day) ?? { views: 0, visitors: new Set<string>() };
    day.views += row.views;
    day.visitors.add(row.visitor);
    perDay.set(row.day, day);

    pages.set(row.path, (pages.get(row.path) ?? 0) + row.views);
    if (row.referrer) referrers.set(row.referrer, (referrers.get(row.referrer) ?? 0) + row.views);
    if (row.country) countries.set(row.country, (countries.get(row.country) ?? 0) + row.views);
    if (row.device === "mobile") devices.mobile += row.views;
    else if (row.device === "desktop") devices.desktop += row.views;
  }

  // Every day in the window, including the ones with nothing, so a quiet
  // Sunday shows as a gap rather than silently disappearing from the chart.
  const daily: DayCount[] = [];
  for (let back = 6; back >= 0; back -= 1) {
    const day = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
    const entry = perDay.get(day);
    daily.push({ day, views: entry?.views ?? 0, visitors: entry?.visitors.size ?? 0 });
  }

  const byCount = <T extends { views: number }>(a: T, b: T) => b.views - a.views;

  return {
    viewsToday: perDay.get(today)?.views ?? 0,
    visitorsToday: perDay.get(today)?.visitors.size ?? 0,
    views7d: daily.reduce((sum, day) => sum + day.views, 0),
    visitorDays7d: daily.reduce((sum, day) => sum + day.visitors, 0),
    daily,
    topPages: [...pages.entries()].map(([path, views]) => ({ path, views })).sort(byCount).slice(0, 10),
    referrers: [...referrers.entries()].map(([host, views]) => ({ host, views })).sort(byCount).slice(0, 8),
    countries: [...countries.entries()].map(([country, views]) => ({ country, views })).sort(byCount).slice(0, 8),
    devices,
  };
}

/**
 * Everyone who has an account, newest first.
 *
 * This one is a list of real people with real email addresses, and that is
 * exactly why it is behind `isAdmin()` and why /admin returns notFound() to
 * everyone else. Using a tool requires an account, so this is everyone who
 * uses the tools — but not everyone who reads the site's pages.
 */
export async function getMembers(limit = 200): Promise<Member[]> {
  const client = adminClient();
  if (!client) return [];

  const { data, error } = await client
    .from("profiles")
    .select("id, email, is_admin, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[Tools.cm] could not list members:", error.message);
    return [];
  }

  const profiles = (data ?? []) as {
    id: string;
    email: string | null;
    is_admin: boolean;
    created_at: string;
  }[];
  if (profiles.length === 0) return [];

  // One query for the subscriptions rather than one per member.
  const { data: subsData } = await client
    .from("subscriptions")
    .select("user_id, status, end_date")
    .in("user_id", profiles.map((row) => row.id))
    .order("end_date", { ascending: false, nullsFirst: false });

  const subs = new Map<string, { status: string; end_date: string | null }>();
  for (const row of (subsData ?? []) as {
    user_id: string;
    status: string;
    end_date: string | null;
  }[]) {
    const existing = subs.get(row.user_id);
    // An active subscription always wins over an expired one, whatever the
    // dates say; otherwise the newest end date is the interesting one.
    if (!existing || (row.status === "active" && existing.status !== "active")) {
      subs.set(row.user_id, { status: row.status, end_date: row.end_date });
    }
  }

  return profiles.map((row) => {
    const sub = subs.get(row.id);
    return {
      email: row.email ?? "",
      joinedAt: row.created_at,
      isAdmin: row.is_admin,
      proStatus: sub?.status ?? null,
      proUntil: sub?.end_date ?? null,
    };
  });
}

/**
 * Attach the phone number each customer last paid with.
 *
 * It lives in the payment's `raw` blob rather than on the profile, because it
 * is what the admin typed at activation time — the number that actually
 * reached them — not something the customer registered and forgot. Without it
 * a reminder has no way to be sent.
 */
async function withPhones(
  client: NonNullable<ReturnType<typeof adminClient>>,
  rows: unknown[],
): Promise<ExpiringRow[]> {
  const subs = rows as { user_id: string; end_date: string; profiles: { email: string } | null }[];
  if (subs.length === 0) return [];

  const { data } = await client
    .from("payments")
    .select("user_id, raw, created_at")
    .in("user_id", subs.map((row) => row.user_id))
    .eq("status", "succeeded")
    .order("created_at", { ascending: false });

  const phones = new Map<string, string>();
  for (const payment of (data ?? []) as { user_id: string; raw: { phone?: unknown } | null }[]) {
    const phone = payment.raw?.phone;
    // Newest first, so the first one seen for a user is the most recent.
    if (typeof phone === "string" && phone && !phones.has(payment.user_id)) {
      phones.set(payment.user_id, phone);
    }
  }

  const dayInDouala = (date: Date) => Math.floor((date.getTime() + 3_600_000) / 86_400_000);
  const today = dayInDouala(new Date());

  return subs.map((row) => ({
    email: row.profiles?.email ?? "",
    phone: phones.get(row.user_id) ?? null,
    proUntil: row.end_date,
    daysLeft: dayInDouala(new Date(row.end_date)) - today,
  }));
}

type EventRow = {
  tool: string | null;
  event: string;
  meta: { durationMs?: unknown } | null;
};

/**
 * Turn raw events into the three numbers worth acting on.
 *
 * The median rather than the mean, because one person compressing a 300-page
 * PDF on a slow phone would drag an average far enough to hide that everyone
 * else is fine. The median says what a typical visitor actually experiences.
 */
function summariseEvents(rows: EventRow[]): Pick<AdminStats, "activity" | "eventsTotal"> {
  const byTool = new Map<string, { runs: number; failures: number; times: number[] }>();

  for (const row of rows) {
    if (!row.tool) continue;
    const entry = byTool.get(row.tool) ?? { runs: 0, failures: 0, times: [] };

    if (row.event === "success") {
      entry.runs += 1;
      const duration = row.meta?.durationMs;
      if (typeof duration === "number" && duration >= 0) entry.times.push(duration);
    } else if (row.event === "error") {
      entry.failures += 1;
    }

    byTool.set(row.tool, entry);
  }

  const activity = [...byTool.entries()]
    .map(([tool, entry]) => {
      const sorted = entry.times.sort((a, b) => a - b);
      return {
        tool,
        runs: entry.runs,
        failures: entry.failures,
        medianMs: sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null,
      };
    })
    // Most used first, then most broken: the two questions worth asking.
    .sort((a, b) => b.runs + b.failures - (a.runs + a.failures))
    .slice(0, 12);

  return { activity, eventsTotal: rows.length };
}
