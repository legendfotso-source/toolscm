"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import { CropSurface, applyRatio } from "../CropSurface";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { suffixName } from "@/lib/files";
import { canvasToBlob, context2d, createCanvas, decodeImage, releaseCanvas } from "@/lib/tools/canvas";

const RATIOS: Record<string, number | null> = {
  free: null,
  "1:1": 1,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
};

const hiddenCropOptions: OptionDescriptor[] = [
  { id: "cropX", type: "number", label: { fr: "", en: "" }, default: 0.1, visibleWhen: () => false },
  { id: "cropY", type: "number", label: { fr: "", en: "" }, default: 0.1, visibleWhen: () => false },
  { id: "cropW", type: "number", label: { fr: "", en: "" }, default: 0.8, visibleWhen: () => false },
  { id: "cropH", type: "number", label: { fr: "", en: "" }, default: 0.8, visibleWhen: () => false },
];

const options: OptionDescriptor[] = [
  {
    id: "ratio",
    type: "select",
    label: { fr: "Proportions", en: "Aspect ratio" },
    default: "free",
    choices: [
      { value: "free", label: { fr: "Libre", en: "Free" } },
      { value: "1:1", label: { fr: "Carré 1:1", en: "Square 1:1" } },
      { value: "4:3", label: { fr: "4:3 paysage", en: "4:3 landscape" } },
      { value: "3:4", label: { fr: "3:4 portrait", en: "3:4 portrait" } },
      { value: "16:9", label: { fr: "16:9", en: "16:9" } },
      { value: "9:16", label: { fr: "9:16 vertical", en: "9:16 vertical" } },
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
      { value: "png", label: { fr: "PNG — sans nouvelle perte", en: "PNG — no further loss" } },
    ],
  },
  ...hiddenCropOptions,
];

export default function CropImageTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      actionLabel={{ fr: "Recadrer", en: "Crop" }}
    >
      {({ files, values, setValue }) => (
        <CropSurface
          file={files[0]}
          values={values}
          setValue={setValue}
          ratio={RATIOS[String(values.ratio ?? "free")] ?? null}
        />
      )}
    </ToolWorkbench>
  );
}

async function run({ files, options: values }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const decoded = await decodeImage(file);

  // The frame on screen is the stored rectangle with the chosen ratio applied,
  // so the cut has to go through exactly the same derivation.
  const ratio = RATIOS[String(values.ratio ?? "free")] ?? null;
  const rect = applyRatio(
    {
      x: Number(values.cropX ?? 0),
      y: Number(values.cropY ?? 0),
      w: Number(values.cropW ?? 1),
      h: Number(values.cropH ?? 1),
    },
    ratio ? ratio / (decoded.width / decoded.height) : null,
  );

  const x = Math.round(rect.x * decoded.width);
  const y = Math.round(rect.y * decoded.height);
  const width = Math.round(rect.w * decoded.width);
  const height = Math.round(rect.h * decoded.height);

  if (width < 8 || height < 8) {
    decoded.close();
    throw new ToolError("errors.cropTooSmall");
  }

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

  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(decoded.source, x, y, width, height, 0, 0, width, height);
  decoded.close();

  const blob = await canvasToBlob(canvas, mime, mime === "image/jpeg" ? 0.92 : undefined);
  releaseCanvas(canvas);

  return {
    files: [
      {
        name: suffixName(file.name, "recadre", mime === "image/png" ? "png" : "jpg"),
        blob,
        kind: "image",
        width,
        height,
      },
    ],
    originalBytes: file.size,
  };
}
