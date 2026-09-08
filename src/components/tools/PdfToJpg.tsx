"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { OutputFile, RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { baseName } from "@/lib/files";
import { canvasToBlob, releaseCanvas } from "@/lib/tools/canvas";
import { parsePageRange, readPdfJsDocument, renderPdfPage } from "@/lib/tools/pdf-utils";

const options: OptionDescriptor[] = [
  {
    id: "format",
    type: "cards",
    label: { fr: "Format de sortie", en: "Output format" },
    default: "jpg",
    choices: [
      {
        value: "jpg",
        label: { fr: "JPG", en: "JPG" },
        hint: { fr: "Léger, idéal pour partager.", en: "Light, ideal for sharing." },
      },
      {
        value: "png",
        label: { fr: "PNG", en: "PNG" },
        hint: { fr: "Sans perte, plus lourd.", en: "Lossless, heavier." },
      },
    ],
  },
  {
    id: "dpi",
    type: "cards",
    label: { fr: "Résolution", en: "Resolution" },
    default: "150",
    choices: [
      {
        value: "96",
        label: { fr: "Écran (96 DPI)", en: "Screen (96 DPI)" },
        hint: { fr: "Le plus léger.", en: "Lightest." },
      },
      {
        value: "150",
        label: { fr: "Standard (150 DPI)", en: "Standard (150 DPI)" },
        hint: { fr: "Bon compromis.", en: "Good balance." },
      },
      {
        value: "300",
        label: { fr: "Impression (300 DPI)", en: "Print (300 DPI)" },
        hint: { fr: "Net à l'impression.", en: "Sharp when printed." },
      },
    ],
  },
  {
    id: "pages",
    type: "text",
    label: { fr: "Pages à convertir", en: "Pages to convert" },
    default: "",
    placeholder: { fr: "1-3, 7 — vide = toutes", en: "1-3, 7 — empty = all" },
  },
];

export default function PdfToJpgTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      actionLabel={{ fr: "Convertir en images", en: "Convert to images" }}
    />
  );
}

async function run({ files, options: values, report, signal }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const wantsPng = String(values.format ?? "jpg") === "png";
  const mime = wantsPng ? "image/png" : "image/jpeg";
  const extension = wantsPng ? "png" : "jpg";
  const dpi = Number(values.dpi ?? 150);

  const document = await readPdfJsDocument(file);
  const stem = baseName(file.name);

  try {
    const indices = parsePageRange(String(values.pages ?? ""), document.numPages);
    const outputs: OutputFile[] = [];

    for (let position = 0; position < indices.length; position += 1) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const pageNumber = indices[position] + 1;
      report({
        phase: "determinate",
        done: position,
        total: indices.length,
        label: {
          fr: `Page ${pageNumber} sur ${document.numPages}`,
          en: `Page ${pageNumber} of ${document.numPages}`,
        },
      });

      const page = await document.getPage(pageNumber);
      const canvas = await renderPdfPage(page, dpi);
      const blob = await canvasToBlob(canvas, mime, wantsPng ? undefined : 0.9);
      const width = canvas.width;
      const height = canvas.height;
      releaseCanvas(canvas);
      page.cleanup();

      outputs.push({
        name: `${stem}-page-${pageNumber}.${extension}`,
        blob,
        kind: "image",
        width,
        height,
      });
    }

    report({ phase: "determinate", done: indices.length, total: indices.length });

    return { files: outputs, originalBytes: file.size };
  } finally {
    await document.loadingTask.destroy();
  }
}
