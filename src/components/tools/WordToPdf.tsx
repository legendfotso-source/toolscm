"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { baseName } from "@/lib/files";
import { loadPdfLib } from "@/lib/tools/pdf-utils";
import { toWinAnsi, wrapText } from "@/lib/tools/text-layout";

/**
 * A Word document as a PDF, without Word.
 *
 * Word's own export is more faithful and the page says so plainly — it is
 * free, it is on every phone that has the app, and if you have it you should
 * use it. This exists for the case that actually happens here: somebody is
 * handed a .docx on WhatsApp, has no Office licence on the machine in front of
 * them, needs a PDF to attach to an application, and needs it now.
 *
 * What is kept: the text, paragraph order, headings, lists, bold and italic.
 * What is not: exact fonts, page breaks, tables, images, columns. That is
 * stated on the page and repeated on the result, because a person about to
 * send this to an employer deserves to know before they send it, not after.
 */
const options: OptionDescriptor[] = [
  {
    id: "pageSize",
    type: "cards",
    label: { fr: "Format de page", en: "Page size" },
    default: "a4",
    choices: [
      { value: "a4", label: { fr: "A4", en: "A4" } },
      { value: "letter", label: { fr: "Letter", en: "Letter" } },
    ],
  },
];

/** Points, at 72 per inch. */
const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

const MARGIN = 56;
const BODY_SIZE = 11;
const LINE_HEIGHT = 15.5;

export default function WordToPdfTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      actionLabel={{ fr: "Convertir en PDF", en: "Convert to PDF" }}
    />
  );
}

type Block = { text: string; level: number; bullet: boolean; bold: boolean; italic: boolean };

async function run({ files, options: values, report }: RunContext): Promise<ToolResult> {
  const file = files[0];

  report({ phase: "indeterminate", label: { fr: "Lecture du document…", en: "Reading the document…" } });

  const mammoth = await import("mammoth");
  let html: string;
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    html = result.value;
  } catch {
    // .doc (the old binary format) is not .docx and cannot be read here. The
    // message has to say which one we accept or the person just tries again.
    throw new ToolError("errors.invalidDocx");
  }

  const blocks = blocksFrom(html);
  if (blocks.length === 0) throw new ToolError("errors.emptyDocument");

  report({ phase: "indeterminate", label: { fr: "Mise en page…", en: "Laying out…" } });

  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
  const pdf = await PDFDocument.create();

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);

  const [width, height] = PAGE_SIZES[String(values.pageSize ?? "a4")] ?? PAGE_SIZES.a4;
  const usableWidth = width - MARGIN * 2;

  let page = pdf.addPage([width, height]);
  let cursor = height - MARGIN;

  const newPage = () => {
    page = pdf.addPage([width, height]);
    cursor = height - MARGIN;
  };

  for (const block of blocks) {
    const size = block.level > 0 ? Math.max(BODY_SIZE + (4 - block.level) * 2.5, BODY_SIZE) : BODY_SIZE;
    const font = block.level > 0 || block.bold ? (block.italic ? boldItalic : bold) : block.italic ? italic : regular;
    const leading = size * 1.4;
    const indent = block.bullet ? 16 : 0;

    // A heading pinned to the bottom of a page, with its paragraph overleaf,
    // is the classic ugly break. Push it forward instead.
    if (block.level > 0 && cursor < MARGIN + leading * 3) newPage();

    const lines = wrapText(
      toWinAnsi(block.bullet ? `\u2022  ${block.text}` : block.text),
      font,
      size,
      usableWidth - indent,
    );

    if (block.level > 0) cursor -= 6;

    for (const line of lines) {
      if (cursor - leading < MARGIN) newPage();
      cursor -= leading;
      page.drawText(line, {
        x: MARGIN + indent,
        y: cursor,
        size,
        font,
        color: rgb(0.1, 0.1, 0.12),
      });
    }

    cursor -= block.level > 0 ? 8 : LINE_HEIGHT - BODY_SIZE + 4;
  }

  const bytes = await pdf.save({ useObjectStreams: true });

  return {
    files: [
      {
        name: `${baseName(file.name)}.pdf`,
        blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
        kind: "pdf",
      },
    ],
    originalBytes: file.size,
    note: {
      fr: "Le texte, les titres, les listes, le gras et l'italique sont conservés. Les polices exactes, les tableaux, les images et les sauts de page d'origine ne le sont pas. Si vous avez Word, Google Docs ou LibreOffice sous la main, leur export PDF restera plus fidèle.",
      en: "Text, headings, lists, bold and italic are kept. Exact fonts, tables, images and the original page breaks are not. If you have Word, Google Docs or LibreOffice to hand, their own PDF export will still be more faithful.",
    },
  };
}

/**
 * Reduce mammoth's HTML to the handful of shapes this layout can honour.
 *
 * Deliberately shallow. Anything richer — a table, a floated image — would be
 * silently mangled by the renderer below, and a silently mangled document is
 * the exact failure this tool is trying not to ship. Tables lose their grid
 * and keep their text, which is the least surprising of the bad options.
 */
function blocksFrom(html: string): Block[] {
  const container = document.createElement("div");
  container.innerHTML = html;

  const blocks: Block[] = [];

  const visit = (node: Element, inherited: { bold: boolean; italic: boolean }) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();

      if (/^h[1-6]$/.test(tag)) {
        const text = (child.textContent ?? "").trim();
        if (text) blocks.push({ text, level: Number(tag[1]), bullet: false, bold: true, italic: false });
        continue;
      }

      if (tag === "ul" || tag === "ol") {
        for (const item of Array.from(child.children)) {
          const text = (item.textContent ?? "").trim();
          if (text) blocks.push({ text, level: 0, bullet: true, ...inherited });
        }
        continue;
      }

      if (tag === "p") {
        const text = (child.textContent ?? "").trim();
        if (!text) continue;
        // Whole-paragraph emphasis is worth keeping; emphasis on three words
        // inside a sentence is not worth splitting the paragraph for.
        const strong = child.querySelector("strong, b");
        const em = child.querySelector("em, i");
        blocks.push({
          text,
          level: 0,
          bullet: false,
          bold: Boolean(strong && strong.textContent?.trim() === text),
          italic: Boolean(em && em.textContent?.trim() === text),
        });
        continue;
      }

      if (child.children.length > 0) {
        visit(child, inherited);
        continue;
      }

      const text = (child.textContent ?? "").trim();
      if (text) blocks.push({ text, level: 0, bullet: false, ...inherited });
    }
  };

  visit(container, { bold: false, italic: false });
  return blocks;
}
