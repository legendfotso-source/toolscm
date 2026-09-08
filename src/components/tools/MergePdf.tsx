"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { loadPdfLib, loadPdfLibDocument } from "@/lib/tools/pdf-utils";

export default function MergePdfTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      run={run}
      reorderable
      actionLabel={{ fr: "Fusionner les PDF", en: "Merge the PDFs" }}
      validate={(files) => {
        if (files.length < 2) throw new ToolError("errors.needTwoFiles");
      }}
    />
  );
}

async function run({ files, report, signal }: RunContext): Promise<ToolResult> {
  const { PDFDocument } = await loadPdfLib();
  const merged = await PDFDocument.create();
  const total = files.length;
  let originalBytes = 0;

  for (let index = 0; index < total; index += 1) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const file = files[index];
    originalBytes += file.size;

    report({
      phase: "determinate",
      done: index,
      total,
      label: { fr: file.name, en: file.name },
    });

    const source = await loadPdfLibDocument(await file.arrayBuffer());

    // copyPages carries the page content across as-is: no recompression,
    // so the merged document keeps the quality of every original.
    let copied;
    try {
      copied = await merged.copyPages(source, source.getPageIndices());
    } catch {
      // A file that loads but cannot be walked is malformed, not unsupported.
      throw new ToolError("errors.invalidPdf");
    }
    for (const page of copied) merged.addPage(page);
  }

  if (merged.getPageCount() === 0) throw new ToolError("errors.noPages");

  report({ phase: "determinate", done: total, total });
  const bytes = await merged.save({ useObjectStreams: true });

  return {
    files: [
      {
        name: "document-fusionne.pdf",
        blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
        kind: "pdf",
      },
    ],
    originalBytes,
  };
}
