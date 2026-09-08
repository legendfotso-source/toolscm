"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { OutputFile, RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { baseName } from "@/lib/files";
import { formatPageList, loadPdfLib, parsePageRange, readPdfDocument, copyOrFail } from "@/lib/tools/pdf-utils";

const options: OptionDescriptor[] = [
  {
    id: "mode",
    type: "cards",
    label: { fr: "Que voulez-vous obtenir ?", en: "What do you want out?" },
    default: "range",
    choices: [
      {
        value: "range",
        label: { fr: "Une plage de pages", en: "A page range" },
        hint: { fr: "Un seul PDF avec les pages choisies.", en: "One PDF with the chosen pages." },
      },
      {
        value: "each",
        label: { fr: "Une page par fichier", en: "One file per page" },
        hint: { fr: "Un PDF distinct par page.", en: "A separate PDF for each page." },
      },
    ],
  },
  {
    id: "pages",
    type: "text",
    label: { fr: "Pages à extraire", en: "Pages to extract" },
    default: "",
    placeholder: { fr: "1-3, 5, 8-10", en: "1-3, 5, 8-10" },
    hint: {
      fr: "Laissez vide pour tout le document. Les pages sont numérotées à partir de 1.",
      en: "Leave empty for the whole document. Pages are numbered from 1.",
    },
  },
];

export default function SplitPdfTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      actionLabel={{ fr: "Diviser le PDF", en: "Split the PDF" }}
    />
  );
}

async function run({ files, options: values, report, signal }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const source = await readPdfDocument(file);
  const { PDFDocument } = await loadPdfLib();

  const pageCount = source.getPageCount();
  const indices = parsePageRange(String(values.pages ?? ""), pageCount);
  const mode = String(values.mode ?? "range");
  const stem = baseName(file.name);

  if (mode === "each") {
    const outputs: OutputFile[] = [];
    for (let position = 0; position < indices.length; position += 1) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      report({
        phase: "determinate",
        done: position,
        total: indices.length,
        label: {
          fr: `Page ${indices[position] + 1}`,
          en: `Page ${indices[position] + 1}`,
        },
      });

      const single = await PDFDocument.create();
      const [page] = await copyOrFail(single, source, [indices[position]]);
      single.addPage(page);
      const bytes = await single.save({ useObjectStreams: true });
      outputs.push({
        name: `${stem}-page-${indices[position] + 1}.pdf`,
        blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
        kind: "pdf",
      });
    }
    report({ phase: "determinate", done: indices.length, total: indices.length });
    return { files: outputs, originalBytes: file.size };
  }

  report({ phase: "indeterminate" });
  const output = await PDFDocument.create();
  const copied = await copyOrFail(output, source, indices);
  for (const page of copied) output.addPage(page);
  const bytes = await output.save({ useObjectStreams: true });

  return {
    files: [
      {
        name: `${stem}-pages-${formatPageList(indices)}.pdf`,
        blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
        kind: "pdf",
      },
    ],
    originalBytes: file.size,
  };
}
