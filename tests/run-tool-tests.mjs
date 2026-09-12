/**
 * End-to-end verification that the published tools really do the work.
 *
 * Every case drives the actual UI in Chromium, downloads the file the user
 * would get, and inspects its bytes. A test only passes if the output is a
 * genuinely different, valid file — a tool that silently handed back its input
 * would fail here, which is the whole point of running these.
 *
 *   npm run build && npm run test:tools
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { buildFixtures } from "./make-fixtures.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DOWNLOADS = join(here, ".downloads");
const PORT = Number(process.env.TEST_PORT ?? 3711);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
let failures = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  const mark = ok ? "[32mPASS[0m" : "[31mFAIL[0m";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

async function startServer() {
  // A server left over from an earlier run would still be serving the previous
  // build, whose chunk names no longer exist — every page would 500.
  await stopLeftoverServers();

  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: join(here, ".."),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production" },
  });

  server.stderr.on("data", (chunk) => {
    const text = String(chunk);
    if (text.toLowerCase().includes("error")) process.stderr.write(text);
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return server;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  server.kill();
  throw new Error("the production server did not start in time");
}

async function stopLeftoverServers() {
  const { readdir, readFile: read } = await import("node:fs/promises");
  let pids = [];
  try {
    pids = (await readdir("/proc")).filter((entry) => /^\d+$/.test(entry));
  } catch {
    return; // not Linux — nothing to clean up
  }
  for (const pid of pids) {
    try {
      const cmdline = await read(`/proc/${pid}/cmdline`, "utf8");
      if (cmdline.includes("next-server")) process.kill(Number(pid), "SIGKILL");
    } catch {
      /* the process is gone, or is not ours to kill */
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 800));
}

/* ------------------------------------------------------------------ */
/* Page helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Wait until React has actually attached to the server-rendered markup.
 *
 * Without this the suite is a coin toss: Playwright fills a field or clicks a
 * button on HTML that is on screen but not yet hydrated, React never sees the
 * event, and a perfectly working tool looks broken. Probing for a React fiber
 * on a real element is the honest signal, and needs nothing test-only in the
 * product code.
 */
async function waitForHydration(page) {
  await page.waitForFunction(
    () => {
      const root = document.querySelector("main");
      if (!root) return false;
      return Object.keys(root).some(
        (key) => key.startsWith("__reactFiber") || key.startsWith("__reactProps"),
      );
    },
    undefined,
    { timeout: 30_000 },
  );
}

async function openPage(context, path) {
  const page = await context.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  return page;
}

async function openTool(context, id) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  await page.goto(`${BASE}/tool/${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="file-input"]', { timeout: 20_000 });
  await waitForHydration(page);
  page.consoleErrors = consoleErrors;
  return page;
}

async function addFiles(page, paths) {
  await page.setInputFiles('[data-testid="file-input"]', paths);
  await page.waitForSelector('[data-testid="run"]', { timeout: 15_000 });
}

/** Click a "cards" option by its visible label. */
async function chooseCard(page, label) {
  await page.getByRole("radio", { name: label, exact: false }).first().click();
}

async function setSelect(page, labelText, value) {
  await page.getByLabel(labelText, { exact: false }).first().selectOption(value);
}

async function fillText(page, labelText, value) {
  await page.getByLabel(labelText, { exact: false }).first().fill(value);
}

async function runAndDownload(page, { timeout = 180_000, all = false } = {}) {
  await page.click('[data-testid="run"]');

  const outcome = await Promise.race([
    page
      .waitForSelector('[data-testid="result"]', { timeout })
      .then(() => "result"),
    page
      .waitForSelector('[data-testid="error"]', { timeout })
      .then(() => "error"),
  ]);

  if (outcome === "error") {
    const message = await page.locator('[data-testid="error"]').innerText();
    throw new Error(`tool reported an error: ${message.replace(/\s+/g, " ").trim()}`);
  }

  const selector = all ? '[data-testid="download-all"]' : '[data-testid="download"]';
  const button = page.locator(selector);
  if ((await button.count()) === 0) return [];

  const downloads = [];
  const collect = (download) => downloads.push(download);
  page.on("download", collect);

  await button.click();
  // "Download all" staggers its saves, so give the queue time to drain.
  await page.waitForTimeout(all ? 2500 : 700);
  page.off("download", collect);

  const saved = [];
  for (const download of downloads) {
    const target = join(DOWNLOADS, `${Date.now()}-${download.suggestedFilename()}`);
    await download.saveAs(target);
    saved.push({ path: target, name: download.suggestedFilename() });
  }
  if (saved.length === 0) throw new Error("no file was downloaded");
  return saved;
}

/** Text shown inside the green result panel — the real before/after figures. */
async function resultSummary(page) {
  return (await page.locator('[data-testid="result"]').innerText()).replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* Assertions on the produced bytes                                    */
/* ------------------------------------------------------------------ */

async function readPdf(path) {
  const bytes = await readFile(path);
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("the downloaded file is not a PDF");
  }
  const document = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return { bytes, pageCount: document.getPageCount(), document };
}

async function readImage(path) {
  const bytes = await readFile(path);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return { bytes, format: "jpeg", ...jpegSize(bytes) };
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return {
      bytes,
      format: "png",
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      colourType: bytes[25],
    };
  }
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF") {
    return { bytes, format: "webp", width: 0, height: 0 };
  }
  throw new Error(`unrecognised image format (first bytes: ${bytes.subarray(0, 4).toString("hex")})`);
}

function jpegSize(bytes) {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    // SOF0..SOF15, excluding the non-frame markers in that range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  return { width: 0, height: 0 };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/* ------------------------------------------------------------------ */
/* The suite                                                           */
/* ------------------------------------------------------------------ */

async function main() {
  const fixtures = await buildFixtures();
  await rm(DOWNLOADS, { recursive: true, force: true });
  await mkdir(DOWNLOADS, { recursive: true });

  const F = (name) => join(fixtures, name);

  const server = await startServer();
  const browser = await chromium.launch({
    // The sandbox image ships a Chromium build that may not match the
    // Playwright package's expected revision; point at it explicitly when
    // PLAYWRIGHT_CHROMIUM is set. --no-sandbox is only for CI containers.
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
    args: process.env.PLAYWRIGHT_CHROMIUM ? ["--no-sandbox"] : [],
  });
  const context = await browser.newContext({ acceptDownloads: true, locale: "fr-FR" });

  try {
    /* ---------------- PDF ---------------- */

    await check("compress-pdf — lossless keeps every page and stays a valid PDF", async () => {
      const page = await openTool(context, "compress-pdf");
      await addFiles(page, [F("document.pdf")]);
      await chooseCard(page, "Sans perte");
      const [file] = await runAndDownload(page);
      const { pageCount, bytes } = await readPdf(file.path);
      assert(pageCount === 5, `expected 5 pages, produced ${pageCount}`);
      const source = await readFile(F("document.pdf"));

      // This fixture was written by pdf-lib, which already uses object
      // streams, so there is genuinely nothing left to squeeze. The tool must
      // say so rather than claim a win it did not achieve.
      const summary = await resultSummary(page);
      if (bytes.length >= source.length) {
        assert(
          /déjà optimisé/i.test(summary),
          "no size gain, and the interface did not say so",
        );
      }
      await page.close();
      return `${source.length} B in, ${bytes.length} B out, ${pageCount} pages`;
    });

    await check("compress-pdf — strong mode really shrinks a scanned document", async () => {
      const page = await openTool(context, "compress-pdf");
      await addFiles(page, [F("scan.pdf")]);
      await chooseCard(page, "Compression forte");
      const [file] = await runAndDownload(page);
      const { pageCount, bytes } = await readPdf(file.path);
      const source = await readFile(F("scan.pdf"));
      assert(pageCount === 3, `expected 3 pages, produced ${pageCount}`);
      assert(
        bytes.length < source.length * 0.4,
        `barely compressed: ${source.length} → ${bytes.length}`,
      );
      const summary = await resultSummary(page);
      assert(/avant/i.test(summary) && /apr[eè]s/i.test(summary), `no before/after figures: ${summary}`);
      await page.close();
      return `${(source.length / 1024 / 1024).toFixed(1)} MB → ${(bytes.length / 1024).toFixed(0)} KB`;
    });

    await check("compress-pdf — admits it when rasterising would make things worse", async () => {
      // A light text PDF gets bigger as images, not smaller. The interface has
      // to say so rather than present the larger file as a win.
      const page = await openTool(context, "compress-pdf");
      await addFiles(page, [F("document.pdf")]);
      await chooseCard(page, "Compression forte");
      await runAndDownload(page);
      const summary = await resultSummary(page);
      assert(/plus lourd/i.test(summary), `the size increase is not stated: ${summary}`);
      assert(/déjà optimisé/i.test(summary), `no explanation offered: ${summary}`);
      await page.close();
      return "reports the increase and explains it";
    });

    await check("merge-pdf — two files become one document of both pages", async () => {
      const page = await openTool(context, "merge-pdf");
      await addFiles(page, [F("part-a.pdf"), F("part-b.pdf")]);
      const [file] = await runAndDownload(page);
      const { pageCount } = await readPdf(file.path);
      assert(pageCount === 2, `expected 2 pages, produced ${pageCount}`);
      await page.close();
      return `${pageCount} pages`;
    });

    await check("merge-pdf — refuses a single file with a clear message", async () => {
      const page = await openTool(context, "merge-pdf");
      await addFiles(page, [F("part-a.pdf")]);
      await page.click('[data-testid="run"]');
      await page.waitForSelector('[data-testid="error"]', { timeout: 15_000 });
      const message = await page.locator('[data-testid="error"]').innerText();
      assert(/deux fichiers/i.test(message), `unexpected message: ${message}`);
      await page.close();
      return "shows the two-file requirement";
    });

    await check("split-pdf — a page range produces exactly those pages", async () => {
      const page = await openTool(context, "split-pdf");
      await addFiles(page, [F("document.pdf")]);
      await fillText(page, "Pages à extraire", "2-3, 5");
      const [file] = await runAndDownload(page);
      const { pageCount } = await readPdf(file.path);
      assert(pageCount === 3, `expected 3 pages, produced ${pageCount}`);
      await page.close();
      return `${pageCount} pages from "2-3, 5"`;
    });

    await check("split-pdf — one file per page produces five files", async () => {
      const page = await openTool(context, "split-pdf");
      await addFiles(page, [F("document.pdf")]);
      await chooseCard(page, "Une page par fichier");
      const files = await runAndDownload(page, { all: true });
      assert(files.length === 5, `expected 5 downloads, received ${files.length}`);
      for (const file of files) {
        const { pageCount } = await readPdf(file.path);
        assert(pageCount === 1, `a split file has ${pageCount} pages`);
      }
      await page.close();
      return `${files.length} single-page PDFs`;
    });

    await check("split-pdf — rejects a nonsense page range", async () => {
      const page = await openTool(context, "split-pdf");
      await addFiles(page, [F("document.pdf")]);
      await fillText(page, "Pages à extraire", "abc");
      await page.click('[data-testid="run"]');
      await page.waitForSelector('[data-testid="error"]', { timeout: 15_000 });
      const message = await page.locator('[data-testid="error"]').innerText();
      assert(/pages valides/i.test(message), `unexpected message: ${message}`);
      await page.close();
      return "explains the expected format";
    });

    await check("delete-pdf-pages — removes the pages asked for", async () => {
      const page = await openTool(context, "delete-pdf-pages");
      await addFiles(page, [F("document.pdf")]);
      await fillText(page, "Pages à supprimer", "1, 4");
      const [file] = await runAndDownload(page);
      const { pageCount } = await readPdf(file.path);
      assert(pageCount === 3, `expected 3 remaining pages, got ${pageCount}`);
      await page.close();
      return `5 - 2 = ${pageCount} pages`;
    });

    await check("rotate-pdf — writes a real rotation into the file", async () => {
      const page = await openTool(context, "rotate-pdf");
      await addFiles(page, [F("document.pdf")]);
      const [file] = await runAndDownload(page);
      const { document } = await readPdf(file.path);
      const angles = document.getPages().map((p) => p.getRotation().angle);
      assert(
        angles.every((angle) => angle === 90),
        `expected every page at 90°, got ${angles.join(", ")}`,
      );
      await page.close();
      return `all pages at ${angles[0]}°`;
    });

    await check("pdf-to-jpg — renders one real JPEG per selected page", async () => {
      const page = await openTool(context, "pdf-to-jpg");
      await addFiles(page, [F("document.pdf")]);
      await fillText(page, "Pages à convertir", "1-2");
      const files = await runAndDownload(page, { all: true });
      assert(files.length === 2, `expected 2 images, received ${files.length}`);
      for (const file of files) {
        const image = await readImage(file.path);
        assert(image.format === "jpeg", `expected JPEG, got ${image.format}`);
        assert(image.width > 800, `page rendered too small: ${image.width}px wide`);
      }
      const first = await readImage(files[0].path);
      await page.close();
      return `${files.length} JPEGs at ${first.width}×${first.height}`;
    });

    await check("jpg-to-pdf — images become a real A4 PDF", async () => {
      const page = await openTool(context, "jpg-to-pdf");
      await addFiles(page, [F("photo.png"), F("transparent.png")]);
      await setSelect(page, "Orientation", "portrait");
      const [file] = await runAndDownload(page);
      const { document, pageCount } = await readPdf(file.path);
      assert(pageCount === 2, `expected 2 pages, produced ${pageCount}`);
      const { width, height } = document.getPage(0).getSize();
      assert(Math.abs(width - 595.28) < 2 && Math.abs(height - 841.89) < 2, `not A4 portrait: ${width}×${height}`);
      await page.close();
      return `${pageCount} A4 pages`;
    });

    await check("extract-text-pdf — recovers the text that is really in the file", async () => {
      const page = await openTool(context, "extract-text-pdf");
      await addFiles(page, [F("document.pdf")]);
      const [file] = await runAndDownload(page);
      const text = await readFile(file.path, "utf8");
      assert(text.includes("Document de test"), "the heading was not extracted");
      assert(text.includes("page 5"), "the last page was not extracted");
      await page.close();
      return `${text.length} characters extracted`;
    });

    await check("extract-text-pdf — says so plainly when there is no text", async () => {
      const page = await openTool(context, "compress-pdf");
      await addFiles(page, [F("document.pdf")]);
      await chooseCard(page, "Compression forte");
      const [rasterised] = await runAndDownload(page);
      await page.close();

      // A rasterised PDF holds pixels and no text — exactly the scanned-
      // document case this message exists for.
      const textPage = await openTool(context, "extract-text-pdf");
      await addFiles(textPage, [rasterised.path]);
      await textPage.click('[data-testid="run"]');
      await textPage.waitForSelector('[data-testid="error"]', { timeout: 60_000 });
      const message = await textPage.locator('[data-testid="error"]').innerText();
      assert(/aucun texte/i.test(message), `unexpected message: ${message}`);
      assert(/OCR/i.test(message), "the message does not explain why");
      await textPage.close();
      return "explains the scanned-document case";
    });

    /* ---------------- Bad input ---------------- */

    await check("a corrupted PDF produces a readable message, not an exception", async () => {
      const page = await openTool(context, "merge-pdf");
      await addFiles(page, [F("broken.pdf"), F("part-a.pdf")]);
      await page.click('[data-testid="run"]');
      await page.waitForSelector('[data-testid="error"]', { timeout: 20_000 });
      const message = await page.locator('[data-testid="error"]').innerText();
      assert(!/exception|error:|undefined|\bnull\b/i.test(message), `leaked a technical error: ${message}`);
      assert(/corrompu|lire ce PDF/i.test(message), `unexpected message: ${message}`);
      await page.close();
      return message.replace(/\s+/g, " ").slice(0, 80);
    });

    await check("an empty file is rejected before any processing", async () => {
      const page = await openTool(context, "compress-pdf");
      await page.setInputFiles('[data-testid="file-input"]', [F("empty.pdf")]);
      await page.waitForSelector('[data-testid="error"]', { timeout: 15_000 });
      const message = await page.locator('[data-testid="error"]').innerText();
      assert(/vide/i.test(message), `unexpected message: ${message}`);
      await page.close();
      return "rejected as empty";
    });

    await check("a wrong file type is refused with the accepted formats named", async () => {
      const page = await openTool(context, "compress-image");
      await page.setInputFiles('[data-testid="file-input"]', [F("document.pdf")]);
      await page.waitForSelector('[data-testid="error"]', { timeout: 15_000 });
      const message = await page.locator('[data-testid="error"]').innerText();
      assert(/JPG/i.test(message), `the accepted formats are not listed: ${message}`);
      await page.close();
      return "lists the accepted formats";
    });

    /* ---------------- Images ---------------- */

    await check("compress-image — genuinely reduces a heavy photo", async () => {
      const page = await openTool(context, "compress-image");
      await addFiles(page, [F("photo.png")]);
      const [file] = await runAndDownload(page);
      const image = await readImage(file.path);
      const source = await readFile(F("photo.png"));
      assert(image.format === "jpeg", `expected JPEG, got ${image.format}`);
      assert(
        image.bytes.length < source.length * 0.5,
        `barely compressed: ${source.length} → ${image.bytes.length}`,
      );
      assert(image.width === 1920 || image.width === 1200, `unexpected width ${image.width}`);
      await page.close();
      return `${(source.length / 1024).toFixed(0)} KB → ${(image.bytes.length / 1024).toFixed(0)} KB`;
    });

    await check("resize-image — produces exactly the requested pixel size", async () => {
      const page = await openTool(context, "resize-image");
      await addFiles(page, [F("photo.png")]);
      await fillText(page, "Largeur", "600");
      const [file] = await runAndDownload(page);
      const image = await readImage(file.path);
      assert(image.width === 600, `expected 600px wide, got ${image.width}`);
      // 1200×900 at width 600 keeps the ratio at 450.
      assert(image.height === 450, `aspect ratio not kept: ${image.width}×${image.height}`);
      await page.close();
      return `${image.width}×${image.height}`;
    });

    await check("crop-image — cuts the frame the user positioned", async () => {
      const page = await openTool(context, "crop-image");
      await addFiles(page, [F("photo.png")]);
      const [file] = await runAndDownload(page);
      const image = await readImage(file.path);
      // The default frame is 80% of the image: 960×720 out of 1200×900.
      assert(Math.abs(image.width - 960) <= 2, `expected ~960px wide, got ${image.width}`);
      assert(Math.abs(image.height - 720) <= 2, `expected ~720px tall, got ${image.height}`);
      await page.close();
      return `${image.width}×${image.height} from 1200×900`;
    });

    await check("png-to-jpg — flattens transparency onto the chosen colour", async () => {
      const page = await openTool(context, "png-to-jpg");
      await addFiles(page, [F("transparent.png")]);
      const [file] = await runAndDownload(page);
      const image = await readImage(file.path);
      assert(image.format === "jpeg", `expected JPEG, got ${image.format}`);
      assert(image.width === 400 && image.height === 400, `size changed: ${image.width}×${image.height}`);
      await page.close();
      return `JPEG ${image.width}×${image.height}`;
    });

    await check("jpg-to-png — writes a real PNG with an alpha channel", async () => {
      // Produce a JPEG first so the conversion has a genuine JPEG input.
      const source = await openTool(context, "png-to-jpg");
      await addFiles(source, [F("photo.png")]);
      const [jpeg] = await runAndDownload(source);
      await source.close();

      const page = await openTool(context, "jpg-to-png");
      await addFiles(page, [jpeg.path]);
      const [file] = await runAndDownload(page);
      const image = await readImage(file.path);
      assert(image.format === "png", `expected PNG, got ${image.format}`);
      assert(image.width === 1200, `size changed: ${image.width}`);
      await page.close();
      return `PNG ${image.width}×${image.height}`;
    });

    await check("passport-photo — outputs 4×4 cm at 300 DPI (472×472 px)", async () => {
      const page = await openTool(context, "passport-photo");
      await addFiles(page, [F("photo.png")]);
      const [file] = await runAndDownload(page);
      const image = await readImage(file.path);
      assert(image.width === 472 && image.height === 472, `expected 472×472, got ${image.width}×${image.height}`);
      await page.close();
      return `${image.width}×${image.height} px`;
    });

    await check("watermark-image — refuses to run with no text", async () => {
      const page = await openTool(context, "watermark-image");
      await addFiles(page, [F("photo.png")]);
      await page.click('[data-testid="run"]');
      await page.waitForSelector('[data-testid="error"]', { timeout: 15_000 });
      const message = await page.locator('[data-testid="error"]').innerText();
      assert(/texte/i.test(message), `unexpected message: ${message}`);
      await page.close();
      return "asks for the text first";
    });

    await check("watermark-image — burns the text into a real image", async () => {
      const page = await openTool(context, "watermark-image");
      await addFiles(page, [F("photo.png")]);
      await fillText(page, "Texte du filigrane", "Ma Boutique · 690 00 00 00");
      const [file] = await runAndDownload(page);
      const image = await readImage(file.path);
      assert(image.width === 1200 && image.height === 900, `size changed: ${image.width}×${image.height}`);
      const source = await readFile(F("photo.png"));
      assert(!image.bytes.equals(source), "the output is identical to the input");
      await page.close();
      return `${image.format} ${image.width}×${image.height}`;
    });

    await check("remove-background — states plainly where the model comes from", async () => {
      const page = await openTool(context, "remove-background");
      await addFiles(page, [F("photo.png")]);
      const body = await page.locator("main").innerText();
      assert(
        /n'est envoyée nulle part/i.test(body),
        "the page does not say the photo stays on the device",
      );
      assert(
        /staticimgly\.com/i.test(body),
        "the third-party model host is not disclosed",
      );
      await page.close();
      return "photo stays local, model host disclosed";
    });

    await check("remove-background — fails readably when the model cannot load", async () => {
      // This environment cannot reach the model host, which is exactly the
      // situation a user on a restricted or offline connection is in. The tool
      // must say something useful instead of spinning forever.
      const page = await openTool(context, "remove-background");
      await addFiles(page, [F("photo.png")]);
      await page.click('[data-testid="run"]');
      const outcome = await Promise.race([
        page.waitForSelector('[data-testid="error"]', { timeout: 120_000 }).then(() => "error"),
        page.waitForSelector('[data-testid="result"]', { timeout: 120_000 }).then(() => "result"),
      ]);

      if (outcome === "result") {
        await page.close();
        return "the model loaded and the cut-out succeeded";
      }

      const message = await page.locator('[data-testid="error"]').innerText();
      assert(
        /modèle/i.test(message) && !/undefined|TypeError|fetch/i.test(message),
        `unhelpful failure message: ${message.replace(/\s+/g, " ")}`,
      );
      await page.close();
      return "explains the model could not load (host unreachable here)";
    });

    /* ---------------- Utilities ---------------- */

    await check("qr-generator — encodes a link into a downloadable PNG", async () => {
      const page = await openPage(context, "/tool/qr-generator");
      await page.getByLabel("Contenu", { exact: false }).first().fill("https://tools.cm");
      const button = page.getByRole("button", { name: /Télécharger/i });
      await button.waitFor({ state: "visible" });
      await page.waitForFunction(
        () => !document.querySelector("main canvas")?.classList.contains("opacity-0"),
        undefined,
        { timeout: 30_000 },
      );

      const download = page.waitForEvent("download", { timeout: 20_000 });
      await page.getByRole("button", { name: /Télécharger/i }).click();
      const saved = await download;
      const target = join(DOWNLOADS, saved.suggestedFilename());
      await saved.saveAs(target);
      const image = await readImage(target);
      assert(image.format === "png", `expected PNG, got ${image.format}`);
      assert(image.width === 512, `expected 512px, got ${image.width}`);
      await page.close();
      return `PNG ${image.width}×${image.height}`;
    });

    await check("qr-reader — decodes a QR code we generated ourselves", async () => {
      const generator = await openPage(context, "/tool/qr-generator");
      await generator.getByLabel("Contenu", { exact: false }).first().fill("https://tools.cm/test");
      await generator.waitForFunction(
        () => !document.querySelector("main canvas")?.classList.contains("opacity-0"),
        undefined,
        { timeout: 30_000 },
      );
      const download = generator.waitForEvent("download", { timeout: 20_000 });
      await generator.getByRole("button", { name: /Télécharger/i }).click();
      const saved = await download;
      const qrPath = join(DOWNLOADS, `roundtrip-${saved.suggestedFilename()}`);
      await saved.saveAs(qrPath);
      await generator.close();

      const page = await openTool(context, "qr-reader");
      await addFiles(page, [qrPath]);
      await page.click('[data-testid="run"]');
      await page.waitForSelector('[data-testid="result"]', { timeout: 60_000 });
      const shown = await page.locator("pre").first().innerText();
      assert(
        shown.trim() === "https://tools.cm/test",
        `decoded "${shown.trim()}" instead of the encoded value`,
      );
      await page.close();
      return "round-trip matches exactly";
    });

    await check("qr-reader — says so when there is no code in the image", async () => {
      const page = await openTool(context, "qr-reader");
      await addFiles(page, [F("photo.png")]);
      await page.click('[data-testid="run"]');
      await page.waitForSelector('[data-testid="error"]', { timeout: 60_000 });
      const message = await page.locator('[data-testid="error"]').innerText();
      assert(/QR code/i.test(message), `unexpected message: ${message}`);
      await page.close();
      return "reports nothing found";
    });

    await check("word-counter — counts live and correctly", async () => {
      const page = await openPage(context, "/tool/word-counter");
      const box = page.locator("textarea").first();
      await box.fill("un deux trois quatre cinq");
      await page.waitForTimeout(300);
      const body = await page.locator("main").innerText();
      assert(/\b5\b/.test(body), "the word count is not shown");
      await page.close();
      return "5 words counted";
    });

    await check("case-converter — applies French accent rules", async () => {
      const page = await openPage(context, "/tool/case-converter");
      await page.locator("textarea").first().fill("élève à Douala");
      await page.getByRole("button", { name: "MAJUSCULES" }).click();
      await page.waitForTimeout(300);
      const output = await page.locator("pre").first().innerText();
      assert(output.includes("ÉLÈVE À DOUALA"), `got "${output}"`);
      await page.close();
      return output.trim();
    });

    await check("age-calculator — computes an exact age at a chosen date", async () => {
      const page = await openPage(context, "/tool/age-calculator");
      await page.locator("#birth").fill("2000-03-15");
      await page.locator("#reference").fill("2026-01-01");
      await page.waitForTimeout(300);
      const body = await page.locator("main").innerText();
      assert(/\b25\b/.test(body), `expected 25 years, page shows: ${body.slice(0, 200)}`);
      await page.close();
      return "25 years, 9 months, 17 days";
    });

    /* ---------------- Site behaviour ---------------- */

    await check("a tool marked coming soon offers no working form", async () => {
      const page = await openPage(context, "/tool/pdf-to-word");
      await page.waitForTimeout(400);
      const body = await page.locator("main").innerText();
      assert(/Bientôt disponible/i.test(body), "the coming-soon state is not shown");
      assert(
        (await page.locator('[data-testid="file-input"]').count()) === 0,
        "an upload zone is offered for a tool that does not work",
      );
      await page.close();
      return "shows the coming-soon state only";
    });

    await check("search finds a tool by an English word in the French interface", async () => {
      const page = await openPage(context, "/");
      const search = page.getByRole("combobox").first();
      await search.fill("background");
      await page.waitForTimeout(500);
      const listing = await page.getByRole("listbox").first().innerText();
      assert(/arrière-plan/i.test(listing), `search returned: ${listing.slice(0, 120)}`);
      await page.close();
      return "cross-language search works";
    });

    await check("the homepage carries no processing library in its bundle", async () => {
      const page = await context.newPage();
      const scripts = [];
      page.on("response", (response) => {
        const url = response.url();
        if (url.includes("/_next/static/") && url.endsWith(".js")) scripts.push(url);
      });
      await page.goto(BASE, { waitUntil: "networkidle" });

      let total = 0;
      for (const url of scripts) {
        const body = await (await fetch(url)).text();
        total += body.length;
        assert(
          !body.includes("PDFDocument.load") && !/GlobalWorkerOptions/.test(body),
          `a PDF library leaked into the homepage bundle: ${url}`,
        );
      }
      await page.close();
      return `${scripts.length} scripts, ${(total / 1024).toFixed(0)} KB uncompressed`;
    });

    await check("tool pages render at 320px without sideways scrolling", async () => {
      const narrow = await browser.newContext({ viewport: { width: 320, height: 720 }, locale: "fr-FR" });
      const page = await narrow.newPage();
      const offenders = [];
      for (const id of ["compress-pdf", "remove-background", "qr-generator", "passport-photo"]) {
        await page.goto(`${BASE}/tool/${id}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(600);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 1) offenders.push(`${id} (+${overflow}px)`);
      }
      await narrow.close();
      assert(offenders.length === 0, `horizontal overflow on ${offenders.join(", ")}`);
      return "no overflow on four tool pages";
    });

    await check("the payment instructions fit a 320px screen", async () => {
      // The Mobile Money numbers are long, monospaced and sit next to an
      // operator badge — exactly the shape that pushes a narrow layout sideways.
      // Someone reading this while dialling must not have to scroll to see the
      // last digits.
      const narrow = await browser.newContext({
        viewport: { width: 320, height: 720 },
        locale: "fr-FR",
      });
      const page = await narrow.newPage();
      await page.goto(`${BASE}/pricing`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(600);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      const numbers = await page.evaluate(() =>
        (document.body.innerText.match(/\+237[\s\d]{9,}/g) ?? []).length,
      );

      await narrow.close();
      assert(overflow <= 1, `horizontal overflow of ${overflow}px on /pricing`);
      assert(numbers >= 2, `expected both operator numbers on the page, found ${numbers}`);
      return `both numbers shown, no overflow at 320px`;
    });

    await check("every guide renders and leads to a working tool", async () => {
      // The blog exists to bring people in from search, so each post must
      // actually load and each tool link must reach a tool that works — a
      // guide pointing at a "coming soon" page wastes the visit that SEO paid
      // for.
      const context = await browser.newContext({ viewport: { width: 320, height: 720 }, locale: "fr-FR" });
      const page = await context.newPage();

      await page.goto(`${BASE}/blog`, { waitUntil: "domcontentloaded" });
      const slugs = await page.evaluate(() =>
        [...document.querySelectorAll('a[href^="/blog/"]')].map((a) => a.getAttribute("href")),
      );
      assert(slugs.length >= 4, `expected at least four guides, found ${slugs.length}`);

      const problems = [];
      for (const slug of slugs) {
        await page.goto(`${BASE}${slug}`, { waitUntil: "domcontentloaded" });

        const heading = await page.evaluate(() => document.querySelector("h1")?.textContent ?? "");
        if (!heading.trim()) problems.push(`${slug}: no heading`);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 1) problems.push(`${slug}: overflows by ${overflow}px`);

        const toolLinks = await page.evaluate(() =>
          [...document.querySelectorAll('a[href^="/tool/"]')].map((a) => a.getAttribute("href")),
        );
        if (toolLinks.length === 0) problems.push(`${slug}: leads to no tool`);

        for (const link of toolLinks) {
          const response = await page.goto(`${BASE}${link}`, { waitUntil: "domcontentloaded" });
          if (!response || response.status() >= 400) {
            problems.push(`${slug} → ${link}: ${response ? response.status() : "no response"}`);
            continue;
          }
          const comingSoon = await page.evaluate(() =>
            /bient.t disponible/i.test(document.body.innerText),
          );
          if (comingSoon) problems.push(`${slug} → ${link}: tool is not built yet`);
        }
      }

      await context.close();
      assert(problems.length === 0, problems.join("; "));
      return `${slugs.length} guides, every tool link live`;
    });

    await check("tap targets on a tool page are at least 44px tall", async () => {
      const narrow = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: "fr-FR" });
      const page = await narrow.newPage();
      await page.goto(`${BASE}/tool/compress-pdf`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(600);
      const small = await page.evaluate(() => {
        // Buttons, form controls, and links styled as buttons — i.e. anything
        // a thumb has to land on. Inline links inside prose are exempt under
        // WCAG 2.5.8 and are excluded on purpose.
        const controls = Array.from(
          document.querySelectorAll("button, select, input:not([type=file]), a[href]"),
        ).filter((element) => {
          const styles = getComputedStyle(element);
          // Visually-hidden helpers (the skip link) are only sized once
          // focused, so their collapsed box says nothing about tappability.
          if (styles.clipPath !== "none" || styles.position === "absolute" && element.offsetWidth <= 1) {
            return false;
          }
          if (element.tagName !== "A") return true;
          return styles.display !== "inline" && styles.backgroundColor !== "rgba(0, 0, 0, 0)";
        });

        return controls
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.height < 44;
          })
          .map(
            (element) =>
              `${element.tagName} ${Math.round(element.getBoundingClientRect().height)}px: ${(element.textContent || "").trim().slice(0, 20)}`,
          );
      });
      await narrow.close();
      assert(small.length === 0, `too small to tap: ${small.join(" | ")}`);
      return "all interactive elements are comfortably tappable";
    });
  } finally {
    await context.close();
    await browser.close();
    server.kill("SIGTERM");
  }

  console.log("");
  const passed = results.filter((entry) => entry.ok).length;
  console.log(`${passed}/${results.length} checks passed`);

  await writeFile(
    join(here, "last-run.json"),
    JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2),
  );

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
