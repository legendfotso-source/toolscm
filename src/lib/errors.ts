/**
 * A failure we can explain to a normal person.
 *
 * Every error the user sees goes through this class: the message is a
 * translation key from locales/*.json, never a library exception string.
 * Anything unrecognised is mapped to errors.unexpected instead of leaking
 * "InvalidPDFException" into the interface.
 */
export class ToolError extends Error {
  readonly key: string;
  readonly vars?: Record<string, string | number>;

  constructor(key: string, vars?: Record<string, string | number>) {
    super(key);
    this.name = "ToolError";
    this.key = key;
    this.vars = vars;
  }
}

/** Map a thrown value to a user-facing translation key. */
export function toToolError(error: unknown): ToolError {
  if (error instanceof ToolError) return error;

  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();

  if (
    lower.includes("encrypt") ||
    lower.includes("password") ||
    lower.includes("is encrypted")
  ) {
    return new ToolError("errors.encryptedPdf");
  }
  if (
    lower.includes("invalid pdf") ||
    lower.includes("no pdf header") ||
    lower.includes("failed to parse") ||
    lower.includes("xref") ||
    lower.includes("pdfinvalid")
  ) {
    return new ToolError("errors.invalidPdf");
  }
  if (
    lower.includes("out of memory") ||
    lower.includes("allocation failed") ||
    lower.includes("array buffer allocation") ||
    lower.includes("maximum call stack")
  ) {
    return new ToolError("errors.outOfMemory");
  }
  if (lower.includes("decode") && lower.includes("image")) {
    return new ToolError("errors.invalidImage");
  }

  // The user gets a plain sentence; the real cause goes to the console so a
  // bug report can carry something useful. Nothing technical reaches the page.
  console.error("[Tools.cm] unhandled processing error:", error);
  return new ToolError("errors.unexpected");
}
