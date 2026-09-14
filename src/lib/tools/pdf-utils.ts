import { ToolError } from "@/lib/errors";

/**
 * Parse "1-3, 5, 8-10" into zero-based page indices, de-duplicated and sorted.
 * Throws a user-facing error rather than silently ignoring nonsense.
 */
export function parsePageRange(input: string, pageCount: number): number[] {
  const trimmed = input.trim();
  if (!trimmed) {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  const indices = new Set<number>();
  const parts = trimmed.split(/[,;]/);

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    const rangeMatch = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end < 1) throw new ToolError("errors.invalidRange");
      const [from, to] = start <= end ? [start, end] : [end, start];
      for (let page = from; page <= to; page += 1) {
        if (page <= pageCount) indices.add(page - 1);
      }
      continue;
    }

    const single = part.match(/^(\d+)$/);
    if (!single) throw new ToolError("errors.invalidRange");
    const page = Number(single[1]);
    if (page < 1) throw new ToolError("errors.invalidRange");
    if (page <= pageCount) indices.add(page - 1);
  }

  if (indices.size === 0) throw new ToolError("errors.outOfRange");
  return [...indices].sort((a, b) => a - b);
}

/** Format zero-based indices back into "1-3, 5" for filenames and labels. */
export function formatPageList(indices: number[]): string {
  if (indices.length === 0) return "";
  const sorted = [...indices].sort((a, b) => a - b).map((index) => index + 1);
  const groups: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (let i = 1; i <= sorted.length; i += 1) {
    const current = sorted[i];
    if (current !== previous + 1) {
      groups.push(start === previous ? `${start}` : `${start}-${previous}`);
      start = current;
    }
    previous = current;
  }
  return groups.join(",");
}

type PdfLib = typeof import("pdf-lib");

let pdfLibPromise: Promise<PdfLib> | null = null;

/** pdf-lib is ~350 KB — never part of the homepage bundle. */
export function loadPdfLib(): Promise<PdfLib> {
  pdfLibPromise ??= import("pdf-lib");
  return pdfLibPromise;
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsPromise: Promise<PdfJs> | null = null;

/**
 * pdf.js plus its worker.
 *
 * The *legacy* build is deliberate. The modern build of pdf.js 6 uses very
 * recent JavaScript — `Map.prototype.getOrInsertComputed`, among others — and
 * throws on browsers that are only a version or two behind. Our users are on
 * mid-range Android phones whose Chrome is often well behind the newest
 * release, so a build that transpiles and polyfills is not a nicety here; it
 * is the difference between the tool working and the tool failing.
 *
 * The worker is resolved through the bundler, so it is served from our own
 * origin rather than a CDN that may not resolve on a limited connection.
 */
export function loadPdfJs(): Promise<PdfJs> {
  pdfJsPromise ??= (async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return pdfjs;
  })();
  return pdfJsPromise;
}

/**
 * Load a PDF with pdf-lib, turning library failures into readable errors.
 *
 * The page-tree access is inside the same try as the load on purpose: pdf-lib
 * parses lazily, so a truncated or malformed file frequently *loads* without
 * complaint and only throws when the pages are first walked. Catching just the
 * load would let a raw "Cannot read properties of undefined" reach the user.
 */
export async function loadPdfLibDocument(
  bytes: ArrayBuffer,
  options: { updateMetadata?: boolean } = {},
) {
  const { PDFDocument } = await loadPdfLib();
  try {
    const document = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      ...options,
    });
    const pageCount = document.getPageCount();
    if (pageCount === 0) throw new ToolError("errors.noPages");
    return document;
  } catch (error) {
    if (error instanceof ToolError) throw error;
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("encrypt")) throw new ToolError("errors.encryptedPdf");
    throw new ToolError("errors.invalidPdf");
  }
}

export async function readPdfDocument(file: File) {
  return loadPdfLibDocument(await file.arrayBuffer());
}

/**
 * pdf.js fetches CMaps, base-14 font data and a decoder wasm only for the
 * documents that need them. They are served from our own origin (copied into
 * public/pdfjs by `npm run assets`) rather than a CDN, so nothing depends on a
 * third-party host resolving.
 */
const PDFJS_ASSET_BASE = "/pdfjs";

/** Load a PDF with pdf.js (needed whenever pages must actually be drawn). */
export async function readPdfJsDocument(file: File) {
  const pdfjs = await loadPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const task = pdfjs.getDocument({
      data: bytes,
      cMapUrl: `${PDFJS_ASSET_BASE}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_ASSET_BASE}/standard_fonts/`,
      wasmUrl: `${PDFJS_ASSET_BASE}/wasm/`,
      iccUrl: `${PDFJS_ASSET_BASE}/iccs/`,
    });
    return await task.promise;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("password")) throw new ToolError("errors.encryptedPdf");
    throw new ToolError("errors.invalidPdf");
  }
}

/**
 * Render one page onto a fresh canvas at a chosen DPI.
 * PDF user space is 72 units to the inch, so scale = dpi / 72.
 */
export async function renderPdfPage(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof readPdfJsDocument>>["getPage"]>>,
  dpi: number,
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: dpi / 72 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext("2d");
  if (!context) throw new ToolError("errors.outOfMemory");
  // Pages with transparent regions would otherwise composite onto black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport }).promise;
  return canvas;
}

/**
 * Copy pages between documents, mapping a lazy-parse failure to a readable
 * message. pdf-lib can hand back a document that only falls over when its
 * pages are actually walked, and that must not surface as a raw TypeError.
 */
export async function copyOrFail(
  target: Awaited<ReturnType<typeof loadPdfLibDocument>>,
  source: Awaited<ReturnType<typeof loadPdfLibDocument>>,
  indices: number[],
) {
  try {
    return await target.copyPages(source, indices);
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError("errors.invalidPdf");
  }
}

type CryptoPdfLib = typeof import("@cantoo/pdf-lib");

let cryptoPdfLibPromise: Promise<CryptoPdfLib> | null = null;

/**
 * pdf-lib, the fork that can encrypt.
 *
 * Two copies of pdf-lib in the repository is not an accident and not laziness.
 * The upstream package has never shipped encryption — the pull request has sat
 * open for years — so password protection is impossible with it. `@cantoo/pdf-lib`
 * is a maintained fork that adds exactly that, and it is loaded ONLY by the two
 * tools that need it. Every other tool keeps using upstream pdf-lib, so nobody
 * compressing a PDF downloads the encryption code.
 */
export function loadCryptoPdfLib(): Promise<CryptoPdfLib> {
  cryptoPdfLibPromise ??= import("@cantoo/pdf-lib");
  return cryptoPdfLibPromise;
}
