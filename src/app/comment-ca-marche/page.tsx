import type { Metadata } from "next";
import { HowPage } from "@/components/monde/ToolsPages";

export const metadata: Metadata = {
  title: "Comment ça marche",
  description: "Choisissez un outil, ajoutez votre fichier, récupérez le résultat. Le traitement se fait dans votre navigateur : vos fichiers ne quittent pas votre appareil.",
  alternates: { canonical: "/comment-ca-marche" },
};

export default function HowItWorksPage() {
  return <HowPage />;
}
