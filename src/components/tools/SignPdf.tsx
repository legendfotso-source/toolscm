"use client";

import { useEffect, useRef, useState } from "react";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { suffixName } from "@/lib/files";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { context2d, createCanvas, decodeImage, releaseCanvas } from "@/lib/tools/canvas";
import { readPdfDocument } from "@/lib/tools/pdf-utils";
import { pdfBlob, textToPng } from "@/lib/tools/pdf-stamp";

/**
 * Sign a PDF without it ever leaving the phone.
 *
 * Two ways in: draw with a finger, or photograph a signature done on paper.
 * The photo path clears the paper to transparent, so the ink sits on the page
 * like a real signature instead of a grey rectangle. Cameroonian contracts
 * also ask for every page to be initialled: one toggle does that.
 */
const options: OptionDescriptor[] = [
  {
    id: "where",
    type: "select",
    label: { fr: "Page à signer", en: "Page to sign" },
    default: "last",
    choices: [
      { value: "last", label: { fr: "Dernière page", en: "Last page" } },
      { value: "first", label: { fr: "Première page", en: "First page" } },
      { value: "all", label: { fr: "Toutes les pages", en: "Every page" } },
    ],
  },
  {
    id: "position",
    type: "select",
    label: { fr: "Emplacement", en: "Position" },
    default: "bottom-right",
    choices: [
      { value: "bottom-right", label: { fr: "En bas, à droite", en: "Bottom, right" } },
      { value: "bottom-left", label: { fr: "En bas, à gauche", en: "Bottom, left" } },
      { value: "bottom-center", label: { fr: "En bas, au centre", en: "Bottom, centre" } },
    ],
  },
  { id: "size", type: "range", label: { fr: "Taille", en: "Size" }, default: 30, min: 15, max: 60, step: 5, unit: "%" },
  { id: "date", type: "toggle", label: { fr: "Ajouter « Fait le » avec la date du jour", en: "Add today's date under the signature" }, default: true },
  { id: "initials", type: "toggle", label: { fr: "Parapher aussi chaque page (petite signature)", en: "Also initial every page (small signature)" }, default: false },
];

export default function SignPdfTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      actionLabel={{ fr: "Signer le PDF", en: "Sign the PDF" }}
      validate={(_files, values) => {
        if (!String(values.signature ?? "").startsWith("data:image/png")) throw new ToolError("errors.noSignature");
      }}
    >
      {({ setValue }) => <SignaturePad onChange={(url) => setValue("signature", url)} />}
    </ToolWorkbench>
  );
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const { locale } = useLocale();
  const fr = locale !== "en";
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#13235b";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const commit = () => {
    if (canvas.current) onChange(canvas.current.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange("");
  };

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    const decoded = await decodeImage(file);
    const scale = Math.min(1, 900 / decoded.width);
    const work = createCanvas(decoded.width * scale, decoded.height * scale);
    const ctx = context2d(work);
    ctx.drawImage(decoded.source, 0, 0, work.width, work.height);
    decoded.close();
    // Paper → transparent, ink → dark blue-black. Threshold from the mean brightness.
    const data = ctx.getImageData(0, 0, work.width, work.height);
    let sum = 0;
    for (let i = 0; i < data.data.length; i += 4) sum += (data.data[i] + data.data[i + 1] + data.data[i + 2]) / 3;
    const cut = (sum / (data.data.length / 4)) * 0.72;
    for (let i = 0; i < data.data.length; i += 4) {
      const v = (data.data[i] + data.data[i + 1] + data.data[i + 2]) / 3;
      const a = v < cut ? Math.min(255, (cut - v) * 6 + 120) : 0;
      data.data[i] = 19;
      data.data[i + 1] = 35;
      data.data[i + 2] = 91;
      data.data[i + 3] = a;
    }
    ctx.putImageData(data, 0, 0);
    const c = canvas.current;
    const target = c?.getContext("2d");
    if (c && target) {
      const w = c.clientWidth;
      const h = c.clientHeight;
      target.clearRect(0, 0, c.width, c.height);
      const fit = Math.min(w / work.width, h / work.height) * 0.92;
      target.drawImage(work, (w - work.width * fit) / 2, (h - work.height * fit) / 2, work.width * fit, work.height * fit);
      setEmpty(false);
      commit();
    }
    releaseCanvas(work);
  };

  return (
    <div className="mb-5">
      <p className="mb-2 text-[14px] font-semibold">{fr ? "Votre signature" : "Your signature"}</p>
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-violet/40 bg-white">
        <canvas
          ref={canvas}
          data-testid="signature-pad"
          className="block h-44 w-full touch-none"
          onPointerDown={(e) => {
            drawing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            const ctx = e.currentTarget.getContext("2d");
            const [x, y] = point(e);
            ctx?.beginPath();
            ctx?.moveTo(x, y);
            ctx?.lineTo(x + 0.1, y + 0.1);
            ctx?.stroke();
            setEmpty(false);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = e.currentTarget.getContext("2d");
            const [x, y] = point(e);
            ctx?.lineTo(x, y);
            ctx?.stroke();
          }}
          onPointerUp={() => {
            drawing.current = false;
            commit();
          }}
          onPointerCancel={() => {
            drawing.current = false;
            commit();
          }}
        />
        {empty ? (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-[14px] text-ink/40">
            {fr ? "Signez ici avec le doigt" : "Sign here with your finger"}
          </p>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[13.5px] font-semibold">
        <button type="button" onClick={clear} className="min-h-10 rounded-full border border-ink/15 px-4">
          {fr ? "Effacer" : "Clear"}
        </button>
        <label className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-ink/15 px-4">
          {fr ? "Photo d'une signature sur papier" : "Photo of a signature on paper"}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => fromPhoto(e.target.files?.[0])} />
        </label>
      </div>
    </div>
  );
}

function dataUrlBytes(url: string): Uint8Array {
  const binary = atob(url.split(",")[1] ?? "");
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Crop the transparent margin around the strokes so sizing is predictable. */
async function trimmed(url: string): Promise<Uint8Array> {
  const blob = new Blob([dataUrlBytes(url) as unknown as BlobPart], { type: "image/png" });
  const decoded = await decodeImage(blob);
  const c = createCanvas(decoded.width, decoded.height);
  const ctx = context2d(c);
  ctx.drawImage(decoded.source, 0, 0);
  decoded.close();
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 <= x0 || y1 <= y0) throw new ToolError("errors.noSignature");
  const pad = 6;
  const out = createCanvas(x1 - x0 + pad * 2, y1 - y0 + pad * 2);
  context2d(out).drawImage(c, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
  const bytes = dataUrlBytes(out.toDataURL("image/png"));
  releaseCanvas(c);
  releaseCanvas(out);
  return bytes;
}

async function run({ files, options: values, report }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const signature = String(values.signature ?? "");
  if (!signature.startsWith("data:image/png")) throw new ToolError("errors.noSignature");

  const document = await readPdfDocument(file);
  const image = await document.embedPng(await trimmed(signature));
  const ratio = image.height / image.width;
  const pages = document.getPages();
  const where = String(values.where ?? "last");
  const position = String(values.position ?? "bottom-right");
  const share = Math.min(0.6, Math.max(0.15, Number(values.size ?? 30) / 100));
  const withDate = values.date === true;
  const initials = values.initials === true;
  const today = new Date();
  const dateLine = `${today.getDate().toString().padStart(2, "0")}/${(today.getMonth() + 1).toString().padStart(2, "0")}/${today.getFullYear()}`;
  const dateStamp = withDate ? await textToPng(dateLine, { px: 40, weight: 500, color: "#1f2937" }) : null;
  const dateImage = dateStamp ? await document.embedPng(dateStamp.bytes) : null;

  const signed = new Set<number>(
    where === "all" ? pages.map((_, i) => i) : [where === "first" ? 0 : pages.length - 1],
  );

  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const margin = Math.max(24, width * 0.06);
    if (signed.has(index)) {
      const w = width * share;
      const h = w * ratio;
      const x = position === "bottom-left" ? margin : position === "bottom-center" ? (width - w) / 2 : width - margin - w;
      const y = margin + (dateImage ? 16 : 0);
      page.drawImage(image, { x, y, width: w, height: h });
      if (dateImage && dateStamp) {
        const dw = Math.min(w, 90);
        page.drawImage(dateImage, { x, y: y - 16, width: dw, height: dw * (dateStamp.height / dateStamp.width) });
      }
    } else if (initials) {
      const w = width * 0.09;
      page.drawImage(image, { x: width - margin - w, y: margin * 0.6, width: w, height: w * ratio });
    }
    report({ phase: "determinate", done: index + 1, total: pages.length });
  });

  const bytes = await document.save({ useObjectStreams: true });
  return {
    files: [{ name: suffixName(file.name, "signe", "pdf"), blob: pdfBlob(bytes), kind: "pdf" }],
  };
}
