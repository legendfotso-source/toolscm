import type { ToolCategory, ToolDefinition } from "@/types/tool";
import type { Locale } from "@/lib/i18n/dictionaries";
import { pdfTools } from "./catalog/pdf";
import { imageTools } from "./catalog/image";
import { utilityTools } from "./catalog/utility";

/**
 * The single source of truth for every tool on the site.
 * Pure data — safe to import from server components, metadata, and the sitemap.
 * Processing code lives separately and is loaded on demand.
 */
export const TOOLS: ToolDefinition[] = [...pdfTools, ...imageTools, ...utilityTools];

export const CATEGORY_ORDER: ToolCategory[] = ["pdf", "image", "utility"];

const byId = new Map(TOOLS.map((tool) => [tool.id, tool]));

export function getTool(id: string): ToolDefinition | undefined {
  return byId.get(id);
}

export function getToolIds(): string[] {
  return TOOLS.map((tool) => tool.id);
}

export function isUsable(tool: ToolDefinition): boolean {
  return tool.status === "AVAILABLE" || tool.status === "BETA";
}

export function toolsInCategory(category: ToolCategory): ToolDefinition[] {
  const inCategory = TOOLS.filter((tool) => tool.categories.includes(category));
  // Usable tools first, "coming soon" last, each group keeping catalog order.
  return [
    ...inCategory.filter((tool) => tool.status !== "COMING_SOON"),
    ...inCategory.filter((tool) => tool.status === "COMING_SOON"),
  ];
}

export function popularTools(): ToolDefinition[] {
  return TOOLS.filter((tool) => tool.popular && isUsable(tool));
}

export function usableTools(): ToolDefinition[] {
  return TOOLS.filter(isUsable);
}

/** Strip accents and lowercase, so "compresser" matches "Compréssér". */
export function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

type ScoredTool = { tool: ToolDefinition; score: number };

/**
 * Search across both languages at once: someone typing "background" in the
 * French interface should still find "Supprimer l'arrière-plan".
 */
export function searchTools(query: string, locale: Locale): ToolDefinition[] {
  const q = normalise(query);
  if (!q) return [];

  const terms = q.split(/\s+/).filter(Boolean);

  const scored: ScoredTool[] = [];

  for (const tool of TOOLS) {
    const primary = normalise(tool.name[locale]);
    const haystacks = [
      normalise(tool.name.fr),
      normalise(tool.name.en),
      normalise(tool.short.fr),
      normalise(tool.short.en),
      normalise(tool.id.replace(/-/g, " ")),
      ...tool.keywords.map(normalise),
    ];
    const blob = haystacks.join(" | ");

    let score = 0;
    for (const term of terms) {
      if (!blob.includes(term)) {
        score = -1;
        break;
      }
      if (primary.startsWith(term)) score += 6;
      else if (primary.includes(term)) score += 4;
      else if (tool.keywords.some((k) => normalise(k).startsWith(term))) score += 3;
      else score += 1;
    }

    if (score < 0) continue;
    if (tool.popular) score += 2;
    if (tool.status === "COMING_SOON") score -= 5;
    scored.push({ tool, score });
  }

  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.tool);
}
