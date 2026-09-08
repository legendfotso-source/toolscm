"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { OutputFile, RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { suffixName } from "@/lib/files";
import { decodeImage } from "@/lib/tools/canvas";

const options: OptionDescriptor[] = [
  {
    id: "quality",
    type: "range",
    label: { fr: "Qualité", en: "Quality" },
    default: 80,
    min: 30,
    max: 95,
    step: 5,
    unit: " %",
    hint: {
      fr: "80 % est presque indiscernable de l'original. En dessous de 50 %, le texte et les aplats se dégradent visiblement.",
      en: "80% is nearly indistinguishable from the original. Below 50%, text and flat colour areas visibly degrade.",
    },
  },
  {
    id: "maxDimension",
    type: "select",
    label: { fr: "Largeur ou hauteur maximale", en: "Maximum width or height" },
    default: "1920",
    choices: [
      { value: "0", label: { fr: "Ne pas redimensionner", en: "Do not resize" } },
      { value: "3000", label: { fr: "3000 px — impression", en: "3000 px — printing" } },
      { value: "1920", label: { fr: "1920 px — écran (recommandé)", en: "1920 px — screen (recommended)" } },
      { value: "1280", label: { fr: "1280 px — web", en: "1280 px — web" } },
      { value: "800", label: { fr: "800 px — pièce jointe légère", en: "800 px — light attachment" } },
    ],
    hint: {
      fr: "C'est souvent ici que se fait le vrai gain : une photo de téléphone dépasse 4 000 px alors qu'un formulaire n'en affiche que 1 200.",
      en: "This is usually where the real gain is: a phone photo is over 4,000 px while a form only displays 1,200.",
    },
  },
  {
    id: "format",
    type: "select",
    label: { fr: "Format de sortie", en: "Output format" },
    default: "jpeg",
    choices: [
      { value: "jpeg", label: { fr: "JPG — le plus léger", en: "JPG — lightest" } },
      { value: "webp", label: { fr: "WebP — encore plus léger", en: "WebP — lighter still" } },
      { value: "keep", label: { fr: "Conserver le format d'origine", en: "Keep the original format" } },
    ],
  },
];

export default function CompressImageTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      actionLabel={{ fr: "Compresser", en: "Compress" }}
    />
  );
}

async function run({ files, options: values, report, signal }: RunContext): Promise<ToolResult> {
  const { default: imageCompression } = await import("browser-image-compression");

  const quality = Number(values.quality ?? 80) / 100;
  const maxDimension = Number(values.maxDimension ?? 0);
  const formatChoice = String(values.format ?? "jpeg");

  const outputs: OutputFile[] = [];
  let originalBytes = 0;
  let anyGrew = false;
  const total = files.length;

  for (let index = 0; index < total; index += 1) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const file = files[index];
    originalBytes += file.size;

    const fileType =
      formatChoice === "keep"
        ? undefined
        : formatChoice === "webp"
          ? "image/webp"
          : "image/jpeg";

    const compressed = await imageCompression(file, {
      // The library reports genuine progress, so the bar shows a real figure.
      onProgress: (percent: number) => {
        report({
          phase: "determinate",
          done: index * 100 + percent,
          total: total * 100,
          label: { fr: file.name, en: file.name },
        });
      },
      useWebWorker: true,
      initialQuality: quality,
      maxWidthOrHeight: maxDimension > 0 ? maxDimension : undefined,
      fileType,
      // Serve the worker's copy of the library from our own origin. Left at
      // its default this would fetch from a public CDN — which would break the
      // "nothing leaves your device" promise and fail on a blocked connection.
      libURL: "/vendor/browser-image-compression.js",
      alwaysKeepResolution: maxDimension === 0,
      signal,
    });

    if (compressed.size >= file.size) anyGrew = true;

    const extension =
      formatChoice === "webp"
        ? "webp"
        : formatChoice === "jpeg"
          ? "jpg"
          : (file.name.split(".").pop() ?? "jpg").toLowerCase();

    const decoded = await decodeImage(compressed);
    const { width, height } = decoded;
    decoded.close();

    outputs.push({
      name: suffixName(file.name, "compresse", extension),
      blob: compressed,
      kind: "image",
      width,
      height,
    });
  }

  report({ phase: "determinate", done: total * 100, total: total * 100 });

  return {
    files: outputs,
    originalBytes,
    note: anyGrew
      ? {
          fr: "Au moins un fichier n'a pas pu être allégé : il était déjà bien optimisé. Baissez la qualité ou réduisez les dimensions, ou gardez simplement l'original.",
          en: "At least one file could not be made lighter: it was already well optimised. Lower the quality or the dimensions, or simply keep the original.",
        }
      : undefined,
  };
}
