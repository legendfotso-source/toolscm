"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { suffixName } from "@/lib/files";
import { loadCryptoPdfLib } from "@/lib/tools/pdf-utils";

/**
 * Remove a password from a PDF you can already open.
 *
 * The password is required, and that is the whole design. This tool does not
 * break encryption and will never try: it opens the document the way a reader
 * does, with the password its owner types, and saves a copy without it. If
 * somebody does not know the password, the honest answer is that we cannot
 * help — and the page says exactly that rather than leaving them hoping.
 *
 * It matters because a bank statement or a payslip arrives locked, and every
 * other tool on this site — compressing it to email it, splitting out one page
 * — refuses a locked file. This is the step that makes the rest usable.
 */
const options: OptionDescriptor[] = [
  {
    id: "password",
    type: "text",
    label: { fr: "Mot de passe du document", en: "The document's password" },
    default: "",
    placeholder: { fr: "Le mot de passe que vous connaissez", en: "The password you know" },
    hint: {
      fr: "Sans lui, rien n'est possible : le document est chiffré, pas simplement caché. Nous ne pouvons pas le deviner et nous ne le tenterons pas.",
      en: "Without it nothing is possible: the document is encrypted, not merely hidden. We cannot guess it and will not try.",
    },
  },
];

export default function UnlockPdfTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      actionLabel={{ fr: "Retirer la protection", en: "Remove the protection" }}
    />
  );
}

async function run({ files, options: values, report }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const password = String(values.password ?? "");

  report({ phase: "indeterminate", label: { fr: "Ouverture…", en: "Opening…" } });

  const { PDFDocument } = await loadCryptoPdfLib();
  const bytes = await file.arrayBuffer();

  let document;
  try {
    document = await PDFDocument.load(bytes, { password, ignoreEncryption: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Distinguish "you typed it wrong" from "this file is broken". They call
    // for completely different next actions from the person holding the phone.
    if (/password|encrypt/i.test(message)) throw new ToolError("errors.wrongPassword");
    throw new ToolError("errors.invalidPdf");
  }

  if (document.getPageCount() === 0) throw new ToolError("errors.noPages");

  // Saving a loaded document writes it out unencrypted; nothing further is
  // needed to strip the protection.
  const out = await document.save({ useObjectStreams: false });

  return {
    files: [
      {
        name: suffixName(file.name, "deverrouille", "pdf"),
        blob: new Blob([out as unknown as BlobPart], { type: "application/pdf" }),
        kind: "pdf",
      },
    ],
    originalBytes: file.size,
    note: {
      fr: "Ce document n'est plus protégé. Il s'ouvre maintenant sans mot de passe, pour vous comme pour toute personne à qui vous l'envoyez.",
      en: "This document is no longer protected. It now opens with no password — for you, and for anybody you send it to.",
    },
  };
}
