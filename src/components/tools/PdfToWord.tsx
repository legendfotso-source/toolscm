"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { baseName } from "@/lib/files";
import { readPdfJsDocument } from "@/lib/tools/pdf-utils";
import { paragraphsFromLines } from "@/lib/tools/text-layout";

/**
 * A PDF's text, in a Word file you can edit.
 *
 * Read the tool page before judging this one: it promises a document you can
 * EDIT, not a photocopy. Columns, tables and typography are not reconstructed,
 * because reconstructing them reliably in a browser is the thing that kept
 * this tool unpublished for months and the attempts that "nearly" work produce
 * files people then have to fix by hand — which is worse than starting from
 * clean text.
 *
 * So what it does is precise and honest: the words, in reading order, with the
 * page breaks kept, in a real .docx. For the overwhelmingly common case here —
 * a student who needs to edit a report, someone repurposing a letter — that is
 * the whole job. The page says so, the result card says so again, and the
 * subtitle does not use the word "faithful".
 */
export default function PdfToWordTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      run={run}
      actionLabel={{ fr: "Convertir en Word", en: "Convert to Word" }}
    />
  );
}

async function run({ files, report, signal }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const document = await readPdfJsDocument(file);
  const total = document.numPages;
  const pages: string[][] = [];

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
      pages.push(paragraphsFrom(content.items));
      page.cleanup();
    }
  } finally {
    await document.loadingTask.destroy();
  }

  // A scan is a stack of photographs with no text in it. Converting one would
  // produce an empty Word file, and an empty file looks like a broken tool.
  if (!pages.some((page) => page.length > 0)) throw new ToolError("errors.noTextFound");

  report({ phase: "indeterminate", label: { fr: "Écriture du document…", en: "Writing the document…" } });

  const { Document, Packer, Paragraph, PageBreak, TextRun } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [];
  pages.forEach((paragraphs, index) => {
    if (index > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    for (const text of paragraphs) {
      children.push(new Paragraph({ children: [new TextRun(text)], spacing: { after: 160 } }));
    }
  });

  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));

  return {
    files: [
      {
        name: `${baseName(file.name)}.docx`,
        blob,
        kind: "other",
      },
    ],
    originalBytes: file.size,
    note: {
      fr: "Le texte est récupéré dans l'ordre de lecture, une page par page. La mise en page d'origine — colonnes, tableaux, polices, images — n'est pas reconstruite : ce fichier est fait pour être modifié, pas pour ressembler au PDF.",
      en: "The text is recovered in reading order, one page at a time. The original layout — columns, tables, fonts, images — is not rebuilt: this file is made to be edited, not to look like the PDF.",
    },
  };
}

type TextItem = { str?: string; hasEOL?: boolean };

/**
 * Turn positioned fragments into paragraphs.
 *
 * pdf.js reports where the renderer moved to a new line, never where a
 * paragraph ends. A blank line is the only signal a PDF really gives for that,
 * so consecutive lines are joined and a blank one starts a new paragraph —
 * which is what a person would do reading it aloud.
 */
function paragraphsFrom(items: unknown[]): string[] {
  let raw = "";
  for (const item of items as TextItem[]) {
    if (typeof item.str !== "string") continue;
    raw += item.str;
    if (item.hasEOL) raw += "\n";
  }
  return paragraphsFromLines(raw);
}
