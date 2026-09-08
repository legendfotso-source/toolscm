"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { baseName } from "@/lib/files";
import { readPdfJsDocument } from "@/lib/tools/pdf-utils";

export default function ExtractTextPdfTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      run={run}
      actionLabel={{ fr: "Extraire le texte", en: "Extract the text" }}
    />
  );
}

async function run({ files, report, signal }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const document = await readPdfJsDocument(file);
  const total = document.numPages;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      report({
        phase: "determinate",
        done: pageNumber - 1,
        total,
        label: { fr: `Page ${pageNumber} sur ${total}`, en: `Page ${pageNumber} of ${total}` },
      });

      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(joinTextItems(content.items));
      page.cleanup();
    }
  } finally {
    await document.loadingTask.destroy();
  }

  report({ phase: "determinate", done: total, total });

  const text = pages
    .map((body, index) => `--- Page ${index + 1} ---\n${body}`)
    .join("\n\n")
    .trim();

  // A scan holds no text at all. Say that, rather than handing over an
  // empty file and letting the user think the tool is broken.
  const hasText = pages.some((body) => body.trim().length > 0);
  if (!hasText) {
    throw new ToolError("errors.noTextFound");
  }

  return {
    files: [
      {
        name: `${baseName(file.name)}.txt`,
        blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
        kind: "text",
      },
    ],
    text,
  };
}

type TextItem = { str?: string; hasEOL?: boolean };

/**
 * pdf.js returns positioned fragments, not lines. hasEOL marks where the
 * renderer moved to a new line, which is the only reliable line signal we get.
 */
function joinTextItems(items: unknown[]): string {
  let out = "";
  for (const raw of items) {
    const item = raw as TextItem;
    if (typeof item.str !== "string") continue;
    out += item.str;
    if (item.hasEOL) out += "\n";
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
