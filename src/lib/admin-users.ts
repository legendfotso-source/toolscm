import "server-only";

import { adminClient } from "./supabase/admin";
import { tierOf, type TierId } from "./payments/tiers";
import type { AccountStatus, Grant } from "./accounts";
import { bestGrantTier, grantExpiry, liveGrants } from "./accounts";
import { recent as recentAudit, type AuditEntry } from "./audit";

/**
 * Everything /admin needs to know about one account, and how to find it.
 *
 * Separate from `admin.ts`, which answers questions about the PLATFORM — how
 * many visitors, how much revenue, which tools. This answers questions about a
 * PERSON, and the two have different shapes: the platform ones are aggregates
 * that must stay cheap on every page load, these are one account read once
 * when somebody clicks on it.
 *
 * Everything degrades rather than throwing. A table that does not exist yet
 * returns an empty list, because the code deploy and the hand-run migration
 * land at different moments and a detail page that 500s in that window is a
 * detail page nobody trusts afterwards.
 */

const UNDEFINED_TABLE = "42P01";
const UNDEFINED_COLUMN = "42703";

function missing(code: string | undefined): boolean {
  return code === UNDEFINED_TABLE || code === UNDEFINED_COLUMN;
}

export type UserRow = {
  id: string;
  email: string;
  joinedAt: string;
  isAdmin: boolean;
  isUnlimited: boolean;
  status: AccountStatus;
  /** What they actually have right now, whatever its source. */
  tier: TierId;
  /** Where that came from, so a gift never reads as a sale. */
  source: "none" | "grant" | "subscription";
  until: string | null;
};

export type UserFilter = {
  /** Matched against the email, case-insensitively, anywhere in it. */
  query?: string;
  status?: AccountStatus | "all";
  tier?: TierId | "all" | "paying";
  limit?: number;
  offset?: number;
};

export type UserPage = {
  rows: UserRow[];
  /** How many match the filter in total, for the pager. */
  total: number;
};

/**
 * Find accounts, with search, filter and paging done IN THE DATABASE.
 *
 * Not fetched-then-filtered in JavaScript. That works at four accounts and
 * stops working at four thousand, and the moment it stops working is the
 * moment the site is finally succeeding — the worst possible time for the
 * admin page to become unusable.
 */
export async function findUsers(filter: UserFilter = {}): Promise<UserPage> {
  const client = adminClient();
  if (!client) return { rows: [], total: 0 };

  const limit = Math.max(1, Math.min(filter.limit ?? 25, 200));
  const offset = Math.max(0, filter.offset ?? 0);

  const build = (columns: string, head: boolean) => {
    let query = client
      .from("profiles")
      .select(columns, head ? { count: "exact", head: true } : { count: "exact" });
    if (filter.query?.trim()) {
      // Escaped: a comma or a parenthesis in the search box is PostgREST
      // syntax, and an unescaped one turns a search into a different query
      // rather than into no results.
      const needle = filter.query.trim().replace(/[%,()]/g, " ");
      query = query.ilike("email", `%${needle}%`);
    }
    if (filter.status && filter.status !== "all") {
      query = query.eq("status", filter.status);
    }
    if (!head) {
      query = query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
    }
    return query;
  };

  // Pre-migration fallback, the same shape getMembers() already uses: without
  // it, one missing column makes /admin report that nobody has an account.
  let result = await build("id, email, is_admin, created_at, is_unlimited, status", false);
  if (missing(result.error?.code)) {
    result = await build("id, email, is_admin, created_at", false);
  }
  if (result.error) {
    console.error("[Tools.cm] could not list accounts:", result.error.message);
    return { rows: [], total: 0 };
  }

  const profiles = (result.data ?? []) as unknown as {
    id: string;
    email: string | null;
    is_admin: boolean;
    created_at: string;
    is_unlimited?: boolean;
    status?: string | null;
  }[];
  const total = result.count ?? profiles.length;
  if (!profiles.length) return { rows: [], total };

  const ids = profiles.map((row) => row.id);

  // Subscriptions and grants for the whole page in two queries, not two per
  // row. Twenty-five accounts would otherwise be fifty round trips.
  const subs = await subscriptionsFor(ids);
  const grants = await grantsFor(ids);

  const rows: UserRow[] = profiles.map((row) => {
    const sub = subs.get(row.id);
    const live = grants.get(row.id) ?? [];
    const paid = sub?.status === "active" ? tierOf(sub.tier ?? "pro") : null;
    const granted = row.is_unlimited ? ("owner" as TierId) : bestGrantTier(live);

    const useGrant = granted && (!paid || rank(granted) >= rank(paid));
    const tier: TierId = (useGrant ? granted : paid) ?? "free";

    return {
      id: row.id,
      email: row.email ?? "",
      joinedAt: row.created_at,
      isAdmin: row.is_admin === true,
      isUnlimited: row.is_unlimited === true,
      status: normaliseStatus(row.status),
      tier,
      source: tier === "free" ? "none" : useGrant ? "grant" : "subscription",
      until: useGrant ? (row.is_unlimited ? null : grantExpiry(live)) : (sub?.end_date ?? null),
    };
  });

  // The tier filter is applied here rather than in SQL, deliberately. A
  // person's tier is not a column: it is the stronger of a subscription and a
  // grant, evaluated against the clock. Expressing that as a WHERE clause
  // would mean duplicating the rule in SQL, where it would drift from the one
  // in entitlement.ts — and two rules that disagree about who has paid is a
  // worse problem than a filter that reads one page at a time.
  const wanted = filter.tier ?? "all";
  const filtered =
    wanted === "all"
      ? rows
      : wanted === "paying"
        ? rows.filter((row) => row.tier !== "free")
        : rows.filter((row) => row.tier === wanted);

  return { rows: filtered, total };
}

function rank(tier: TierId): number {
  return ["free", "pro", "max", "owner"].indexOf(tier);
}

function normaliseStatus(value: string | null | undefined): AccountStatus {
  const allowed: AccountStatus[] = ["active", "suspended", "blocked", "deactivated"];
  return allowed.includes((value ?? "active") as AccountStatus)
    ? ((value ?? "active") as AccountStatus)
    : "active";
}

async function subscriptionsFor(ids: string[]) {
  const client = adminClient();
  const out = new Map<string, { status: string; end_date: string | null; tier?: string | null }>();
  if (!client || !ids.length) return out;

  const ask = (columns: string) =>
    client
      .from("subscriptions")
      .select(columns)
      .in("user_id", ids)
      .order("end_date", { ascending: false, nullsFirst: false });

  let result = await ask("user_id, status, end_date, tier");
  if (missing(result.error?.code)) result = await ask("user_id, status, end_date");
  if (result.error) return out;

  for (const row of (result.data ?? []) as unknown as {
    user_id: string;
    status: string;
    end_date: string | null;
    tier?: string | null;
  }[]) {
    const existing = out.get(row.user_id);
    if (!existing || (row.status === "active" && existing.status !== "active")) {
      out.set(row.user_id, { status: row.status, end_date: row.end_date, tier: row.tier });
    }
  }
  return out;
}

async function grantsFor(ids: string[]) {
  const client = adminClient();
  const out = new Map<string, Grant[]>();
  if (!client || !ids.length) return out;

  const now = new Date().toISOString();
  const { data, error } = await client
    .from("entitlement_grants")
    .select("*")
    .in("user_id", ids)
    .is("revoked_at", null)
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`);
  if (error) return out;

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const userId = String(row.user_id);
    const list = out.get(userId) ?? [];
    list.push({
      id: String(row.id),
      userId,
      tier: row.tier as Grant["tier"],
      kind: row.kind as Grant["kind"],
      reason: (row.reason as string) ?? null,
      startsAt: String(row.starts_at),
      expiresAt: (row.expires_at as string) ?? null,
      grantedBy: (row.granted_by as string) ?? null,
      revokedAt: null,
      createdAt: String(row.created_at),
    });
    out.set(userId, list);
  }
  return out;
}

// ---------------------------------------------------------------------------
// One account, in full
// ---------------------------------------------------------------------------

export type PaymentRow = {
  id: string;
  provider: string;
  amount: number;
  currency: string;
  status: string;
  transactionId: string;
  tier: string | null;
  createdAt: string;
};

export type NoteRow = {
  id: string;
  body: string;
  authorEmail: string | null;
  createdAt: string;
};

export type UserDetail = {
  account: UserRow;
  /** Every grant, including revoked and expired ones — the history matters. */
  grants: Grant[];
  payments: PaymentRow[];
  notes: NoteRow[];
  audit: AuditEntry[];
  /**
   * Always null, and that is the honest answer.
   *
   * The brief asks for per-user usage on this page. Tools.cm cannot provide
   * it, and the reason is a decision rather than a gap: `usage_logs` is keyed
   * on a DEVICE hash that is re-salted every night, specifically so the
   * database can answer "how many people came today" and can never answer
   * "and what did this one do last week". Counting operations per account
   * would mean attaching usage to an identity — which is the thing the site
   * promises not to do, on a site whose whole pitch is that files never leave
   * your device.
   *
   * Reporting 0 would be worse than reporting nothing: somebody who has used
   * the site forty times would show as idle, and the page would be confidently
   * wrong. So the field exists, is always null, and the page says why.
   */
  operations: null;
};

export async function userDetail(userId: string): Promise<UserDetail | null> {
  const client = adminClient();
  if (!client || !userId) return null;

  const ask = (columns: string) =>
    client.from("profiles").select(columns).eq("id", userId).maybeSingle();
  let profile = await ask("id, email, is_admin, created_at, is_unlimited, status");
  if (missing(profile.error?.code)) profile = await ask("id, email, is_admin, created_at");
  if (profile.error || !profile.data) return null;

  const row = profile.data as unknown as {
    id: string;
    email: string | null;
    is_admin: boolean;
    created_at: string;
    is_unlimited?: boolean;
    status?: string | null;
  };

  const subs = await subscriptionsFor([userId]);
  const sub = subs.get(userId);
  const live = await liveGrants(userId);
  const paid = sub?.status === "active" ? tierOf(sub.tier ?? "pro") : null;
  const granted = row.is_unlimited ? ("owner" as TierId) : bestGrantTier(live);
  const useGrant = granted && (!paid || rank(granted) >= rank(paid));
  const tier: TierId = (useGrant ? granted : paid) ?? "free";

  const [allGrants, payments, notes, audit] = await Promise.all([
    everyGrant(userId),
    paymentsFor(userId),
    notesFor(userId),
    recentAudit({ targetUser: userId, limit: 40 }),
  ]);

  return {
    account: {
      id: row.id,
      email: row.email ?? "",
      joinedAt: row.created_at,
      isAdmin: row.is_admin === true,
      isUnlimited: row.is_unlimited === true,
      status: normaliseStatus(row.status),
      tier,
      source: tier === "free" ? "none" : useGrant ? "grant" : "subscription",
      until: useGrant ? (row.is_unlimited ? null : grantExpiry(live)) : (sub?.end_date ?? null),
    },
    grants: allGrants,
    payments,
    notes,
    audit,
    operations: null,
  };
}

/** Every grant ever, revoked and expired included. The history is the point. */
async function everyGrant(userId: string): Promise<Grant[]> {
  const client = adminClient();
  if (!client) return [];
  const { data, error } = await client
    .from("entitlement_grants")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    userId,
    tier: row.tier as Grant["tier"],
    kind: row.kind as Grant["kind"],
    reason: (row.reason as string) ?? null,
    startsAt: String(row.starts_at),
    expiresAt: (row.expires_at as string) ?? null,
    grantedBy: (row.granted_by as string) ?? null,
    revokedAt: (row.revoked_at as string) ?? null,
    createdAt: String(row.created_at),
  }));
}

async function paymentsFor(userId: string): Promise<PaymentRow[]> {
  const client = adminClient();
  if (!client) return [];
  const ask = (columns: string) =>
    client
      .from("payments")
      .select(columns)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
  let result = await ask("id, provider, amount, currency, status, transaction_id, tier, created_at");
  if (missing(result.error?.code)) {
    result = await ask("id, provider, amount, currency, status, transaction_id, created_at");
  }
  if (result.error) return [];
  return ((result.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    provider: String(row.provider),
    amount: Number(row.amount ?? 0),
    currency: String(row.currency ?? "XAF"),
    status: String(row.status),
    transactionId: String(row.transaction_id ?? ""),
    tier: (row.tier as string) ?? null,
    createdAt: String(row.created_at),
  }));
}

async function notesFor(userId: string): Promise<NoteRow[]> {
  const client = adminClient();
  if (!client) return [];
  const { data, error } = await client
    .from("admin_notes")
    .select("id, body, author_email, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    body: String(row.body),
    authorEmail: (row.author_email as string) ?? null,
    createdAt: String(row.created_at),
  }));
}
