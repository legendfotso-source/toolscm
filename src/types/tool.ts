import type { LocalizedText } from "@/lib/i18n/dictionaries";

export type ToolCategory = "pdf" | "image" | "utility";

/**
 * AVAILABLE  — published, fully working.
 * BETA       — working, but with a caveat we show the user (device limits, model size).
 * COMING_SOON— listed so people can find it, explicitly not usable. Never faked.
 */
export type ToolStatus = "AVAILABLE" | "BETA" | "COMING_SOON";

/**
 * client — the file is read and processed in the browser; it is never uploaded.
 * server — the file would be sent to a server. No tool uses this today; the mode
 *          exists so that the privacy badge can tell the truth if one ever does.
 * none   — the tool takes no file at all (text or form input only).
 */
export type ProcessingMode = "client" | "server" | "none";

export type ToolFaqEntry = {
  q: LocalizedText;
  a: LocalizedText;
};

export type ToolDefinition = {
  /** URL slug: /tool/<id> — permanent, never change once published. */
  id: string;
  /** A tool can legitimately belong to two sections (JPG → PDF is both). */
  categories: ToolCategory[];
  status: ToolStatus;
  processingMode: ProcessingMode;
  /** Key into the icon map in components/ToolIcon.tsx */
  icon: string;
  popular?: boolean;
  /** Accepts more than one file at a time. */
  multiple: boolean;
  /** MIME types for the file input's accept attribute and validation. */
  mimeTypes: string[];
  /** Lowercase extensions, without the dot — the second half of validation. */
  extensions: string[];
  /** Human label shown under the upload zone, e.g. "PDF" or "JPG, PNG, WebP". */
  formatsLabel: string;
  /** Per-file limit in bytes. */
  maxFileSize: number;

  name: LocalizedText;
  /** One line on the tool card. */
  short: LocalizedText;
  /** Page H1 — written for search, not identical to the card name. */
  h1: LocalizedText;
  subtitle: LocalizedText;
  seoTitle: LocalizedText;
  seoDescription: LocalizedText;
  /** Extra search terms in both languages, lowercase, unaccented. */
  keywords: string[];
  faq: ToolFaqEntry[];
  /** Two or three sentences of genuine explanation under the tool. */
  about: LocalizedText[];
};

export type OutputKind = "pdf" | "image" | "text" | "other";

export type OutputFile = {
  name: string;
  blob: Blob;
  kind: OutputKind;
  /** Set for image outputs so the result card can show a real preview. */
  width?: number;
  height?: number;
};

export type ToolResult = {
  files: OutputFile[];
  /** Total bytes of the input, so savings can be computed from real files. */
  originalBytes?: number;
  /** Shown verbatim to the user — used to be honest about a poor result. */
  note?: LocalizedText;
  /** Plain text output (extract text, QR read) shown inline. */
  text?: string;
};

export type ProgressReport =
  | { phase: "indeterminate"; label?: LocalizedText }
  /** Only ever used when the underlying work exposes a real count. */
  | { phase: "determinate"; done: number; total: number; label?: LocalizedText };

export type RunContext = {
  files: File[];
  options: Record<string, string | number | boolean>;
  report: (progress: ProgressReport) => void;
  signal: AbortSignal;
};

export type ToolRunner = (ctx: RunContext) => Promise<ToolResult>;
