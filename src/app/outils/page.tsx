import type { Metadata } from "next";
import { AllToolsPage } from "@/components/monde/ToolsPages";

export const metadata: Metadata = {
  title: "Tous les outils PDF et image",
  description: "Compresser, fusionner, convertir, découper, protéger : tous les outils PDF et image de Tools.cm, qui fonctionnent dans votre navigateur.",
  alternates: { canonical: "/outils" },
};

export default function ToolsPage() {
  return <AllToolsPage />;
}
