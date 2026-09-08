"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { suffixName } from "@/lib/files";
import { loadPdfLib, parsePageRange, readPdfDocument, copyOrFail } from "@/lib/tools/pdf-utils";

const options: OptionDescriptor[] = [
  {
    id: "pages",
    type: "text",
    label: { fr: "Pages à supprimer", en: "Pages to delete" },
    default: "",
    placeholder: { fr: "2, 5-7", en: "2, 5-7" },
    hint: {
      fr: "Séparez par des virgules, utilisez un tiret pour une suite. Les pages sont numérotées à partir de 1.",
      en: "Separate with commas, use a dash for a run. Pages are numbered from 1.",
    },
  },
];

export default function DeletePdfPagesTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      actionLabel={{ fr: "Supprimer les pages", en: "Delete the pages" }}
      validate={(_files, values) => {
        if (!String(values.pages ?? "").trim()) throw new ToolError("errors.invalidRange");
      }}
    />
  );
}

async function run({ files, options: values }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const source = await readPdfDocument(file);
  const { PDFDocument } = await loadPdfLib();

  const pageCount = source.getPageCount();
  const toDelete = new Set(parsePageRange(String(values.pages ?? ""), pageCount));
  const toKeep = Array.from({ length: pageCount }, (_, index) => index).filter(
    (index) => !toDelete.has(index),
  );

  // Deleting every page would produce a file no reader can open.
  if (toKeep.length === 0) throw new ToolError("errors.noPages");

  const output = await PDFDocument.create();
  const copied = await copyOrFail(output, source, toKeep);
  for (const page of copied) output.addPage(page);

  const bytes = await output.save({ useObjectStreams: true });

  return {
    files: [
      {
        name: suffixName(file.name, "modifie", "pdf"),
        blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
        kind: "pdf",
      },
    ],
    originalBytes: file.size,
  };
}
