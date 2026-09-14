import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountContent } from "@/components/AccountContent";
import { getEntitlement } from "@/lib/entitlement";
import { getSettings } from "@/lib/settings";
import { currentUser } from "@/lib/supabase/server-client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { adminClient } from "@/lib/supabase/admin";
import { type Receipt, receiptReference } from "@/lib/payments/receipt";
import { TERM_DAYS } from "@/lib/payments/term";

export const metadata: Metadata = {
  title: "Mon compte",
  robots: { index: false, follow: false },
};

// Entitlement is per-user, so this page can never be cached.
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    return (
      <AccountContent
        email={null}
        name={null}
        avatarUrl={null}
        provider={null}
        memberSince={null}
        isPro={false}
        proUntil={null}
        dailyLimit={null}
        configured={false}
        receipts={[]}
      />
    );
  }

  const user = await currentUser();
  if (!user) redirect("/signin");

  const { isPro, proUntil } = await getEntitlement();
  const settings = await getSettings();

  // Read straight off the session rather than from a profile row a person
  // could have edited: this block exists so somebody can confirm at a glance
  // that they are looking at their OWN account, and it should reflect what
  // they actually signed in with.
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value ? value : null);

  return (
    <AccountContent
      email={user.email ?? null}
      name={text(metadata.full_name) ?? text(metadata.name)}
      avatarUrl={text(metadata.avatar_url) ?? text(metadata.picture)}
      provider={user.app_metadata?.provider ?? "email"}
      memberSince={user.created_at ?? null}
      isPro={isPro}
      proUntil={proUntil}
      dailyLimit={settings.limits_enabled ? settings.free_daily_limit : null}
      configured
      receipts={await receiptsFor(user.id, user.email ?? "", proUntil)}
    />
  );
}

/**
 * The customer's own receipts.
 *
 * Someone who paid by sending money to a phone number deserves to be able to
 * find the proof themselves, at 2am, without messaging anyone. Read with the
 * service role but filtered to this user's id — never by anything the browser
 * sent.
 */
async function receiptsFor(
  userId: string,
  email: string,
  proUntil: string | null,
): Promise<Receipt[]> {
  const client = adminClient();
  if (!client) return [];

  const { data } = await client
    .from("payments")
    .select("id, amount, currency, created_at")
    .eq("user_id", userId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(24);

  const rows = (data ?? []) as {
    id: string;
    amount: number;
    currency: string;
    created_at: string;
  }[];

  return rows.map((row) => ({
    reference: receiptReference(row.id),
    email,
    amount: row.amount,
    currency: row.currency,
    paidAt: row.created_at,
    // Only the most recent payment determines the current end date; older ones
    // show what they covered without claiming to still be running.
    proUntil: row.id === rows[0]?.id ? proUntil : null,
    days: TERM_DAYS,
  }));
}
