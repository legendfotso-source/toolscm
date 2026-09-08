"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { OutputFile, RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { suffixName } from "@/lib/files";
import { canvasToBlob, context2d, createCanvas, decodeImage, releaseCanvas } from "@/lib/tools/canvas";

const options: OptionDescriptor[] = [
  {
    id: "text",
    type: "text",
    label: { fr: "Texte du filigrane", en: "Watermark text" },
    default: "",
    placeholder: { fr: "Ma Boutique · 6XX XX XX XX", en: "My Shop · 6XX XX XX XX" },
  },
  {
    id: "position",
    type: "select",
    label: { fr: "Position", en: "Position" },
    default: "bottom-right",
    choices: [
      { value: "bottom-right", label: { fr: "En bas à droite", en: "Bottom right" } },
      { value: "bottom-left", label: { fr: "En bas à gauche", en: "Bottom left" } },
      { value: "top-right", label: { fr: "En haut à droite", en: "Top right" } },
      { value: "top-left", label: { fr: "En haut à gauche", en: "Top left" } },
      { value: "center", label: { fr: "Au centre", en: "Centre" } },
      { value: "tile", label: { fr: "Répété en diagonale", en: "Repeated diagonally" } },
    ],
  },
  {
    id: "size",
    type: "range",
    label: { fr: "Taille du texte", en: "Text size" },
    default: 5,
    min: 2,
    max: 12,
    step: 1,
    unit: " %",
    hint: {
      fr: "En pourcentage de la largeur de l'image, pour un rendu identique quelle que soit sa taille.",
      en: "As a percentage of the image width, so it looks the same whatever the image size.",
    },
  },
  {
    id: "opacity",
    type: "range",
    label: { fr: "Opacité", en: "Opacity" },
    default: 45,
    min: 10,
    max: 100,
    step: 5,
    unit: " %",
  },
  {
    id: "color",
    type: "color",
    label: { fr: "Couleur", en: "Colour" },
    default: "#ffffff",
  },
];

export default function WatermarkImageTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      actionLabel={{ fr: "Ajouter le filigrane", en: "Add the watermark" }}
      validate={(_files, values) => {
        if (!String(values.text ?? "").trim()) throw new ToolError("errors.emptyText");
      }}
    />
  );
}

async function run({ files, options: values, report, signal }: RunContext): Promise<ToolResult> {
  const text = String(values.text ?? "").trim();
  const position = String(values.position ?? "bottom-right");
  const sizePercent = Number(values.size ?? 5);
  const opacity = Number(values.opacity ?? 45) / 100;
  const color = String(values.color ?? "#ffffff");

  const outputs: OutputFile[] = [];
  let originalBytes = 0;
  const total = files.length;

  for (let index = 0; index < total; index += 1) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const file = files[index];
    originalBytes += file.size;
    report({ phase: "determinate", done: index, total, label: { fr: file.name, en: file.name } });

    const decoded = await decodeImage(file);
    const canvas = createCanvas(decoded.width, decoded.height);
    const ctx = context2d(canvas);
    ctx.drawImage(decoded.source, 0, 0);
    decoded.close();

    drawWatermark(ctx, canvas.width, canvas.height, {
      text,
      position,
      fontSize: Math.max(10, (canvas.width * sizePercent) / 100),
      opacity,
      color,
    });

    const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
    const mime = isPng ? "image/png" : "image/jpeg";
    const blob = await canvasToBlob(canvas, mime, isPng ? undefined : 0.92);
    const width = canvas.width;
    const height = canvas.height;
    releaseCanvas(canvas);

    outputs.push({
      name: suffixName(file.name, "filigrane", isPng ? "png" : "jpg"),
      blob,
      kind: "image",
      width,
      height,
    });
  }

  report({ phase: "determinate", done: total, total });
  return { files: outputs, originalBytes };
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: {
    text: string;
    position: string;
    fontSize: number;
    opacity: number;
    color: string;
  },
): void {
  const { text, position, fontSize, opacity, color } = settings;
  const padding = Math.round(width * 0.03);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  // A light shadow keeps white text readable over a pale product photo.
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = fontSize * 0.12;

  if (position === "tile") {
    const metrics = ctx.measureText(text);
    const stepX = metrics.width + fontSize * 2.5;
    const stepY = fontSize * 3.5;
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const reach = Math.hypot(width, height);
    for (let y = -reach; y < reach; y += stepY) {
      for (let x = -reach; x < reach; x += stepX) {
        ctx.fillText(text, x, y);
      }
    }
    ctx.restore();
    return;
  }

  const [vertical, horizontal] = position === "center" ? ["center", "center"] : position.split("-");

  ctx.textAlign = horizontal === "left" ? "left" : horizontal === "right" ? "right" : "center";
  ctx.textBaseline = vertical === "top" ? "top" : vertical === "bottom" ? "bottom" : "middle";

  const x = horizontal === "left" ? padding : horizontal === "right" ? width - padding : width / 2;
  const y = vertical === "top" ? padding : vertical === "bottom" ? height - padding : height / 2;

  ctx.fillText(text, x, y);
  ctx.restore();
}
