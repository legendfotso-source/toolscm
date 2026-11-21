import { canvasToBlob, createCanvas, context2d, releaseCanvas } from "@/lib/tools/canvas";

/**
 * Draw a line of text into a transparent PNG.
 *
 * pdf-lib's built-in fonts only cover Latin-1, so a watermark typed with an
 * apostrophe curl, an emoji or a name in another script would throw. Drawing
 * the text with the browser's own fonts and embedding the picture accepts
 * anything the person can type, at the cost of the text not being selectable,
 * which is exactly what a watermark or a stamp wants anyway.
 */
export async function textToPng(
  text: string,
  options: { px?: number; color?: string; weight?: number } = {},
): Promise<{ bytes: ArrayBuffer; width: number; height: number }> {
  const px = options.px ?? 96;
  const font = `${options.weight ?? 800} ${px}px "Helvetica Neue", Arial, system-ui, sans-serif`;
  const probe = context2d(createCanvas(1, 1));
  probe.font = font;
  const width = Math.ceil(probe.measureText(text).width) + px;
  const height = Math.ceil(px * 1.4);
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  ctx.font = font;
  ctx.fillStyle = options.color ?? "#000000";
  ctx.textBaseline = "middle";
  ctx.fillText(text, px / 2, height / 2);
  const blob = await canvasToBlob(canvas, "image/png", 1);
  releaseCanvas(canvas);
  return { bytes: await blob.arrayBuffer(), width, height };
}

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
}
