import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountContent } from "@/components/AccountContent";
import { getEntitlement } from "@/lib/entitlement";
import { currentUser } from "@/lib/supabase/server-client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Mon compte — Tools.cm",
  robots: { index: false, follow: false },
};

// Entitlement is per-user, so this page can never be cached.
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    return <AccountContent email={null} isPro={false} proUntil={null} configured={false} />;
  }

  const user = await currentUser();
  if (!user) redirect("/signin");

  const { isPro, proUntil } = await getEntitlement();

  return (
    <AccountContent
      email={user.email ?? null}
      isPro={isPro}
      proUntil={proUntil}
      configured
    />
  );
}
