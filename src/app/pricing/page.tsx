import type { Metadata } from "next";
import { PricingContent } from "@/components/PricingContent";
import { getSettings } from "@/lib/settings";
import { pricesByTier } from "@/lib/payments/plans";
import { notchpayConfigured } from "@/lib/payments/providers/notchpay";
import { campayConfigured } from "@/lib/payments/providers/campay";
import { stripeConfigured } from "@/lib/payments/providers/stripe";
import { currentUser } from "@/lib/supabase/server-client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Tools.cm est gratuit au quotidien avec un compte. L'abonnement Pro à 2 000 FCFA par mois lève la limite quotidienne et retire la publicité.",
  alternates: { canonical: "/pricing" },
};

// Prices and which payment methods are live come from the database, so this
// page cannot be baked at build time.
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const settings = await getSettings();
  const user = isSupabaseConfigured() ? await currentUser() : null;

  // A provider counts as available only when it has keys AND payments have
  // been switched on deliberately in /admin. Two locks, because a half-live
  // payment button is worse than none.
  const live = settings.payments_enabled;

  return (
    <PricingContent
      notchpay={live && notchpayConfigured()}
      campay={live && campayConfigured()}
      stripe={live && stripeConfigured()}
      signedIn={Boolean(user)}
      prices={pricesByTier(settings)}
    />
  );
}
