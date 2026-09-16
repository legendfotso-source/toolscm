import { fileSizeLimit, type TierId } from "@/lib/payments/tiers";
import { ToolError } from "./errors";
import type { ToolDefinition } from "@/types/tool";

/**
 * Human file sizes. French uses a comma as the decimal separator and a
 * non-breaking space before the unit; English uses a point and a normal space.
 */
export function formatBytes(bytes: number, locale: "fr" | "en" = "fr"): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return locale === "fr" ? "0 o" : "0 B";

  const units = locale === "fr" ? ["o", "Ko", "Mo", "Go"] : ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  const decimals = value >= 100 || exponent === 0 ? 0 : value >= 10 ? 1 : 2;
  const text = value.toFixed(decimals);
  const separator = locale === "fr" ? "\u00A0" : " ";
  return `${locale === "fr" ? text.replace(".", ",") : text}${separator}${units[exponent]}`;
}

export function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index + 1).toLowerCase();
}

export function baseName(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? name : name.slice(0, index);
}

/**
 * Validate against the tool's declared limits.
 *
 * Both the MIME type and the extension are checked: Android's file picker
 * frequently reports an empty or generic MIME type, so relying on either one
 * alone rejects perfectly good files on exactly the devices we care about.
 */
export function validateFile(
  file: File,
  tool: ToolDefinition,
  tier: TierId = "free",
): void {
  if (file.size === 0) {
    throw new ToolError("errors.emptyFile");
  }
  // The ceiling is the tool's own figure multiplied by what the plan allows.
  // A tier that lifts the limit for a PDF merge should not lift it by the same
  // absolute amount for a passport photo, and the per-tool number already
  // encodes that difference.
  const ceiling = fileSizeLimit(tier, tool.maxFileSize);
  if (file.size > ceiling) {
    throw new ToolError(tier === "free" ? "errors.tooLargeFree" : "errors.tooLarge", {
      size: formatBytes(ceiling),
    });
  }

  const extension = extensionOf(file.name);
  const extensionOk = tool.extensions.includes(extension);
  const mimeOk = file.type ? tool.mimeTypes.includes(file.type) : false;

  if (!extensionOk && !mimeOk) {
    throw new ToolError("errors.wrongType", { formats: tool.formatsLabel });
  }
}

/** The accept attribute for the file input, covering both signals. */
export function acceptAttribute(tool: ToolDefinition): string {
  return [...tool.mimeTypes, ...tool.extensions.map((ext) => `.${ext}`)].join(",");
}

/** Trigger a real download of a real blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function suffixName(original: string, suffix: string, extension: string): string {
  return `${baseName(original)}-${suffix}.${extension}`;
}
