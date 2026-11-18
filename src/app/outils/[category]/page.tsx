import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CATEGORY_ORDER } from "@/lib/tools/registry";
import type { ToolCategory } from "@/types/tool";
import { CategoryPage } from "@/components/monde/ToolsPages";

const TITLES: Record<ToolCategory, string> = {
  pdf: "Outils PDF",
  image: "Outils image",
  utility: "Utilitaires",
};

export function generateStaticParams() {
  return CATEGORY_ORDER.map((category) => ({ category }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const known = (CATEGORY_ORDER as string[]).includes(category);
  return known
    ? { title: TITLES[category as ToolCategory], alternates: { canonical: `/outils/${category}` } }
    : {};
}

export default async function Page({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!(CATEGORY_ORDER as string[]).includes(category)) notFound();
  return <CategoryPage category={category as ToolCategory} />;
}
