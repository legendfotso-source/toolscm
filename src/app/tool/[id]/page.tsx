import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolPageContent } from "@/components/ToolPageContent";
import { getTool, getToolIds } from "@/lib/tools/registry";
import { SITE_URL } from "@/lib/site";

type PageProps = { params: Promise<{ id: string }> };

/** Every tool page is prerendered — they are the pages search brings people to. */
export function generateStaticParams() {
  return getToolIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const tool = getTool(id);
  if (!tool) return { title: "Outil introuvable" };

  const url = `${SITE_URL}/tool/${tool.id}`;

  return {
    // Titles and descriptions are per-tool, in French, the site's primary
    // language. Nothing here is templated boilerplate.
    title: tool.seoTitle.fr,
    description: tool.seoDescription.fr,
    keywords: tool.keywords,
    alternates: { canonical: `/tool/${tool.id}` },
    openGraph: {
      type: "article",
      url,
      title: tool.seoTitle.fr,
      description: tool.seoDescription.fr,
      locale: "fr_CM",
    },
    twitter: {
      card: "summary",
      title: tool.seoTitle.fr,
      description: tool.seoDescription.fr,
    },
    robots:
      tool.status === "COMING_SOON"
        ? // A page that cannot do the job yet should not compete for the query.
          { index: false, follow: true }
        : { index: true, follow: true },
  };
}

export default async function ToolPage({ params }: PageProps) {
  const { id } = await params;
  const tool = getTool(id);
  if (!tool) notFound();

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: tool.name.fr,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Web",
        description: tool.seoDescription.fr,
        url: `${SITE_URL}/tool/${tool.id}`,
        offers: { "@type": "Offer", price: "0", priceCurrency: "XAF" },
      },
      ...(tool.faq.length > 0
        ? [
            {
              "@type": "FAQPage",
              mainEntity: tool.faq.map((entry) => ({
                "@type": "Question",
                name: entry.q.fr,
                acceptedAnswer: { "@type": "Answer", text: entry.a.fr },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <ToolPageContent tool={tool} />
    </>
  );
}
