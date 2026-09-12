import type { Metadata } from "next";
import { OfflineContent } from "@/components/OfflineContent";

export const metadata: Metadata = {
  title: "Hors connexion",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return <OfflineContent />;
}
