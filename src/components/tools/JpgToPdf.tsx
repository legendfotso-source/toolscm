"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { canvasToBlob, context2d, createCanvas, decodeImage, releaseCanvas } from "@/lib/tools/canvas";
import { loadPdfLib } from "@/lib/tools/pdf-utils";

/** Page sizes in PDF points (1 pt = 1/72 inch). */
const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

const MM_TO_PT = 72 / 25.4;

const options: OptionDescriptor[] = [
  {
    id: "pageSize",
    type: "cards",
    label: { fr: "Format de page", en: "Page size" },
    default: "a4",
    choices: [
      { value: "a4", label: { fr: "A4", en: "A4" }, hint: { fr: "210 × 297 mm", en: "210 × 297 mm" } },
      {
        value: "letter",
        label: { fr: "Letter", en: "Letter" },
        hint: { fr: "216 × 279 mm", en: "216 × 279 mm" },
      },
      {
        value: "fit",
        label: { fr: "Ajusté à l'image", en: "Fit to image" },
        hint: { fr: "Aucune marge blanche.", en: "No white margin." },
      },
    ],
  },
  {
    id: "orientation",
    type: "select",
    label: { fr: "Orientation", en: "Orientation" },
    default: "auto",
    visibleWhen: (values) => values.pageSize !== "fit",
    choices: [
      {
        value: "auto",
        label: { fr: "Automatique (selon l'image)", en: "Automatic (follows the image)" },
      },
      { value: "portrait", label: { fr: "Portrait", en: "Portrait" } },
      { value: "landscape", label: { fr: "Paysage", en: "Landscape" } },
    ],
  },
  {
    id: "margin",
    type: "range",
    label: { fr: "Marge", en: "Margin" },
    default: 10,
    min: 0,
    max: 30,
    step: 1,
    unit: " mm",
    visibleWhen: (values) => values.pageSize !== "fit",
  },
];

export default function JpgToPdfTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      reorderable
      actionLabel={{ fr: "Créer le PDF", en: "Create the PDF" }}
    />
  );
}

async function run({ files, options: values, report, signal }: RunContext): Promise<ToolResult> {
  const { PDFDocument } = await loadPdfLib();
  const document = await PDFDocument.create();

  const pageSizeKey = String(values.pageSize ?? "a4");
  const orientation = String(values.orientation ?? "auto");
  const marginPt = Number(values.margin ?? 10) * MM_TO_PT;

  let originalBytes = 0;
  const total = files.length;

  for (let index = 0; index < total; index += 1) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const file = files[index];
    originalBytes += file.size;
    report({
      phase: "determinate",
      done: index,
      total,
      label: { fr: file.name, en: file.name },
    });

    const { bytes, mime, width, height } = await toEmbeddable(file);
    const image =
      mime === "image/png"
        ? await document.embedPng(bytes)
        : await document.embedJpg(bytes);

    if (pageSizeKey === "fit") {
      // A page exactly the size of the image, at 72 DPI equivalence.
      const page = document.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      continue;
    }

    const [shortSide, longSide] = PAGE_SIZES[pageSizeKey] ?? PAGE_SIZES.a4;
    const landscape =
      orientation === "landscape" || (orientation === "auto" && width > height);
    const pageWidth = landscape ? longSide : shortSide;
    const pageHeight = landscape ? shortSide : longSide;

    const page = document.addPage([pageWidth, pageHeight]);
    const usableWidth = Math.max(1, pageWidth - marginPt * 2);
    const usableHeight = Math.max(1, pageHeight - marginPt * 2);

    // Contain: the whole image is visible, never cropped, never stretched.
    const scale = Math.min(usableWidth / image.width, usableHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;

    page.drawImage(image, {
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  }

  if (document.getPageCount() === 0) throw new ToolError("errors.needOneFile");

  report({ phase: "determinate", done: total, total });
  const bytes = await document.save({ useObjectStreams: true });

  return {
    files: [
      {
        name: files.length === 1 ? nameFor(files[0].name) : "images.pdf",
        blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
        kind: "pdf",
      },
    ],
    originalBytes,
  };
}

function nameFor(original: string): string {
  const stem = original.replace(/\.[^.]+$/, "");
  return `${stem}.pdf`;
}

/**
 * pdf-lib can embed JPEG and PNG only. WebP — and anything else the browser
 * can decode but pdf-lib cannot embed — is re-encoded to JPEG first.
 */
async function toEmbeddable(
  file: File,
): Promise<{ bytes: ArrayBuffer; mime: string; width: number; height: number }> {
  const decoded = await decodeImage(file);
  const { width, height } = decoded;

  const isJpeg = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
  const isPng = file.type === "image/png" || /\.png$/i.test(file.name);

  if (isJpeg || isPng) {
    decoded.close();
    return { bytes: await file.arrayBuffer(), mime: isPng ? "image/png" : "image/jpeg", width, height };
  }

  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  // WebP may carry transparency; flatten onto white rather than onto black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(decoded.source, 0, 0);
  decoded.close();

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
  releaseCanvas(canvas);
  if (!blob) throw new ToolError("errors.invalidImage");

  return { bytes: await blob.arrayBuffer(), mime: "image/jpeg", width, height };
}
