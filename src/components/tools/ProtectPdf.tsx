"use client";

import { ToolWorkbench } from "../ToolWorkbench";
import type { OptionDescriptor } from "../ToolOptions";
import type { RunContext, ToolDefinition, ToolResult } from "@/types/tool";
import { ToolError } from "@/lib/errors";
import { suffixName } from "@/lib/files";
import { loadCryptoPdfLib } from "@/lib/tools/pdf-utils";

/**
 * Password-protect a PDF, in the browser.
 *
 * This tool was listed as "coming soon" for a reason worth repeating: badly
 * implemented encryption is worse than none, because it hands someone a false
 * sense of safety about a document they are about to email. It is published
 * now because a maintained library does it properly — AES, the real thing,
 * refused by every reader without the password — and because the round trip is
 * verified by a test rather than by eye.
 *
 * What it does NOT do, said plainly on the page: protect a document from
 * somebody who has the password. A PDF password stops a stranger opening the
 * file. It is not a safe.
 */
const options: OptionDescriptor[] = [
  {
    id: "password",
    type: "text",
    label: { fr: "Mot de passe", en: "Password" },
    default: "",
    placeholder: { fr: "Au moins 4 caractères", en: "At least 4 characters" },
    hint: {
      fr: "Il s'affiche en clair, sur votre propre appareil, pour que vous puissiez le vérifier avant d'envoyer le fichier. Notez-le : personne ne pourra le retrouver, pas même nous.",
      en: "It is shown in plain text, on your own device, so you can check it before sending the file. Write it down: nobody can recover it, us included.",
    },
  },
  {
    id: "allowPrinting",
    type: "toggle",
    label: { fr: "Autoriser l'impression", en: "Allow printing" },
    default: true,
    hint: {
      fr: "Une fois le document ouvert avec le mot de passe. Beaucoup de lecteurs PDF ignorent ce réglage — traitez-le comme une indication, pas comme un verrou.",
      en: "Once the document is open with the password. Many PDF readers ignore this setting — treat it as a hint, not a lock.",
    },
  },
  {
    id: "allowCopying",
    type: "toggle",
    label: { fr: "Autoriser la copie du texte", en: "Allow copying text" },
    default: true,
  },
];

export default function ProtectPdfTool({ tool }: { tool: ToolDefinition }) {
  return (
    <ToolWorkbench
      tool={tool}
      options={options}
      run={run}
      actionLabel={{ fr: "Protéger le PDF", en: "Protect the PDF" }}
    />
  );
}

async function run({ files, options: values, report }: RunContext): Promise<ToolResult> {
  const file = files[0];
  const password = String(values.password ?? "").trim();

  // Checked before anything is read, so a mistake costs nothing.
  if (password.length < 4) throw new ToolError("errors.passwordTooShort");

  report({ phase: "indeterminate", label: { fr: "Chiffrement…", en: "Encrypting…" } });

  const { PDFDocument } = await loadCryptoPdfLib();

  let document;
  try {
    document = await PDFDocument.load(await file.arrayBuffer());
  } catch (error) {
    // A PDF that already has a password cannot be re-protected without first
    // being opened, and saying so is more useful than "invalid file".
    if (error instanceof Error && /encrypt/i.test(error.message)) {
      throw new ToolError("errors.alreadyProtected");
    }
    throw new ToolError("errors.invalidPdf");
  }

  if (document.getPageCount() === 0) throw new ToolError("errors.noPages");

  await document.encrypt({
    userPassword: password,
    // The same password owns the document. Two different passwords is a
    // distinction almost nobody wants and everybody eventually gets wrong.
    ownerPassword: password,
    permissions: {
      printing: values.allowPrinting ? "highResolution" : undefined,
      copying: Boolean(values.allowCopying),
      modifying: false,
    },
  });

  const bytes = await document.save({ useObjectStreams: false });

  return {
    files: [
      {
        name: suffixName(file.name, "protege", "pdf"),
        blob: new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
        kind: "pdf",
      },
    ],
    originalBytes: file.size,
    note: {
      fr: "Gardez ce mot de passe en lieu sûr. Le chiffrement est réel : sans lui, le document est illisible, et nous n'en avons aucune copie.",
      en: "Keep this password somewhere safe. The encryption is real: without it the document cannot be read, and we hold no copy of it.",
    },
  };
}
