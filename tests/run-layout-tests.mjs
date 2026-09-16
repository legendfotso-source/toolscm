/**
 * The pure text-layout rules the Word converter depends on.
 *
 *   npm run test:layout
 *
 * `tests/run-tool-tests.mjs` already drives these tools through a real browser
 * and reads the words back out of the finished PDF — that is the proof the
 * tools work. This suite exists for the failures a happy-path end-to-end run
 * would never reach: the character that makes pdf-lib throw, the word longer
 * than the column, the paragraph that should not have been split.
 *
 * They are checkable at all because `src/lib/tools/text-layout.ts` imports
 * nothing. That was the point of putting them there.
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const results = [];
let failures = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push(true);
    console.log(`[32mPASS[0m  ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    results.push(false);
    failures += 1;
    console.log(`[31mFAIL[0m  ${name} — ${error.message}`);
  }
}

const out = mkdtempSync(join(tmpdir(), "toolscm-layout-"));
execFileSync(
  join(root, "node_modules", ".bin", "tsc"),
  [
    join(root, "src", "lib", "tools", "text-layout.ts"),
    join(root, "src", "lib", "tools", "zip.ts"),
    "--outDir", out,
    "--module", "esnext",
    "--target", "es2022",
    "--moduleResolution", "bundler",
    "--skipLibCheck",
  ],
  { stdio: "pipe" },
);
writeFileSync(join(out, "package.json"), JSON.stringify({ type: "module" }));

const layout = await import(join(out, "text-layout.js"));
const zip = await import(join(out, "zip.js"));
const { PDFDocument, StandardFonts } = await import("pdf-lib");

const pdf = await PDFDocument.create();
const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
const page = pdf.addPage([400, 200]);

/* ---------------- The character that crashes a conversion ---------------- */

await check("pdf-lib really does throw on a character it cannot encode", async () => {
  // If this ever stops being true, the guard below becomes dead weight and
  // should be deleted rather than kept out of superstition.
  assert.throws(() => page.drawText("Facture 你好", { x: 20, y: 100, size: 12, font: helvetica }));
  return "the guard is still needed";
});

await check("so an unencodable character degrades to a question mark instead", async () => {
  const safe = layout.toWinAnsi("Facture 你好 مرحبا");
  assert.doesNotThrow(() => page.drawText(safe, { x: 20, y: 80, size: 12, font: helvetica }));
  assert.match(safe, /^Facture \?{2} \?{5}$/, `got "${safe}"`);
  return "visible, and the conversion finishes";
});

await check("French accents are never touched", async () => {
  // The site is written in French. Mangling "é" would be the worst possible
  // outcome of a guard meant to prevent crashes.
  const text = "Dépôt à Kribi — reçu n° 12, coût 2 000 FCFA";
  const safe = layout.toWinAnsi(text);
  assert.equal(safe, text);
  assert.doesNotThrow(() => page.drawText(safe, { x: 20, y: 60, size: 12, font: helvetica }));
  return safe;
});

await check("Word's curly quotes become plain ones rather than question marks", async () => {
  const safe = layout.toWinAnsi("“Bonjour” — c’est ‘simple’");
  assert.equal(safe, '"Bonjour" — c\'est \'simple\'');
  return safe;
});

await check("a line separator cannot break out of the text it was pasted into", async () => {
  const safe = layout.toWinAnsi("avant apres fin");
  assert.equal(safe, "avant apres fin");
  return "U+2028 and U+2029 become spaces";
});

/* ---------------- Wrapping ---------------- */

await check("wrapping keeps every word, in order", async () => {
  const sentence =
    "Le present document atteste que le stagiaire a effectue un stage de deux mois au sein du service.";
  const lines = layout.wrapText(sentence, helvetica, 11, 200);

  assert.ok(lines.length > 1, "nothing wrapped at 200pt");
  assert.equal(lines.join(" "), sentence, "a word was dropped, duplicated or reordered");
  return `${lines.length} lines, text identical`;
});

await check("every line but the last fits the column, measured not estimated", async () => {
  const lines = layout.wrapText(
    "Veuillez agreer Monsieur le Directeur l expression de mes salutations distinguees",
    helvetica,
    11,
    180,
  );
  for (const line of lines.slice(0, -1)) {
    assert.ok(
      helvetica.widthOfTextAtSize(line, 11) <= 180,
      `overflows: "${line}" (${helvetica.widthOfTextAtSize(line, 11).toFixed(1)}pt)`,
    );
  }
  return `${lines.length} lines, all within 180pt`;
});

await check("a word longer than the column overflows rather than vanishing", async () => {
  const reference = "REF-2026-CMR-0000000000000000000000";
  assert.deepEqual(layout.wrapText(reference, helvetica, 11, 40), [reference]);
  return "a reference number is never silently truncated";
});

await check("empty text produces one empty line, not a crash", async () => {
  assert.deepEqual(layout.wrapText("   ", helvetica, 11, 200), [""]);
  return "blank paragraphs are survivable";
});

/* ---------------- Paragraphs out of a PDF ---------------- */

await check("wrapped lines rejoin into the paragraph they came from", async () => {
  const raw = "Monsieur le Directeur,\nJe me permets de\nvous ecrire.\n\nVeuillez agreer.\n";
  assert.deepEqual(layout.paragraphsFromLines(raw), [
    "Monsieur le Directeur, Je me permets de vous ecrire.",
    "Veuillez agreer.",
  ]);
  return "2 paragraphs, not 5 fragments";
});

await check("runs of blank lines do not become empty paragraphs", async () => {
  const raw = "Premier.\n\n\n\nDeuxieme.\n\n   \n\nTroisieme.\n";
  assert.deepEqual(layout.paragraphsFromLines(raw), ["Premier.", "Deuxieme.", "Troisieme."]);
  return "3 paragraphs, no blanks between them";
});

await check("a page with nothing on it yields nothing", async () => {
  assert.deepEqual(layout.paragraphsFromLines("\n  \n\n"), []);
  return "which is what lets the tool detect a scan";
});


/* ---------------- The ZIP writer ---------------- */

await check("the checksum matches the published CRC-32 test vector", async () => {
  // Every ZIP reader verifies this. A checksum that is subtly wrong produces
  // an archive that opens and then reports every file as corrupt — a much
  // worse failure than one that never opened at all.
  assert.equal(zip.crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  return "0xcbf43926, the standard vector";
});

await check("an archive we write is one a real unzip program accepts", async () => {
  const { execFileSync: run } = await import("node:child_process");
  const { writeFileSync: write, readFileSync: read } = await import("node:fs");

  const encoder = new TextEncoder();
  const blob = zip.buildZip([
    { name: "rapport.txt", data: encoder.encode("Bonjour Yaoundé") },
    { name: "gros.bin", data: encoder.encode("x".repeat(20000)) },
  ]);
  assert.equal(blob.type, "application/zip");

  const path = join(out, "archive.zip");
  write(path, new Uint8Array(await blob.arrayBuffer()));

  // -t is unzip's own integrity check: headers, sizes, offsets and every CRC.
  assert.match(run("unzip", ["-t", path], { encoding: "utf8" }), /No errors detected/);

  run("unzip", ["-o", "-q", path, "-d", join(out, "unpacked")]);
  assert.equal(read(join(out, "unpacked", "rapport.txt"), "utf8"), "Bonjour Yaoundé");
  return "unzip -t reports no errors, and the accents survived";
});

await check("a filename cannot escape the folder it is extracted into", async () => {
  // Zip Slip. These names come from our own tools rather than from a stranger,
  // which is a reason to be careful anyway and not a reason to write the
  // dangerous form.
  assert.equal(zip.safeEntryName("../../etc/passwd", "x"), "_.._etc_passwd");
  assert.ok(!zip.safeEntryName("a/b/c.pdf", "x").includes("/"));
  assert.ok(!zip.safeEntryName("a\\b\\c.pdf", "x").includes("\\"));
  assert.equal(zip.safeEntryName("", "fallback.pdf"), "fallback.pdf");
  assert.equal(zip.safeEntryName("   ", "fallback.pdf"), "fallback.pdf");
  return "separators flattened, empty names replaced";
});

await check("two files with the same name both survive the archive", async () => {
  // Splitting a PDF produces page-1.pdf twice often enough that losing one
  // silently would be a real bug in a real tool.
  assert.deepEqual(
    zip.uniqueNames(["page.pdf", "page.pdf", "PAGE.pdf", "other.pdf"]),
    ["page.pdf", "page (1).pdf", "PAGE (2).pdf", "other.pdf"],
  );
  return "duplicates numbered, case-insensitively";
});

await check("an empty batch refuses rather than writing an empty archive", async () => {
  assert.throws(() => zip.buildZip([]), /nothing to put/);
  return "no zero-file archive";
});

await check("a date before the ZIP epoch is clamped, not written as a negative year", async () => {
  // MS-DOS dates start in 1980. A negative year is shown as garbage by some
  // readers and refused outright by others.
  const old = zip.dosDateTime(new Date("1970-01-01T00:00:00Z"));
  assert.ok(old.date >= 0 && old.date <= 0xffff, `date out of range: ${old.date}`);
  assert.ok(zip.dosDateTime(new Date("2026-09-16T10:30:00")).date > old.date);
  return "1980 floor, both fit in sixteen bits";
});

console.log("");
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
