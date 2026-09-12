import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, listPosts, relatedPosts } from "@/lib/blog/posts";
import { getTool } from "@/lib/tools/registry";
import { absoluteUrl, SITE_NAME } from "@/lib/site";

// Every post is known at build time, so each one is a static file — the
// cheapest thing to serve to someone on a slow connection.
export function generateStaticParams() {
  return listPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Guide introuvable — Tools.cm" };

  return {
    title: `${post.title} — ${SITE_NAME}`,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      url: absoluteUrl(`/blog/${post.slug}`),
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const related = relatedPosts(post.slug);
  const published = new Date(post.date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="container-page py-6 sm:py-8">
      <article className="mx-auto max-w-2xl">
        <nav aria-label="Fil d'Ariane" className="mb-4 text-[13px] text-ink-soft">
          <Link href="/" className="hover:text-violet-deep">
            Accueil
          </Link>
          <span className="mx-1">/</span>
          <Link href="/blog" className="hover:text-violet-deep">
            Guides
          </Link>
        </nav>

        <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink sm:text-[32px]">
          {post.title}
        </h1>
        <p className="mt-2 text-[13px] text-ink-soft">
          <time dateTime={post.date}>{published}</time>
        </p>

        <div className="mt-6">
          {post.body.map((block, index) => {
            if (block.kind === "h") {
              return (
                <h2
                  key={index}
                  className="mt-8 text-[19px] font-bold leading-snug text-ink"
                >
                  {block.text}
                </h2>
              );
            }

            if (block.kind === "p") {
              return (
                <p key={index} className="mt-4 text-[15.5px] leading-7 text-ink">
                  {block.text}
                </p>
              );
            }

            if (block.kind === "list") {
              return (
                <ul key={index} className="mt-4 space-y-2">
                  {block.items.map((item) => (
                    <li key={item} className="flex gap-2.5 text-[15px] leading-7 text-ink">
                      <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-mid" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              );
            }

            if (block.kind === "steps") {
              return (
                <ol key={index} className="mt-4 space-y-2.5">
                  {block.items.map((item, position) => (
                    <li key={item} className="flex gap-3 text-[15px] leading-7 text-ink">
                      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-deep text-[12px] font-bold text-white">
                        {position + 1}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              );
            }

            if (block.kind === "note") {
              return (
                <p
                  key={index}
                  className="mt-5 rounded-xl border border-line bg-surface-alt p-4 text-[14.5px] leading-7 text-ink"
                >
                  {block.text}
                </p>
              );
            }

            const tool = getTool(block.id);
            if (!tool) return null;

            return (
              <Link
                key={index}
                href={`/tool/${block.id}`}
                className="mt-5 flex min-h-13 items-center justify-between gap-3 rounded-xl border border-violet-border bg-violet-light px-4 py-3 transition-colors hover:bg-white"
              >
                <span className="text-[15px] font-semibold text-violet-deep">{block.label}</span>
                <span aria-hidden="true" className="text-[18px] text-violet-deep">→</span>
              </Link>
            );
          })}
        </div>

        {related.length > 0 ? (
          <div className="mt-12 border-t border-line pt-6">
            <h2 className="text-[16px] font-bold text-ink">À lire aussi</h2>
            <ul className="mt-3 space-y-2.5">
              {related.map((other) => (
                <li key={other.slug}>
                  <Link
                    href={`/blog/${other.slug}`}
                    className="text-[15px] leading-6 text-violet-deep underline-offset-2 hover:underline"
                  >
                    {other.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.description,
            datePublished: post.date,
            inLanguage: "fr",
            mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
            publisher: { "@type": "Organization", name: SITE_NAME },
          }),
        }}
      />
    </div>
  );
}
