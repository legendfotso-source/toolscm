import type { Metadata } from "next";
import { PricingContent } from "@/components/PricingContent";

export const metadata: Metadata = {
  title: "Tarifs — Tools.cm",
  description:
    "Tools.cm est gratuit au quotidien, sans compte. L'abonnement Pro à 2 000 FCFA par mois lèvera la limite quotidienne et retirera la publicité.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return <PricingContent />;
}
