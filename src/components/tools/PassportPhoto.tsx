"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import { CropSurface, applyRatio } from "../CropSurface";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { baseName } from "@/lib/files";
import { canvasToBlob, context2d, createCanvas, decodeImage, releaseCanvas } from "@/lib/tools/canvas";
import { Notice } from "../ui";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const DPI = 300;
const MM_PER_INCH = 25.4;

/** Physical sizes in millimetres. */
const SIZES: Record<string, { widthMm: number; heightMm: number }> = {
  "40x40": { widthMm: 40, heightMm: 40 },
  "35x45": { widthMm: 35, heightMm: 45 },
  "51x51": { widthMm: 50.8, heightMm: 50.8 },
  "25x30": { widthMm: 25, heightMm: 30 },
};

const options: OptionDescriptor[] = [
  {
    id: "size",
    type: "cards",
    label: { fr: "Dimensions", en: "Dimensions" },
    default: "40x40",
    choices: [
      {
        value: "40x40",
        label: { fr: "4 × 4 cm", en: "4 × 4 cm" },
        hint: { fr: "Concours, CNI, dossiers (Cameroun)", en: "Exams, ID cards, files (Cameroon)" },
      },
      {
        value: "35x45",
        label: { fr: "35 × 45 mm", en: "35 × 45 mm" },
        hint: { fr: "Passeport, visa Schengen", en: "Passport, Schengen visa" },
      },
      {
        value: "51x51",
        label: { fr: "2 × 2 pouces", en: "2 × 2 inch" },
        hint: { fr: "Visa américain", en: "US visa" },
      },
      {
        value: "25x30",
        label: { fr: "25 × 30 mm", en: "25 × 30 mm" },
        hint: { fr: "Petit format scolaire", en: "Small school format" },
      },
      { value: "custom", label: { fr: "Personnalisé", en: "Custom" } },
    ],
  },
  {
    id: "customWidth",
    type: "number",
    label: { fr: "Largeur", en: "Width" },
    default: 40,
    min: 10,
    max: 200,
    unit: "mm",
    visibleWhen: (values) => values.size === "custom",
  },
  {
    id: "customHeight",
    type: "number",
    label: { fr: "Hauteur", en: "Height" },
    default: 40,
    min: 10,
    max: 200,
    unit: "mm",
    visibleWhen: (values) => values.size === "custom",
  },
  { id: "cropX", type: "number", label: { fr: "", en: "" }, default: 0.15, visibleWhen: () => false },
  { id: "cropY", type: "number", label: { fr: "", en: "" }, default: 0.1, visibleWhen: () => false },
  { id: "cropW", type: "number", label: { fr: "", en: "" }, default: 0.7, visibleWhen: () => false },
  { id: "cropH", type: "number", label: { fr: "", en: "" }, default: 0.7, visibleWhen: () => false },
];

export default function PassportPhotoTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      actionLabel={{ fr: "Générer la photo", en: "Generate the photo" }}
    >
      {({ files, values, setValue }) => {
        const { widthMm, heightMm } = resolveSize(values);
        return (
          <div className="space-y-3">
            <CropSurface
              file={files[0]}
              values={values}
              setValue={setValue}
              ratio={widthMm / heightMm}
            />
            <ComplianceNotice widthMm={widthMm} heightMm={heightMm} />
          </div>
        );
      }}
    </ToolWorkbench>
  );
}

function ComplianceNotice({ widthMm, heightMm }: { widthMm: number; heightMm: number }) {
  const { locale } = useLocale();
  const pixels = `${mmToPx(widthMm)} × ${mmToPx(heightMm)} px`;

  return (
    <Notice tone="warn">
      {locale === "fr" ? (
        <>
          La photo sera générée à <strong>{pixels}</strong> ({widthMm} × {heightMm} mm à {DPI} DPI).
          Les exigences officielles — proportion du visage, fond, expression, ancienneté — varient
          selon le pays et l&apos;institution. Vérifiez les consignes de l&apos;organisme concerné :
          nous ne pouvons pas garantir l&apos;acceptation.
        </>
      ) : (
        <>
          The photo will be generated at <strong>{pixels}</strong> ({widthMm} × {heightMm} mm at{" "}
          {DPI} DPI). Official requirements — face proportions, background, expression, how recent —
          vary by country and institution. Check the instructions of the body concerned: we cannot
          guarantee acceptance.
        </>
      )}
    </Notice>
  );
}

function resolveSize(values: Record<string, string | number | boolean>) {
  const key = String(values.size ?? "40x40");
  if (key === "custom") {
    return {
      widthMm: clampMm(Number(values.customWidth) || 40),
      heightMm: clampMm(Number(values.customHeight) || 40),
    };
  }
  return SIZES[key] ?? SIZES["40x40"];
}

function clampMm(value: number): number {
  return Math.min(200, Math.max(10, value));
}

function mmToPx(mm: number): number {
  return Math.round((mm / MM_PER_INCH) * DPI);
}

async function run({ files, options: values }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const { widthMm, heightMm } = resolveSize(values);
  const targetWidth = mmToPx(widthMm);
  const targetHeight = mmToPx(heightMm);

  const decoded = await decodeImage(file);

  // The frame is constrained to the photo's aspect ratio on screen, so the cut
  // goes through the same derivation rather than the raw stored values.
  const rect = applyRatio(
    {
      x: Number(values.cropX ?? 0),
      y: Number(values.cropY ?? 0),
      w: Number(values.cropW ?? 1),
      h: Number(values.cropH ?? 1),
    },
    widthMm / heightMm / (decoded.width / decoded.height),
  );

  const sx = Math.round(rect.x * decoded.width);
  const sy = Math.round(rect.y * decoded.height);
  const sw = Math.round(rect.w * decoded.width);
  const sh = Math.round(rect.h * decoded.height);

  if (sw < 8 || sh < 8) {
    decoded.close();
    throw new ToolError("errors.cropTooSmall");
  }

  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = context2d(canvas);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(decoded.source, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
  decoded.close();

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.95);
  releaseCanvas(canvas);

  // Enlarging past the source resolution cannot add detail — say so rather
  // than letting someone print a soft photo and find out at the counter.
  const upscaled = sw < targetWidth || sh < targetHeight;

  return {
    files: [
      {
        name: `${baseName(file.name)}-photo-identite-${widthMm}x${heightMm}mm.jpg`,
        blob,
        kind: "image",
        width: targetWidth,
        height: targetHeight,
      },
    ],
    originalBytes: file.size,
    note: upscaled
      ? {
          fr: "La zone choisie est plus petite que le format demandé : l'image a été agrandie et sera moins nette à l'impression. Utilisez une photo prise de plus près ou de meilleure résolution.",
          en: "The area you chose is smaller than the requested format: the image was enlarged and will print less sharply. Use a photo taken closer or at a higher resolution.",
        }
      : undefined,
  };
}
