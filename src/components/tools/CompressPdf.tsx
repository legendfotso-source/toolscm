"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { suffixName } from "@/lib/files";
import { canvasToBlob, releaseCanvas } from "@/lib/tools/canvas";
import { loadPdfLib, loadPdfLibDocument, readPdfJsDocument, renderPdfPage } from "@/lib/tools/pdf-utils";

/**
 * Two genuinely different strategies, both real:
 *
 * lossless — reload and re-serialise with object streams and cross-reference
 *   streams. Text stays text. Gains are modest and sometimes zero, and we say so.
 *
 * raster — redraw each page through pdf.js at a chosen DPI and re-encode as
 *   JPEG. This is what actually shrinks phone-scanned documents by 80–90%,
 *   at the cost of selectable text. The trade-off is stated on the card.
 */
const RASTER_PRESETS: Record<string, { dpi: number; quality: number }> = {
  high: { dpi: 150, quality: 0.82 },
  balanced: { dpi: 110, quality: 0.68 },
  strong: { dpi: 80, quality: 0.52 },
};

const options: OptionDescriptor[] = [
  {
    id: "mode",
    type: "cards",
    label: { fr: "Niveau de compression", en: "Compression level" },
    default: "balanced",
    choices: [
      {
        value: "lossless",
        label: { fr: "Sans perte", en: "Lossless" },
        hint: {
          fr: "Texte conservé. Gain modéré.",
          en: "Text preserved. Modest gain.",
        },
      },
      {
        value: "high",
        label: { fr: "Qualité élevée", en: "High quality" },
        hint: { fr: "150 DPI. Bon pour l'impression.", en: "150 DPI. Good for printing." },
      },
      {
        value: "balanced",
        label: { fr: "Équilibré", en: "Balanced" },
        hint: { fr: "110 DPI. Lisible à l'écran.", en: "110 DPI. Readable on screen." },
      },
      {
        value: "strong",
        label: { fr: "Compression forte", en: "Strong compression" },
        hint: { fr: "80 DPI. Fichier minimal.", en: "80 DPI. Smallest file." },
      },
    ],
    hint: {
      fr: "Les trois derniers niveaux transforment les pages en images : le texte n'est plus sélectionnable.",
      en: "The last three levels turn pages into images: the text is no longer selectable.",
    },
  },
];

export default function CompressPdfTool({ tool }: { tool: ToolDefinition }) {
  return <ToolWorkbench tool={tool} options={options} run={run} />;
}

async function run({ files, options: values, report, signal }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const mode = String(values.mode ?? "balanced");
  const originalBytes = file.size;

  const blob =
    mode === "lossless" ? await compressLossless(file) : await compressRaster(file, mode, report, signal);

  const grew = blob.size >= originalBytes;

  return {
    files: [
      {
        name: suffixName(file.name, "compresse", "pdf"),
        blob,
        kind: "pdf",
      },
    ],
    originalBytes,
    note: grew
      ? {
          fr: "Ce PDF est déjà optimisé : notre traitement ne l'allège pas. Gardez votre fichier d'origine, ou essayez un niveau de compression plus fort.",
          en: "This PDF is already optimised: our processing does not make it lighter. Keep your original file, or try a stronger compression level.",
        }
      : undefined,
  };
}

async function compressLossless(file: File): Promise<Blob> {
  // updateMetadata: false avoids stamping a fresh ModDate, which only adds bytes.
  const document = await loadPdfLibDocument(await file.arrayBuffer(), {
    updateMetadata: false,
  });
  const bytes = await document.save({ useObjectStreams: true });
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}

async function compressRaster(
  file: File,
  mode: string,
  report: RunContext["report"],
  signal: AbortSignal,
): Promise<Blob> {
  const preset = RASTER_PRESETS[mode] ?? RASTER_PRESETS.balanced;
  const source = await readPdfJsDocument(file);
  const { PDFDocument } = await loadPdfLib();
  const output = await PDFDocument.create();
  const total = source.numPages;

  try {
    for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      report({
        phase: "determinate",
        done: pageNumber - 1,
        total,
        label: {
          fr: `Page ${pageNumber} sur ${total}`,
          en: `Page ${pageNumber} of ${total}`,
        },
      });

      const page = await source.getPage(pageNumber);
      // Points, i.e. the physical page size — kept so the output prints the
      // same size as the input regardless of the raster resolution.
      const pointSize = page.getViewport({ scale: 1 });

      const canvas = await renderPdfPage(page, preset.dpi);
      const jpeg = await canvasToBlob(canvas, "image/jpeg", preset.quality);
      releaseCanvas(canvas);
      page.cleanup();

      const embedded = await output.embedJpg(await jpeg.arrayBuffer());
      const pdfPage = output.addPage([pointSize.width, pointSize.height]);
      pdfPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: pointSize.width,
        height: pointSize.height,
      });
    }

    report({ phase: "determinate", done: total, total });
    const bytes = await output.save({ useObjectStreams: true });
    return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  } finally {
    await source.loadingTask.destroy();
  }
}
