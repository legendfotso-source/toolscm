"use client";

import { useEffect, useState } from "react";
import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { suffixName } from "@/lib/files";
import { canvasToBlob, decodeImage, drawResized, releaseCanvas } from "@/lib/tools/canvas";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Notice } from "../ui";

/** Dimensions people actually need, so nobody has to look them up. */
const PRESETS: Record<string, { width: number; height: number }> = {
  instagramSquare: { width: 1080, height: 1080 },
  instagramPortrait: { width: 1080, height: 1350 },
  whatsappStatus: { width: 1080, height: 1920 },
  profile: { width: 512, height: 512 },
  hd: { width: 1920, height: 1080 },
};

const options: OptionDescriptor[] = [
  {
    id: "preset",
    type: "select",
    label: { fr: "Format", en: "Preset" },
    default: "custom",
    choices: [
      { value: "custom", label: { fr: "Personnalisé", en: "Custom" } },
      { value: "instagramSquare", label: { fr: "Instagram carré — 1080 × 1080", en: "Instagram square — 1080 × 1080" } },
      { value: "instagramPortrait", label: { fr: "Instagram portrait — 1080 × 1350", en: "Instagram portrait — 1080 × 1350" } },
      { value: "whatsappStatus", label: { fr: "Statut WhatsApp — 1080 × 1920", en: "WhatsApp status — 1080 × 1920" } },
      { value: "profile", label: { fr: "Photo de profil — 512 × 512", en: "Profile picture — 512 × 512" } },
      { value: "hd", label: { fr: "HD — 1920 × 1080", en: "HD — 1920 × 1080" } },
    ],
  },
  {
    id: "width",
    type: "number",
    label: { fr: "Largeur", en: "Width" },
    default: 1080,
    min: 1,
    max: 10000,
    unit: "px",
    visibleWhen: (values) => values.preset === "custom",
  },
  {
    id: "height",
    type: "number",
    label: { fr: "Hauteur", en: "Height" },
    default: 1080,
    min: 1,
    max: 10000,
    unit: "px",
    visibleWhen: (values) => values.preset === "custom" && values.keepRatio !== true,
  },
  {
    id: "keepRatio",
    type: "toggle",
    label: { fr: "Conserver les proportions", en: "Keep proportions" },
    default: true,
    hint: {
      fr: "La hauteur est calculée à partir de la largeur pour ne pas déformer l'image.",
      en: "The height is worked out from the width so the image is not distorted.",
    },
    visibleWhen: (values) => values.preset === "custom",
  },
  {
    id: "fit",
    type: "select",
    label: { fr: "Ajustement", en: "Fit" },
    default: "cover",
    visibleWhen: (values) => values.preset !== "custom",
    choices: [
      { value: "cover", label: { fr: "Remplir le cadre (recadre)", en: "Fill the frame (crops)" } },
      { value: "contain", label: { fr: "Image entière (bandes blanches)", en: "Whole image (white bands)" } },
    ],
  },
  {
    id: "format",
    type: "select",
    label: { fr: "Format de sortie", en: "Output format" },
    default: "keep",
    choices: [
      { value: "keep", label: { fr: "Conserver le format", en: "Keep the format" } },
      { value: "jpeg", label: { fr: "JPG", en: "JPG" } },
      { value: "png", label: { fr: "PNG", en: "PNG" } },
    ],
  },
];

export default function ResizeImageTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      actionLabel={{ fr: "Redimensionner", en: "Resize" }}
    >
      {({ files }) => <SourceDimensions file={files[0]} />}
    </ToolWorkbench>
  );
}

function SourceDimensions({ file }: { file: File | undefined }) {
  const { locale } = useLocale();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    decodeImage(file)
      .then((decoded) => {
        if (!cancelled) setSize({ width: decoded.width, height: decoded.height });
        decoded.close();
      })
      .catch(() => setSize(null));
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (!size) return null;

  return (
    <Notice tone="info">
      {locale === "fr"
        ? `Dimensions actuelles : ${size.width} × ${size.height} pixels.`
        : `Current dimensions: ${size.width} × ${size.height} pixels.`}
    </Notice>
  );
}

async function run({ files, options: values }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const decoded = await decodeImage(file);
  const sourceWidth = decoded.width;
  const sourceHeight = decoded.height;

  const presetKey = String(values.preset ?? "custom");
  const preset = PRESETS[presetKey];

  let targetWidth: number;
  let targetHeight: number;
  let mode: "stretch" | "cover" | "contain" = "stretch";

  if (preset) {
    targetWidth = preset.width;
    targetHeight = preset.height;
    mode = String(values.fit ?? "cover") === "contain" ? "contain" : "cover";
  } else {
    targetWidth = Math.round(Number(values.width) || 0);
    const keepRatio = values.keepRatio !== false;
    targetHeight = keepRatio
      ? Math.max(1, Math.round((targetWidth / sourceWidth) * sourceHeight))
      : Math.round(Number(values.height) || 0);
  }

  if (!Number.isFinite(targetWidth) || targetWidth < 1 || targetHeight < 1) {
    decoded.close();
    throw new ToolError("errors.invalidRange");
  }

  const canvas = renderTo(decoded, sourceWidth, sourceHeight, targetWidth, targetHeight, mode);
  decoded.close();

  const formatChoice = String(values.format ?? "keep");
  const originalIsPng = file.type === "image/png" || /\.png$/i.test(file.name);
  const mime =
    formatChoice === "png"
      ? "image/png"
      : formatChoice === "jpeg"
        ? "image/jpeg"
        : originalIsPng
          ? "image/png"
          : "image/jpeg";
  const extension = mime === "image/png" ? "png" : "jpg";

  const blob = await canvasToBlob(canvas, mime, mime === "image/jpeg" ? 0.92 : undefined);
  releaseCanvas(canvas);

  return {
    files: [
      {
        name: suffixName(file.name, `${targetWidth}x${targetHeight}`, extension),
        blob,
        kind: "image",
        width: targetWidth,
        height: targetHeight,
      },
    ],
    originalBytes: file.size,
  };
}

function renderTo(
  decoded: Awaited<ReturnType<typeof decodeImage>>,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: "stretch" | "cover" | "contain",
): HTMLCanvasElement {
  if (mode === "stretch") {
    return drawResized(decoded.source, sourceWidth, sourceHeight, targetWidth, targetHeight);
  }

  const scale =
    mode === "cover"
      ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
      : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);

  const drawWidth = Math.round(sourceWidth * scale);
  const drawHeight = Math.round(sourceHeight * scale);

  // Downscale in steps first, then place the result inside the frame.
  const scaled = drawResized(decoded.source, sourceWidth, sourceHeight, drawWidth, drawHeight);

  const output = document.createElement("canvas");
  output.width = targetWidth;
  output.height = targetHeight;
  const ctx = output.getContext("2d");
  if (!ctx) throw new ToolError("errors.outOfMemory");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(
    scaled,
    Math.round((targetWidth - drawWidth) / 2),
    Math.round((targetHeight - drawHeight) / 2),
  );
  releaseCanvas(scaled);
  return output;
}
