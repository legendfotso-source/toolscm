"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { context2d, createCanvas, decodeImage, releaseCanvas } from "@/lib/tools/canvas";

export default function QrReaderTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      run={run}
      actionLabel={{ fr: "Lire le QR code", en: "Read the QR code" }}
    />
  );
}

async function run({ files, report }: RunContext): Promise<ToolResult> {
  const file = files[0];
  report({
    phase: "indeterminate",
    label: { fr: "Analyse de l'image...", en: "Analysing the image..." },
  });

  const { default: jsQR } = await import("jsqr");
  const decoded = await decodeImage(file);

  // Very large photos slow the scan down without helping it; 1600 px on the
  // long edge is comfortably enough for a code that fills part of the frame.
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));

  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  ctx.drawImage(decoded.source, 0, 0, width, height);
  decoded.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  releaseCanvas(canvas);

  const found =
    jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" }) ?? null;

  if (!found || !found.data) {
    throw new ToolError("errors.noQrFound");
  }

  return {
    // The decoded content is shown as text; nothing is opened automatically,
    // so the user can look at a link before deciding to follow it.
    files: [],
    text: found.data,
  };
}
