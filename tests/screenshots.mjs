/**
 * Captures the pages that matter, at phone and desktop widths, so the design
 * can be reviewed rather than assumed.
 *   node tests/screenshots.mjs
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, ".screenshots");
const BASE = `http://127.0.0.1:${process.env.TEST_PORT ?? 3711}`;

const PAGES = [
  ["home", "/"],
  ["tool-compress-pdf", "/tool/compress-pdf"],
  ["tool-remove-background", "/tool/remove-background"],
  ["tool-qr", "/tool/qr-generator"],
  ["pricing", "/pricing"],
  ["privacy", "/privacy"],
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
  args: process.env.PLAYWRIGHT_CHROMIUM ? ["--no-sandbox"] : [],
});

for (const [label, width, height] of [["mobile", 390, 844], ["desktop", 1280, 900]]) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: "fr-FR",
  });
  for (const [name, path] of PAGES) {
    const page = await context.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await page.screenshot({
      path: join(OUT, `${label}-${name}.png`),
      fullPage: label === "desktop",
    });
    await page.close();
  }
  await context.close();
}

await browser.close();
console.log(`screenshots in ${OUT}`);
