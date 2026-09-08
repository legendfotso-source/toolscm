import { ToolError } from "@/lib/errors";

/**
 * Decode an image file into something we can draw.
 *
 * createImageBitmap is faster and avoids a DOM round-trip, but Safari on
 * older iOS and a few Android WebViews either lack it or choke on certain
 * JPEGs, so we fall back to an <img> element.
 */
export async function decodeImage(
  file: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      /* fall through to the <img> path */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new ToolError("errors.invalidImage"));
      element.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new ToolError("errors.outOfMemory");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        // A null blob here almost always means the canvas was too large for
        // the device to serialise.
        else reject(new ToolError("errors.outOfMemory"));
      },
      type,
      quality,
    );
  });
}

/**
 * Downscale in halving steps rather than one jump.
 *
 * A single large downscale in Canvas uses bilinear sampling and produces
 * visibly aliased edges; stepping halves at a time is close to what a proper
 * resampler gives, at a fraction of the code.
 */
export function drawResized(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): HTMLCanvasElement {
  let currentWidth = sourceWidth;
  let currentHeight = sourceHeight;
  let current: CanvasImageSource = source;
  let scratch: HTMLCanvasElement | null = null;

  while (currentWidth > targetWidth * 2 && currentHeight > targetHeight * 2) {
    const nextWidth = Math.max(targetWidth, Math.floor(currentWidth / 2));
    const nextHeight = Math.max(targetHeight, Math.floor(currentHeight / 2));
    const step = createCanvas(nextWidth, nextHeight);
    context2d(step).drawImage(current, 0, 0, nextWidth, nextHeight);
    current = step;
    scratch = step;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  const output = createCanvas(targetWidth, targetHeight);
  context2d(output).drawImage(current, 0, 0, targetWidth, targetHeight);
  if (scratch) {
    scratch.width = 0;
    scratch.height = 0;
  }
  return output;
}

/** Free the memory a canvas holds — matters a lot on low-end Android. */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

export const MIME_BY_FORMAT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Not every browser can encode WebP. Check once rather than silently handing
 * back a PNG with a .webp name.
 */
export function canEncode(mime: string): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL(mime).startsWith(`data:${mime}`);
  } catch {
    return false;
  }
}
