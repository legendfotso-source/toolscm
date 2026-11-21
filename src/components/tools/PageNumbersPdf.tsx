"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { suffixName } from "@/lib/files";
import { loadPdfLib, readPdfDocument } from "@/lib/tools/pdf-utils";
import { pdfBlob } from "@/lib/tools/pdf-stamp";

const options: OptionDescriptor[] = [
  {
    id: "position",
    type: "select",
    label: { fr: "Emplacement", en: "Position" },
    default: "bottom-center",
    choices: [
      { value: "bottom-center", label: { fr: "En bas, au centre", en: "Bottom, centre" } },
      { value: "bottom-right", label: { fr: "En bas, à droite", en: "Bottom, right" } },
      { value: "bottom-left", label: { fr: "En bas, à gauche", en: "Bottom, left" } },
      { value: "top-right", label: { fr: "En haut, à droite", en: "Top, right" } },
      { value: "top-center", label: { fr: "En haut, au centre", en: "Top, centre" } },
    ],
  },
  {
    id: "style",
    type: "cards",
    label: { fr: "Format", en: "Format" },
    default: "plain",
    choices: [
      { value: "plain", label: { fr: "3", en: "3" } },
      { value: "of", label: { fr: "3 / 12", en: "3 / 12" } },
      { value: "page", label: { fr: "Page 3 sur 12", en: "Page 3 of 12" } },
    ],
  },
  {
    id: "start",
    type: "number",
    label: { fr: "Premier numéro", en: "First number" },
    default: 1,
    min: 0,
    max: 9999,
    step: 1,
  },
  {
    id: "skipFirst",
    type: "toggle",
    label: { fr: "Ne pas numéroter la page de garde", en: "Leave the cover page unnumbered" },
    default: false,
  },
];

export default function PageNumbersPdfTool({ tool }: { tool: ToolDefinition }) {
  return <ToolWorkbench tool={tool} options={options} run={run} />;
}

async function run({ files, options: values, report }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const document = await readPdfDocument(file);
  const { StandardFonts, rgb } = await loadPdfLib();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const pages = document.getPages();
  const skipFirst = values.skipFirst === true;
  const start = Math.max(0, Math.round(Number(values.start ?? 1)));
  const position = String(values.position ?? "bottom-center");
  const style = String(values.style ?? "plain");
  const counted = pages.length - (skipFirst ? 1 : 0);
  const last = start + counted - 1;

  pages.forEach((page, index) => {
    if (skipFirst && index === 0) return;
    const n = start + index - (skipFirst ? 1 : 0);
    const label =
      style === "of" ? `${n} / ${last}` : style === "page" ? `Page ${n} / ${last}` : String(n);
    const { width, height } = page.getSize();
    const size = Math.max(8, Math.min(12, width / 50));
    const textWidth = font.widthOfTextAtSize(label, size);
    const margin = Math.max(20, width * 0.045);
    const x = position.endsWith("right")
      ? width - margin - textWidth
      : position.endsWith("left")
        ? margin
        : (width - textWidth) / 2;
    const y = position.startsWith("top") ? height - margin : margin - size / 2;
    page.drawText(label, { x, y, size, font, color: rgb(0.15, 0.15, 0.2) });
    report({ phase: "determinate", done: index + 1, total: pages.length });
  });

  const bytes = await document.save({ useObjectStreams: true });
  return {
    files: [{ name: suffixName(file.name, "numerote", "pdf"), blob: pdfBlob(bytes), kind: "pdf" }],
  };
}
