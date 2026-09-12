/**
 * Tests for the parts of the payment layer that can be wrong without anyone
 * noticing until a customer complains.
 *
 *   node tests/run-payment-tests.mjs
 *
 * No database, no network, no provider account: this is pure logic, and pure
 * logic is exactly the part that quietly overcharges people.
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * term.ts is TypeScript. Rather than pull in a runner, compile that one file to
 * a temporary directory and import the JavaScript — the test then exercises the
 * same source the application ships, not a copy that can drift from it.
 */
function loadTerm() {
  const out = mkdtempSync(join(tmpdir(), "toolscm-term-"));
  execFileSync(
    join(root, "node_modules", ".bin", "tsc"),
    [
      join(root, "src", "lib", "payments", "term.ts"),
      "--outDir",
      out,
      "--module",
      "esnext",
      "--target",
      "es2022",
      "--moduleResolution",
      "bundler",
    ],
    { stdio: "pipe" },
  );
  // Node needs the extension to treat it as an ES module in a CommonJS-free dir.
  writeFileSync(join(out, "package.json"), JSON.stringify({ type: "module" }));
  return import(join(out, "term.js"));
}

const results = [];
let failures = 0;

function check(name, fn) {
  try {
    const detail = fn();
    results.push(true);
    console.log(`[32mPASS[0m  ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    results.push(false);
    failures += 1;
    console.log(`[31mFAIL[0m  ${name} — ${error.message}`);
  }
}

const { nextEndDate, TERM_DAYS } = await loadTerm();

const day = (iso) => new Date(iso);

check("a first payment runs thirty days from today", () => {
  const now = day("2026-09-12T10:00:00Z");
  const end = nextEndDate(null, TERM_DAYS, now);
  assert.equal(end.toISOString(), "2026-10-12T10:00:00.000Z");
  return "12 Sep → 12 Oct";
});

check("renewing early adds to the existing term, it does not restart it", () => {
  // The customer is covered until the 30th and pays on the 20th. Restarting
  // from today would silently take ten days off what they paid for.
  const now = day("2026-09-20T08:00:00Z");
  const end = nextEndDate("2026-09-30T08:00:00Z", TERM_DAYS, now);
  assert.equal(end.toISOString(), "2026-10-30T08:00:00.000Z");
  return "paid 10 days early, keeps all 10";
});

check("renewing after expiry starts from today, not from the old end date", () => {
  // The opposite mistake: a subscription that lapsed in March must not grant
  // access backdated to March.
  const now = day("2026-09-12T00:00:00Z");
  const end = nextEndDate("2026-03-01T00:00:00Z", TERM_DAYS, now);
  assert.equal(end.toISOString(), "2026-10-12T00:00:00.000Z");
  return "lapsed subscription does not backdate";
});

check("the term crosses a month boundary correctly", () => {
  const end = nextEndDate(null, TERM_DAYS, day("2026-01-31T12:00:00Z"));
  assert.equal(end.toISOString(), "2026-03-02T12:00:00.000Z");
  return "31 Jan + 30 days → 2 Mar (2026 is not a leap year)";
});

check("the term crosses a leap day correctly", () => {
  const end = nextEndDate(null, TERM_DAYS, day("2028-02-01T12:00:00Z"));
  assert.equal(end.toISOString(), "2028-03-02T12:00:00.000Z");
  return "1 Feb 2028 + 30 days → 2 Mar";
});

check("a malformed stored end date falls back to today rather than throwing", () => {
  // A NaN date compares false against everything, which would silently produce
  // an Invalid Date end and lock the customer out. Guarded explicitly.
  const now = day("2026-09-12T00:00:00Z");
  const end = nextEndDate("not-a-date", TERM_DAYS, now);
  assert.equal(end.toISOString(), "2026-10-12T00:00:00.000Z");
  return "falls back to thirty days from now";
});

check("an end date exactly now counts as expired", () => {
  const now = day("2026-09-12T00:00:00Z");
  const end = nextEndDate("2026-09-12T00:00:00Z", TERM_DAYS, now);
  assert.equal(end.toISOString(), "2026-10-12T00:00:00.000Z");
  return "no free extra term at the exact boundary";
});

check("the term length is the advertised one month", () => {
  assert.equal(TERM_DAYS, 30);
  return "30 days";
});

console.log("");
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
