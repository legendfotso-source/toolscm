"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import { ModelDisclosure } from "./RemoveBackground";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { suffixName } from "@/lib/files";
import { canvasToBlob, context2d, createCanvas, decodeImage, releaseCanvas } from "@/lib/tools/canvas";
import { cutOutForeground } from "@/lib/tools/segmentation";

const options: OptionDescriptor[] = [
  {
    id: "strength",
    type: "range",
    label: { fr: "Intensité du flou", en: "Blur strength" },
    default: 12,
    min: 2,
    max: 40,
    step: 2,
    hint: {
      fr: "Un flou léger reste naturel ; un flou fort isole nettement le sujet.",
      en: "A light blur stays natural; a strong one clearly isolates the subject.",
    },
  },
];

export default function BlurBackgroundTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      actionLabel={{ fr: "Flouter l'arrière-plan", en: "Blur the background" }}
    >
      {() => <ModelDisclosure />}
    </ToolWorkbench>
  );
}

async function run({ files, options: values, report, signal }: RunContext): Promise<ToolResult> {
  const file = files[0];

  // The same segmentation as the cut-out tool: if the model is already cached
  // from that one, this starts immediately.
  const cutout = await cutOutForeground(file, report, signal);

  report({
    phase: "indeterminate",
    label: { fr: "Composition de l'image...", en: "Compositing the image..." },
  });

  const original = await decodeImage(file);
  const foreground = await decodeImage(cutout);

  const width = original.width;
  const height = original.height;
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);

  // Blur the full photo first, then lay the sharp subject back over it. The
  // blur radius scales with the image so the effect looks the same on a small
  // photo and on a 12-megapixel one.
  const radius = (Number(values.strength ?? 12) / 1000) * Math.max(width, height);
  ctx.filter = `blur(${radius.toFixed(2)}px)`;
  // Draw slightly oversized so the blur does not pull transparent edges in.
  const bleed = Math.ceil(radius * 2);
  ctx.drawImage(
    original.source,
    -bleed,
    -bleed,
    width + bleed * 2,
    height + bleed * 2,
  );
  ctx.filter = "none";
  ctx.drawImage(foreground.source, 0, 0, width, height);

  original.close();
  foreground.close();

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
  releaseCanvas(canvas);

  return {
    files: [
      {
        name: suffixName(file.name, "fond-floute", "jpg"),
        blob,
        kind: "image",
        width,
        height,
      },
    ],
    originalBytes: file.size,
  };
}
