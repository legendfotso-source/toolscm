import type { Metadata } from "next";
import { HomeContent } from "@/components/home/HomeContent";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { usableTools } from "@/lib/tools/registry";

export const metadata: Metadata = {
  title: "Tools.cm — Outils PDF et image gratuits, simples et privés",
  description:
    "Compressez un PDF, fusionnez vos documents, convertissez JPG en PDF ou supprimez l'arrière-plan d'une photo. Gratuit, sans compte, et vos fichiers restent sur votre appareil.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  // Structured data describes what the site actually offers, so a search
  // engine can present the tool list without us dressing up the page.
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        inLanguage: "fr",
        description:
          "Outils PDF et image gratuits qui fonctionnent directement dans le navigateur.",
      },
      {
        "@type": "ItemList",
        name: "Outils Tools.cm",
        itemListElement: usableTools().map((tool, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: tool.name.fr,
          url: `${SITE_URL}/tool/${tool.id}`,
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <HomeContent />
    </>
  );
}
