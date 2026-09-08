import { ToolError } from "@/lib/errors";
import type { ProgressReport } from "@/types/tool";

/**
 * Where the segmentation model and its wasm runtime are fetched from.
 *
 * The default is the library's own CDN. The user's photo is never sent
 * anywhere — the model comes to the device, not the other way round — but this
 * is still a request to a third party, so it is disclosed on the tool page and
 * in the privacy policy rather than glossed over. Set
 * NEXT_PUBLIC_IMGLY_PUBLIC_PATH to serve the same files from your own origin.
 */
export const MODEL_PUBLIC_PATH = process.env.NEXT_PUBLIC_IMGLY_PUBLIC_PATH || undefined;

export const MODEL_HOST = MODEL_PUBLIC_PATH
  ? safeHost(MODEL_PUBLIC_PATH)
  : "staticimgly.com";

function safeHost(value: string): string {
  try {
    return new URL(value, "https://example.invalid").host || value;
  } catch {
    return value;
  }
}

type ProgressFn = (report: ProgressReport) => void;

/**
 * Isolate the subject and return it as a transparent PNG.
 *
 * The heavy library is imported here and nowhere else, so it is only ever
 * downloaded by someone who actually opened one of the two tools that use it.
 */
export async function cutOutForeground(
  file: File,
  report: ProgressFn,
  signal: AbortSignal,
): Promise<Blob> {
  report({
    phase: "indeterminate",
    label: {
      fr: "Chargement du modèle...",
      en: "Loading the model...",
    },
  });

  let removeBackground;
  try {
    ({ removeBackground } = await import("@imgly/background-removal"));
  } catch {
    throw new ToolError("errors.modelFailed");
  }

  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  try {
    return await removeBackground(file, {
      publicPath: MODEL_PUBLIC_PATH,
      // fp16 is a good balance: noticeably smaller than the full model and
      // still accurate enough on phone photos, which is what most users bring.
      model: "isnet_fp16",
      output: { format: "image/png" },
      progress: (key: string, current: number, total: number) => {
        // The library reports genuine byte counts while fetching, so this is a
        // real percentage — not a decorative one.
        if (key.startsWith("fetch") && total > 0) {
          report({
            phase: "determinate",
            done: current,
            total,
            label: {
              fr: "Téléchargement du modèle (une seule fois)",
              en: "Downloading the model (one time only)",
            },
          });
        } else {
          report({
            phase: "indeterminate",
            label: {
              fr: "Détection du sujet...",
              en: "Detecting the subject...",
            },
          });
        }
      },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    // WebAssembly failures, out-of-memory on low-end phones, unsupported
    // browsers — all of it becomes one honest, actionable message.
    throw new ToolError("errors.modelFailed");
  }
}
