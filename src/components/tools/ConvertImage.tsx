"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { OutputFile, RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { baseName } from "@/lib/files";
import { canvasToBlob, context2d, createCanvas, decodeImage, releaseCanvas } from "@/lib/tools/canvas";

const toJpegOptions: OptionDescriptor[] = [
  {
    id: "quality",
    type: "range",
    label: { fr: "Qualité", en: "Quality" },
    default: 92,
    min: 50,
    max: 100,
    step: 1,
    unit: " %",
  },
  {
    id: "background",
    type: "color",
    label: { fr: "Couleur de fond", en: "Background colour" },
    default: "#ffffff",
    hint: {
      fr: "Le JPG ne gère pas la transparence : les zones transparentes prennent cette couleur.",
      en: "JPG has no transparency: transparent areas take this colour.",
    },
  },
];

/**
 * One component for both directions. The target format comes from the tool
 * definition, so /tool/jpg-to-png and /tool/png-to-jpg stay separate pages
 * with their own copy and their own search intent, without duplicated code.
 */
export default function ConvertImageTool({ tool }: { tool: ToolDefinition }) {
  const toPng = tool.id === "jpg-to-png";

  return (
    <ToolWorkbench
      tool={tool}
      options={toPng ? [] : toJpegOptions}
      run={(ctx) => run(ctx, toPng)}
      actionLabel={
        toPng
          ? { fr: "Convertir en PNG", en: "Convert to PNG" }
          : { fr: "Convertir en JPG", en: "Convert to JPG" }
      }
    />
  );
}

async function run(
  { files, options: values, report, signal }: RunContext,
  toPng: boolean,
): Promise<ToolResult> {
  const mime = toPng ? "image/png" : "image/jpeg";
  const extension = toPng ? "png" : "jpg";
  const quality = toPng ? undefined : Number(values.quality ?? 92) / 100;
  const background = String(values.background ?? "#ffffff");

  const outputs: OutputFile[] = [];
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

    const decoded = await decodeImage(file);
    const canvas = createCanvas(decoded.width, decoded.height);
    const ctx = context2d(canvas);

    if (!toPng) {
      // Flatten transparency before encoding, otherwise it composites to black.
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(decoded.source, 0, 0);
    decoded.close();

    const blob = await canvasToBlob(canvas, mime, quality);
    const width = canvas.width;
    const height = canvas.height;
    releaseCanvas(canvas);

    outputs.push({
      name: `${baseName(file.name)}.${extension}`,
      blob,
      kind: "image",
      width,
      height,
    });
  }

  report({ phase: "determinate", done: total, total });

  const grew = outputs.reduce((sum, file) => sum + file.blob.size, 0) > originalBytes;

  return {
    files: outputs,
    originalBytes,
    note:
      toPng && grew
        ? {
            fr: "Le fichier PNG est plus lourd que l'original : c'est normal, le PNG conserve chaque pixel sans perte.",
            en: "The PNG is heavier than the original: that is expected — PNG keeps every pixel losslessly.",
          }
        : undefined,
  };
}
