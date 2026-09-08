"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { baseName } from "@/lib/files";
import { canvasToBlob, context2d, createCanvas, decodeImage, releaseCanvas } from "@/lib/tools/canvas";
import { MODEL_HOST, cutOutForeground } from "@/lib/tools/segmentation";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Notice } from "../ui";

const options: OptionDescriptor[] = [
  {
    id: "output",
    type: "cards",
    label: { fr: "Résultat souhaité", en: "Desired result" },
    default: "transparent",
    choices: [
      {
        value: "transparent",
        label: { fr: "Fond transparent", en: "Transparent background" },
        hint: { fr: "PNG, à poser sur n'importe quel fond.", en: "PNG, to drop on any background." },
      },
      {
        value: "solid",
        label: { fr: "Fond uni", en: "Solid background" },
        hint: { fr: "JPG, prêt pour une fiche produit.", en: "JPG, ready for a product listing." },
      },
    ],
  },
  {
    id: "background",
    type: "color",
    label: { fr: "Couleur de fond", en: "Background colour" },
    default: "#ffffff",
    visibleWhen: (values) => values.output === "solid",
  },
];

export default function RemoveBackgroundTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      transparentPreview
      actionLabel={{ fr: "Supprimer l'arrière-plan", en: "Remove the background" }}
    >
      {() => <ModelDisclosure />}
    </ToolWorkbench>
  );
}

/**
 * The photo genuinely stays on the device. The model does not — it is fetched
 * from a third party — and saying so is the difference between a privacy claim
 * and a privacy promise.
 */
export function ModelDisclosure() {
  const { locale } = useLocale();
  return (
    <Notice tone="info">
      {locale === "fr" ? (
        <>
          Le détourage a lieu sur votre appareil : <strong>votre photo n&apos;est envoyée nulle
          part</strong>. Le modèle qui reconnaît le sujet (environ 40 Mo) est en revanche
          téléchargé depuis <strong>{MODEL_HOST}</strong> au premier usage, puis conservé en cache
          par votre navigateur.
        </>
      ) : (
        <>
          The cut-out happens on your device: <strong>your photo is not sent anywhere</strong>. The
          model that recognises the subject (about 40 MB) is however downloaded from{" "}
          <strong>{MODEL_HOST}</strong> on first use, then kept in your browser&apos;s cache.
        </>
      )}
    </Notice>
  );
}

async function run({ files, options: values, report, signal }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const cutout = await cutOutForeground(file, report, signal);

  if (String(values.output ?? "transparent") === "transparent") {
    const decoded = await decodeImage(cutout);
    const { width, height } = decoded;
    decoded.close();

    return {
      files: [
        {
          name: `${baseName(file.name)}-sans-fond.png`,
          blob: cutout,
          kind: "image",
          width,
          height,
        },
      ],
      originalBytes: file.size,
    };
  }

  report({
    phase: "indeterminate",
    label: { fr: "Application du fond...", en: "Applying the background..." },
  });

  const decoded = await decodeImage(cutout);
  const canvas = createCanvas(decoded.width, decoded.height);
  const ctx = context2d(canvas);
  ctx.fillStyle = String(values.background ?? "#ffffff");
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(decoded.source, 0, 0);
  decoded.close();

  const width = canvas.width;
  const height = canvas.height;
  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
  releaseCanvas(canvas);

  return {
    files: [
      {
        name: `${baseName(file.name)}-fond-uni.jpg`,
        blob,
        kind: "image",
        width,
        height,
      },
    ],
    originalBytes: file.size,
  };
}
