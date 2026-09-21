/**
 * Tools require an account — checked in a real browser, against a real build.
 *
 *   npm run test:access
 *
 * Every other browser test runs with no Supabase configured, where there are
 * no accounts and so nothing to require. This one builds the site a second
 * time with accounts switched ON (pointing at an address where nothing
 * listens, which is exactly what a signed-out visitor looks like: no session
 * cookie, nobody to ask), into its own directory so the ordinary build is left
 * alone, and then checks what a signed-out visitor can and cannot do.
 */
import { strict as assert } from "node:assert";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.TEST_PORT ?? 3713);
const BASE = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  TOOLSCM_DIST_DIR: ".next-access",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_access_test",
  NODE_ENV: "production",
};

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push(true);
    console.log(`\x1b[32mPASS\x1b[0m  ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    results.push(false);
    console.log(`\x1b[31mFAIL\x1b[0m  ${name} — ${error.message}`);
  }
}

if (!process.env.SKIP_BUILD) {
  console.log("building with accounts switched on…");
  execFileSync("npx", ["next", "build"], { cwd: root, env, stdio: "pipe" });
}

// A server already on this port would answer every check below with an OLD
// build — which is how this test once passed against code it was meant to
// catch. Refuse to run rather than test the wrong thing.
let occupied = false;
try {
  await fetch(BASE, { signal: AbortSignal.timeout(1000) });
  occupied = true;
} catch {
  /* nothing listening: good */
}
if (occupied) throw new Error(`something is already listening on ${BASE}; stop it and run again`);

// Its own process group, so stopping it stops the real next-server too and
// not only the npx wrapper in front of it.
const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  cwd: root,
  env,
  stdio: "ignore",
  detached: true,
});
const stopServer = () => {
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    /* already gone */
  }
};
const deadline = Date.now() + 60_000;
for (;;) {
  try {
    if ((await fetch(BASE, { signal: AbortSignal.timeout(2000) })).ok) break;
  } catch {
    /* not up yet */
  }
  if (Date.now() > deadline) {
    stopServer();
    throw new Error("server did not start");
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
}

mkdirSync(join(root, "tests", ".screenshots"), { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
  args: process.env.PLAYWRIGHT_CHROMIUM ? ["--no-sandbox"] : [],
});

try {
  await check("the public pages stay open to a signed-out visitor", async () => {
    // Search engines and first-time visitors see the site; only USING a tool
    // needs an account.
    for (const path of ["/", "/pricing", "/tool/compress-pdf", "/privacy", "/terms", "/signin", "/signup"]) {
      const response = await fetch(`${BASE}${path}`);
      assert.equal(response.status, 200, `${path} answered ${response.status}`);
    }
    return "home, a tool page, pricing, legal, sign-in, sign-up: all 200";
  });

  await check("a tool shows a sign-in panel instead of the tool", async () => {
    const page = await browser.newPage({ locale: "fr-FR" });
    await page.goto(`${BASE}/tool/compress-pdf`, { waitUntil: "networkidle" });
    await page.getByText("Connectez-vous pour utiliser cet outil").waitFor({ timeout: 10_000 });

    assert.equal(await page.locator('input[type="file"]').count(), 0, "a file input is still on the page");
    const signup = await page.getByRole("link", { name: "Créer un compte" }).first().getAttribute("href");
    assert.equal(signup, "/signup?next=%2Ftool%2Fcompress-pdf");
    const signin = await page.getByRole("link", { name: "Se connecter" }).last().getAttribute("href");
    assert.equal(signin, "/signin?next=%2Ftool%2Fcompress-pdf");
    await page.screenshot({ path: join(root, "tests", ".screenshots", "sign-in-required.png"), fullPage: false });
    await page.close();
    return "no file input, both buttons return to the tool";
  });

  await check("tools that take no file are closed too", async () => {
    const page = await browser.newPage({ locale: "fr-FR" });
    for (const id of ["word-counter", "qr-generator", "age-calculator", "case-converter"]) {
      await page.goto(`${BASE}/tool/${id}`, { waitUntil: "networkidle" });
      await page.getByText("Connectez-vous pour utiliser cet outil").waitFor({ timeout: 10_000 });
      assert.equal(await page.locator("textarea").count(), 0, `${id} still shows its text box`);
    }
    await page.close();
    return "word counter, QR generator, age, case converter";
  });

  await check("the server refuses an operation without a session", async () => {
    // Someone skipping the page and calling the endpoint directly gets the
    // same answer. 401, not 402: the problem is who, not how much.
    const response = await fetch(`${BASE}/api/usage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "access-test-device-01", tool: "compress-pdf" }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "sign_in_required" });
    return "401 sign_in_required";
  });

  await check("switching between sign-in and sign-up keeps the way back", async () => {
    const page = await browser.newPage({ locale: "fr-FR" });
    await page.goto(`${BASE}/signin?next=%2Ftool%2Fmerge-pdf`, { waitUntil: "networkidle" });
    await page.locator("main").getByRole("link", { name: "Créer un compte" }).last().click();
    await page.waitForURL(/\/signup/);
    assert.equal(new URL(page.url()).searchParams.get("next"), "/tool/merge-pdf");
    await page.close();
    return "/signup?next=/tool/merge-pdf";
  });

  await check("a crafted next cannot send anyone to another site", async () => {
    // The callback used to accept anything starting with "/", which
    // "//evil.example" does. Without a code it stops earlier, so the check
    // here is on the sign-in form's own switch link.
    const page = await browser.newPage({ locale: "fr-FR" });
    await page.goto(`${BASE}/signin?next=%2F%2Fevil.example`, { waitUntil: "networkidle" });
    await page.locator("main").getByRole("link", { name: "Créer un compte" }).last().click();
    await page.waitForURL(/\/signup/);
    assert.equal(new URL(page.url()).searchParams.get("next"), "/account");
    await page.close();
    return "//evil.example replaced with /account";
  });
} finally {
  await browser.close();
  stopServer();
}

console.log("");
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
