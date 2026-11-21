"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { suffixName } from "@/lib/files";
import { canvasToBlob, context2d, createCanvas, decodeImage, releaseCanvas } from "@/lib/tools/canvas";
import { loadPdfLib } from "@/lib/tools/pdf-utils";
import { pdfBlob } from "@/lib/tools/pdf-stamp";

/**
 * Photos of paper → a clean scanned PDF.
 *
 * A phone photo of a sheet is grey, yellowish and shadowed. We stretch each
 * channel between the ink and the paper (1st and 90th percentile) (that alone turns grey paper
 * white), then optionally go to greyscale or to pure black-and-white for text,
 * and lay each photo on an A4 page. All of it on the phone, offline.
 */
const A4: [number, number] = [595.28, 841.89];

const options: OptionDescriptor[] = [
  {
    id: "filter",
    type: "cards",
    label: { fr: "Rendu", en: "Look" },
    default: "auto",
    choices: [
      { value: "auto", label: { fr: "Document", en: "Document" }, hint: { fr: "Papier blanc, couleurs gardées.", en: "White paper, colours kept." } },
      { value: "gray", label: { fr: "Niveaux de gris", en: "Greyscale" }, hint: { fr: "Léger et net.", en: "Light and crisp." } },
      { value: "bw", label: { fr: "Noir et blanc", en: "Black & white" }, hint: { fr: "Texte très lisible, fichier minuscule.", en: "Sharpest text, tiny file." } },
      { value: "none", label: { fr: "Photo d'origine", en: "Original photo" }, hint: { fr: "Aucune retouche.", en: "No change." } },
    ],
  },
  {
    id: "page",
    type: "select",
    label: { fr: "Format de page", en: "Page size" },
    default: "a4",
    choices: [
      { value: "a4", label: { fr: "A4 (comme un vrai scanner)", en: "A4 (like a real scanner)" } },
      { value: "fit", label: { fr: "Taille de la photo", en: "Same as the photo" } },
    ],
  },
];

export default function ScanToPdfTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench tool={tool} options={options} run={run} reorderable actionLabel={{ fr: "Créer le PDF scanné", en: "Create the scanned PDF" }} />
  );
}

export function enhance(ctx: CanvasRenderingContext2D, width: number, height: number, filter: string) {
  if (filter === "none") return;
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let i = 0; i < d.length; i += 16) {
    hist[0][d[i]] += 1;
    hist[1][d[i + 1]] += 1;
    hist[2][d[i + 2]] += 1;
  }
  const samples = Math.ceil(d.length / 16);
  const bounds = hist.map((h) => {
    let acc = 0;
    let lo = 0;
    let hi = 255;
    for (let v = 0; v < 256; v += 1) {
      acc += h[v];
      if (acc < samples * 0.01) lo = v;
      if (acc < samples * 0.9) hi = v;
    }
    // The paper is the bright majority; text is often under 1 % of a page,
    // so the dark end is capped well below the paper to keep ink dark.
    const white = Math.max(60, hi);
    return [Math.max(0, Math.min(lo, white - 110)), white] as const;
  });
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      const [lo, hi] = bounds[c];
      d[i + c] = Math.max(0, Math.min(255, ((d[i + c] - lo) * 255) / (hi - lo)));
    }
    if (filter === "gray" || filter === "bw") {
      let y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (filter === "bw") y = y > 165 ? 255 : y < 90 ? 0 : (y - 90) * 3.4;
      d[i] = d[i + 1] = d[i + 2] = y;
    }
  }
  ctx.putImageData(image, 0, 0);
}

async function run({ files, options: values, report, signal }: RunContext): Promise<ToolResult> {
  const filter = String(values.filter ?? "auto");
  const a4 = String(values.page ?? "a4") === "a4";
  const { PDFDocument } = await loadPdfLib();
  const output = await PDFDocument.create();
  let original = 0;

  for (let i = 0; i < files.length; i += 1) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    report({ phase: "determinate", done: i, total: files.length, label: { fr: `Photo ${i + 1} sur ${files.length}`, en: `Photo ${i + 1} of ${files.length}` } });
    original += files[i].size;
    const decoded = await decodeImage(files[i]);
    // 2000 px on the long side ≈ 170 DPI on A4: plenty for text, light to send.
    const scale = Math.min(1, 2000 / Math.max(decoded.width, decoded.height));
    const canvas = createCanvas(decoded.width * scale, decoded.height * scale);
    const ctx = context2d(canvas);
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    decoded.close();
    enhance(ctx, canvas.width, canvas.height, filter);
    const jpeg = await canvasToBlob(canvas, "image/jpeg", filter === "bw" ? 0.6 : 0.72);
    const embedded = await output.embedJpg(await jpeg.arrayBuffer());
    const landscape = canvas.width > canvas.height;
    releaseCanvas(canvas);

    if (a4) {
      const [pw, ph] = landscape ? [A4[1], A4[0]] : A4;
      const page = output.addPage([pw, ph]);
      const margin = 18;
      const fit = Math.min((pw - margin * 2) / embedded.width, (ph - margin * 2) / embedded.height);
      const w = embedded.width * fit;
      const h = embedded.height * fit;
      page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    } else {
      const w = embedded.width * 0.42;
      const h = embedded.height * 0.42;
      output.addPage([w, h]).drawImage(embedded, { x: 0, y: 0, width: w, height: h });
    }
  }

  report({ phase: "determinate", done: files.length, total: files.length });
  const bytes = await output.save({ useObjectStreams: true });
  return {
    files: [{ name: suffixName(files[0].name, "scan", "pdf"), blob: pdfBlob(bytes), kind: "pdf" }],
    originalBytes: original,
  };
}
