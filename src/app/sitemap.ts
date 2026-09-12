import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { TOOLS } from "@/lib/tools/registry";
import { listPosts } from "@/lib/blog/posts";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/cookies`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  // Tools that do not work yet are excluded: they are marked noindex, and
  // listing them here would invite crawls of pages that cannot help anyone.
  const toolPages: MetadataRoute.Sitemap = TOOLS.filter(
    (tool) => tool.status !== "COMING_SOON",
  ).map((tool) => ({
    url: `${SITE_URL}/tool/${tool.id}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: tool.popular ? 0.9 : 0.7,
  }));

  // Each guide carries its own publication date rather than "now": telling a
  // crawler that everything changed today, every day, is how a sitemap stops
  // being believed.
  const postPages: MetadataRoute.Sitemap = listPosts().map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...toolPages, ...postPages];
}
