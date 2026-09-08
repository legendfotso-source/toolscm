/**
 * Builds the sample files the tool tests run against.
 *
 * Everything here is generated rather than checked in, so the fixtures stay
 * small in git and are always consistent with the library versions installed.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = join(here, "fixtures");

/** A five-page PDF with real, extractable text. */
async function textPdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (let index = 1; index <= 5; index += 1) {
    const page = pdf.addPage([595.28, 841.89]); // A4
    page.drawText(`Document de test — page ${index}`, {
      x: 56,
      y: 760,
      size: 20,
      font: bold,
      color: rgb(0.11, 0.09, 0.13),
    });
    for (let line = 0; line < 24; line += 1) {
      page.drawText(
        `Ligne ${line + 1} de la page ${index}. Texte extractible pour la verification.`,
        { x: 56, y: 700 - line * 22, size: 11, font, color: rgb(0.25, 0.25, 0.28) },
      );
    }
    page.drawRectangle({
      x: 56,
      y: 120,
      width: 480,
      height: 40,
      color: rgb(0.43, 0.16, 0.85),
    });
  }
  return pdf.save();
}

/** Three pages, each a full-page photo — a stand-in for a phone scan. */
async function photoPdf(pngBytes) {
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(pngBytes);
  for (let index = 0; index < 3; index += 1) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }
  return pdf.save();
}

/** A single-page PDF, used to prove merge really concatenates. */
async function onePagePdf(label) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28, 841.89]);
  page.drawText(label, { x: 60, y: 700, size: 28, font, color: rgb(0, 0, 0) });
  return pdf.save();
}

/**
 * A PNG written by hand so the test suite depends on no image library.
 * 8-bit RGBA, with a transparent left half and a violet right half.
 */
function png(width, height, pixel) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const offset = rowStart + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }

  const { deflateSync, crc32 } = getZlib();

  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData) >>> 0);
    return Buffer.concat([length, typeAndData, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function getZlib() {
  const zlib = require("node:zlib");
  return { deflateSync: zlib.deflateSync, crc32: zlib.crc32 };
}

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

export async function buildFixtures() {
  await mkdir(FIXTURES, { recursive: true });

  await writeFile(join(FIXTURES, "document.pdf"), await textPdf());
  await writeFile(join(FIXTURES, "part-a.pdf"), await onePagePdf("PARTIE A"));
  await writeFile(join(FIXTURES, "part-b.pdf"), await onePagePdf("PARTIE B"));

  // A large-ish photo-like PNG: noisy so it does not compress to nothing,
  // which is what makes the compression numbers meaningful.
  await writeFile(
    join(FIXTURES, "photo.png"),
    png(1200, 900, (x, y) => {
      const noise = ((x * 7919 + y * 104729) % 61) - 30;
      return [
        clamp(120 + (x % 255) / 2 + noise),
        clamp(90 + (y % 200) / 2 + noise),
        clamp(200 - (x % 180) / 3 + noise),
        255,
      ];
    }),
  );

  // Half transparent, to prove PNG→JPG flattening and JPG→PDF handling.
  await writeFile(
    join(FIXTURES, "transparent.png"),
    png(400, 400, (x) => (x < 200 ? [0, 0, 0, 0] : [139, 92, 246, 255])),
  );

  // A "scanned" document: three full-page photos, which is what a phone scan
  // actually produces and what raster compression exists to fix.
  await writeFile(
    join(FIXTURES, "scan.pdf"),
    await photoPdf(await readFile(join(FIXTURES, "photo.png"))),
  );

  // Deliberately broken input: the tools must show a readable message.
  await writeFile(
    join(FIXTURES, "broken.pdf"),
    Buffer.from("%PDF-1.7\nthis is not actually a pdf at all\n%%EOF\n"),
  );

  await writeFile(join(FIXTURES, "empty.pdf"), Buffer.alloc(0));

  return FIXTURES;
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = await buildFixtures();
  console.log(`fixtures written to ${dir}`);
}
