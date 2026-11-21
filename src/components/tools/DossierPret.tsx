"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { canvasToBlob, context2d, createCanvas, decodeImage, releaseCanvas } from "@/lib/tools/canvas";
import { copyOrFail, loadPdfLib, readPdfDocument, readPdfJsDocument, renderPdfPage } from "@/lib/tools/pdf-utils";
import { pdfBlob } from "@/lib/tools/pdf-stamp";
import { enhance } from "./ScanToPdf";

/**
 * « Dossier prêt » — the tool nobody else has.
 *
 * Candidates for a concours, a visa or a scholarship are told: "one PDF, under
 * 2 MB". Today that means merge, then compress, then compress again, across
 * three sites. Here: drop the CNI photo, the birth certificate PDF, the
 * diploma scan, in any order and any format, pick the limit, and get ONE PDF
 * guaranteed under it. We try the lossless merge first; only if it is too
 * heavy do we redraw the pages, stepping quality down until it fits.
 */
const A4: [number, number] = [595.28, 841.89];
const LADDER: Array<[number, number]> = [
  [150, 0.8],
  [130, 0.72],
  [110, 0.64],
  [96, 0.56],
  [84, 0.5],
  [72, 0.44],
  [62, 0.38],
  [52, 0.32],
];

const options: OptionDescriptor[] = [
  {
    id: "limit",
    type: "cards",
    label: { fr: "Taille maximale demandée", en: "Maximum size required" },
    default: "2",
    choices: [
      { value: "0.5", label: { fr: "500 Ko", en: "500 KB" } },
      { value: "1", label: { fr: "1 Mo", en: "1 MB" } },
      { value: "2", label: { fr: "2 Mo", en: "2 MB" } },
      { value: "5", label: { fr: "5 Mo", en: "5 MB" } },
    ],
    hint: {
      fr: "Le PDF produit sera toujours sous cette limite, ou nous vous dirons honnêtement que c'est impossible.",
      en: "The PDF we produce will always be under this limit, or we will tell you plainly that it cannot be done.",
    },
  },
  { id: "clean", type: "toggle", label: { fr: "Nettoyer les photos de documents (papier bien blanc)", en: "Clean up photos of documents (white paper)" }, default: true },
  { id: "name", type: "text", label: { fr: "Nom du fichier", en: "File name" }, default: "dossier", placeholder: { fr: "ex. dossier-concours-ENSP-NOM", en: "e.g. visa-application-SURNAME" } },
];

export default function DossierPretTool({ tool }: { tool: ToolDefinition }) {
  return <ToolWorkbench tool={tool} options={options} run={run} reorderable actionLabel={{ fr: "Préparer mon dossier", en: "Prepare my file" }} />;
}

const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

async function lossless(files: File[], clean: boolean) {
  const { PDFDocument } = await loadPdfLib();
  const out = await PDFDocument.create();
  for (const file of files) {
    if (isPdf(file)) {
      const src = await readPdfDocument(file);
      for (const p of await copyOrFail(out, src, src.getPageIndices())) out.addPage(p);
    } else {
      await addImagePage(out, file, 1, clean, 0.85);
    }
  }
  return out.save({ useObjectStreams: true });
}

async function addImagePage(
  out: Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfLib>>["PDFDocument"]["create"]>>,
  file: Blob,
  scaleFactor: number,
  clean: boolean,
  quality: number,
) {
  const decoded = await decodeImage(file);
  const scale = Math.min(1, (2000 * scaleFactor) / Math.max(decoded.width, decoded.height));
  const canvas = createCanvas(decoded.width * scale, decoded.height * scale);
  const ctx = context2d(canvas);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
  decoded.close();
  if (clean) enhance(ctx, canvas.width, canvas.height, "auto");
  const jpeg = await canvasToBlob(canvas, "image/jpeg", quality);
  const landscape = canvas.width > canvas.height;
  releaseCanvas(canvas);
  const img = await out.embedJpg(await jpeg.arrayBuffer());
  const [pw, ph] = landscape ? [A4[1], A4[0]] : A4;
  const page = out.addPage([pw, ph]);
  const fit = Math.min((pw - 36) / img.width, (ph - 36) / img.height);
  page.drawImage(img, { x: (pw - img.width * fit) / 2, y: (ph - img.height * fit) / 2, width: img.width * fit, height: img.height * fit });
}

async function raster(files: File[], dpi: number, quality: number, clean: boolean, signal: AbortSignal) {
  const { PDFDocument } = await loadPdfLib();
  const out = await PDFDocument.create();
  for (const file of files) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (isPdf(file)) {
      const src = await readPdfJsDocument(file);
      try {
        for (let n = 1; n <= src.numPages; n += 1) {
          const page = await src.getPage(n);
          const size = page.getViewport({ scale: 1 });
          const canvas = await renderPdfPage(page, dpi);
          const jpeg = await canvasToBlob(canvas, "image/jpeg", quality);
          releaseCanvas(canvas);
          page.cleanup();
          const img = await out.embedJpg(await jpeg.arrayBuffer());
          out.addPage([size.width, size.height]).drawImage(img, { x: 0, y: 0, width: size.width, height: size.height });
        }
      } finally {
        await src.loadingTask.destroy();
      }
    } else {
      // An A4 page at `dpi` is about 8.27 × dpi pixels wide.
      await addImagePage(out, file, Math.min(1, (11.7 * dpi) / 2000), clean, quality);
    }
  }
  return out.save({ useObjectStreams: true });
}

async function run({ files, options: values, report, signal }: RunContext): Promise<ToolResult> {
  if (files.length === 0) throw new ToolError("errors.needOneFile");
  const limit = values.limit === "0.5" ? 500 * 1024 : Math.round(Number(values.limit ?? 2) * 1024 * 1024);
  const clean = values.clean === true;
  const base = String(values.name ?? "dossier").trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 80) || "dossier";
  const originalBytes = files.reduce((s, f) => s + f.size, 0);
  const total = LADDER.length + 1;

  report({ phase: "determinate", done: 0, total, label: { fr: "Assemblage sans perte…", en: "Lossless assembly…" } });
  let bytes = await lossless(files, clean);
  let lossy = false;

  for (let i = 0; bytes.length > limit && i < LADDER.length; i += 1) {
    const [dpi, q] = LADDER[i];
    report({ phase: "determinate", done: i + 1, total, label: { fr: `Trop lourd : essai à ${dpi} DPI…`, en: `Too heavy: trying ${dpi} DPI…` } });
    bytes = await raster(files, dpi, q, clean, signal);
    lossy = true;
  }
  report({ phase: "determinate", done: total, total });

  const fits = bytes.length <= limit;
  const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} Mo` : `${Math.round(n / 1024)} Ko`);
  const kbEn = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${Math.round(n / 1024)} KB`);

  return {
    files: [{ name: `${base}.pdf`, blob: pdfBlob(bytes), kind: "pdf" }],
    originalBytes,
    note: fits
      ? {
          fr: `Dossier prêt : ${kb(bytes.length)}, sous la limite de ${kb(limit)}.${lossy ? " Les pages ont été redessinées pour tenir : vérifiez la lisibilité avant d'envoyer." : " Aucune perte de qualité."}`,
          en: `File ready: ${kbEn(bytes.length)}, under the ${kbEn(limit)} limit.${lossy ? " Pages were redrawn to fit: check they are readable before sending." : " No loss of quality."}`,
        }
      : {
          fr: `Même au plus fort, le dossier pèse ${kb(bytes.length)} : trop de pages pour ${kb(limit)}. Retirez une pièce ou choisissez une limite plus grande.`,
          en: `Even at the strongest setting the file weighs ${kbEn(bytes.length)}: too many pages for ${kbEn(limit)}. Remove a document or pick a larger limit.`,
        },
  };
}
