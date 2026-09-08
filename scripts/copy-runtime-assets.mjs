// Copies the pdf.js runtime assets into public/ so they are served from our
// own origin. pdf.js fetches these lazily, and only for documents that need
// them: CMaps for CJK encodings, standard_fonts for PDFs that reference the
// base-14 fonts without embedding them, wasm for JPEG 2000 / JBIG2 images.
//
// They are not committed to the repository — this runs before dev and build.

import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "pdfjs-dist");
const target = join(root, "public", "pdfjs");

const FOLDERS = ["cmaps", "standard_fonts", "wasm", "iccs"];

if (!existsSync(source)) {
  console.error("pdfjs-dist is not installed — run npm install first.");
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

for (const folder of FOLDERS) {
  const from = join(source, folder);
  if (!existsSync(from)) continue;
  await cp(from, join(target, folder), { recursive: true });
}

console.log("pdf.js assets copied to public/pdfjs");

// browser-image-compression spawns a web worker that, by default, pulls the
// library from a public CDN. That would contradict the privacy promise on the
// page and break on a connection that cannot reach it, so we serve our own copy.
const vendorDir = join(root, "public", "vendor");
const bicSource = join(
  root,
  "node_modules",
  "browser-image-compression",
  "dist",
  "browser-image-compression.js",
);

if (existsSync(bicSource)) {
  await mkdir(vendorDir, { recursive: true });
  await cp(bicSource, join(vendorDir, "browser-image-compression.js"));
  console.log("browser-image-compression copied to public/vendor");
} else {
  console.warn("browser-image-compression dist not found — skipping");
}
