import type { Metadata } from "next";
import Link from "next/link";
import { listPosts } from "@/lib/blog/posts";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Guides",
  description:
    "Des guides courts et concrets : réduire un PDF, faire une photo d'identité, assembler un dossier. Écrits pour être lus sur un téléphone.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndexPage() {
  const posts = listPosts();

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink sm:text-[30px]">
          Guides
        </h1>
        <p className="mt-2 text-[15px] leading-7 text-ink-soft">
          Comment faire, concrètement, les choses pour lesquelles on vient ici.
          Courts, en français, pensés pour un téléphone.
        </p>

        <ul className="mt-7 space-y-4">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="block rounded-2xl border border-line bg-white p-5 transition-colors hover:border-violet-border"
              >
                <h2 className="text-[17px] font-bold leading-snug text-ink">{post.title}</h2>
                <p className="mt-1.5 text-[14px] leading-6 text-ink-soft">{post.description}</p>
                <span className="mt-2.5 inline-block text-[13px] font-semibold text-violet-deep">
                  Lire le guide →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* An ItemList tells search engines these are separate articles rather
          than one page of links. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            itemListElement: posts.map((post, index) => ({
              "@type": "ListItem",
              position: index + 1,
              url: absoluteUrl(`/blog/${post.slug}`),
              name: post.title,
            })),
          }),
        }}
      />
    </div>
  );
}
