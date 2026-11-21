"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { suffixName } from "@/lib/files";
import { loadPdfLib, readPdfDocument } from "@/lib/tools/pdf-utils";
import { pdfBlob, textToPng } from "@/lib/tools/pdf-stamp";

const options: OptionDescriptor[] = [
  {
    id: "text",
    type: "text",
    label: { fr: "Texte du filigrane", en: "Watermark text" },
    default: "COPIE",
    placeholder: { fr: "ex. COPIE — usage exclusif concours ENS", en: "e.g. COPY — for visa application only" },
  },
  {
    id: "layout",
    type: "cards",
    label: { fr: "Disposition", en: "Layout" },
    default: "diagonal",
    choices: [
      { value: "diagonal", label: { fr: "En diagonale", en: "Diagonal" }, hint: { fr: "Un grand texte au milieu.", en: "One large line across." } },
      { value: "tiled", label: { fr: "Répété", en: "Tiled" }, hint: { fr: "Difficile à effacer.", en: "Hard to crop out." } },
      { value: "footer", label: { fr: "En pied de page", en: "Footer" }, hint: { fr: "Discret, en bas.", en: "Discreet, at the bottom." } },
    ],
  },
  { id: "opacity", type: "range", label: { fr: "Opacité", en: "Opacity" }, default: 25, min: 5, max: 80, step: 5, unit: "%" },
  { id: "color", type: "color", label: { fr: "Couleur", en: "Colour" }, default: "#c0262d" },
];

export default function WatermarkPdfTool({ tool }: { tool: ToolDefinition }) {
  return <ToolWorkbench tool={tool} options={options} run={run} />;
}

async function run({ files, options: values, report }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const text = String(values.text ?? "").trim();
  if (!text) throw new ToolError("errors.emptyText");
  const layout = String(values.layout ?? "diagonal");
  const opacity = Math.min(0.8, Math.max(0.05, Number(values.opacity ?? 25) / 100));

  const document = await readPdfDocument(file);
  const { degrees } = await loadPdfLib();
  const stamp = await textToPng(text, { px: layout === "footer" ? 48 : 120, color: String(values.color ?? "#c0262d") });
  const image = await document.embedPng(stamp.bytes);
  const ratio = stamp.height / stamp.width;
  const pages = document.getPages();

  pages.forEach((page, index) => {
    const { width, height } = page.getSize();
    if (layout === "footer") {
      const w = Math.min(width * 0.6, stamp.width * 0.3);
      page.drawImage(image, { x: (width - w) / 2, y: 14, width: w, height: w * ratio, opacity });
    } else if (layout === "tiled") {
      const w = width * 0.42;
      const h = w * ratio;
      for (let y = -h; y < height + h; y += h * 3.2) {
        for (let x = -w * 0.3; x < width; x += w * 1.15) {
          page.drawImage(image, { x, y, width: w, height: h, opacity, rotate: degrees(30) });
        }
      }
    } else {
      // Fit along the page diagonal, centred.
      const diagonal = Math.hypot(width, height);
      const angle = Math.atan2(height, width);
      const w = diagonal * 0.75;
      const h = w * ratio;
      const cx = width / 2;
      const cy = height / 2;
      const x = cx - (w / 2) * Math.cos(angle) + (h / 2) * Math.sin(angle);
      const y = cy - (w / 2) * Math.sin(angle) - (h / 2) * Math.cos(angle);
      page.drawImage(image, { x, y, width: w, height: h, opacity, rotate: degrees((angle * 180) / Math.PI) });
    }
    report({ phase: "determinate", done: index + 1, total: pages.length });
  });

  const bytes = await document.save({ useObjectStreams: true });
  return {
    files: [{ name: suffixName(file.name, "filigrane", "pdf"), blob: pdfBlob(bytes), kind: "pdf" }],
  };
}
