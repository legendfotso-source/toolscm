"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { suffixName } from "@/lib/files";
import { loadPdfLib, parsePageRange, readPdfDocument } from "@/lib/tools/pdf-utils";

const options: OptionDescriptor[] = [
  {
    id: "angle",
    type: "cards",
    label: { fr: "Rotation", en: "Rotation" },
    default: "90",
    choices: [
      { value: "90", label: { fr: "90° à droite", en: "90° right" } },
      { value: "180", label: { fr: "180°", en: "180°" } },
      { value: "270", label: { fr: "90° à gauche", en: "90° left" } },
    ],
  },
  {
    id: "pages",
    type: "text",
    label: { fr: "Pages à pivoter", en: "Pages to rotate" },
    default: "",
    placeholder: { fr: "1-3, 5 — vide = toutes", en: "1-3, 5 — empty = all" },
    hint: {
      fr: "Laissez vide pour faire pivoter tout le document.",
      en: "Leave empty to rotate the whole document.",
    },
  },
];

export default function RotatePdfTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      actionLabel={{ fr: "Pivoter le PDF", en: "Rotate the PDF" }}
    />
  );
}

async function run({ files, options: values }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const document = await readPdfDocument(file);
  const { degrees } = await loadPdfLib();

  const added = Number(values.angle ?? 90);
  const indices = parsePageRange(String(values.pages ?? ""), document.getPageCount());
  const pages = document.getPages();

  for (const index of indices) {
    const page = pages[index];
    // Rotation is cumulative: a page already at 90° must end at 180°, not 90°.
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + added) % 360));
  }

  const bytes = await document.save({ useObjectStreams: true });

  return {
    files: [
      {
        name: suffixName(file.name, "pivote", "pdf"),
        blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
        kind: "pdf",
      },
    ],
    originalBytes: file.size,
  };
}
