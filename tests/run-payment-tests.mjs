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
function compile(...files) {
  const out = mkdtempSync(join(tmpdir(), "toolscm-payments-"));
  execFileSync(
    join(root, "node_modules", ".bin", "tsc"),
    [
      ...files.map((file) => join(root, "src", "lib", "payments", file)),
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
  return out;
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

const out = compile("term.ts", "receipt.ts");
const { nextEndDate, TERM_DAYS } = await import(join(out, "term.js"));
const { receiptReference, receiptMessage, whatsappNumber } = await import(
  join(out, "receipt.js")
);

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

/* ---------------- receipts ---------------- */

check("a receipt reference is stable for a given payment", () => {
  const id = "3f7a91c2-5e08-4b1d-9c33-7a2b6d4e8f01";
  const first = receiptReference(id);
  assert.equal(first, receiptReference(id));
  assert.match(first, /^TCM-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  return first;
});

check("different payments get different references", () => {
  const a = receiptReference("3f7a91c2-5e08-4b1d-9c33-7a2b6d4e8f01");
  const b = receiptReference("3f7a91c3-5e08-4b1d-9c33-7a2b6d4e8f01");
  assert.notEqual(a, b);
  return `${a} vs ${b}`;
});

check("references avoid the characters people misread aloud", () => {
  // Crockford base32: no I, L, O or U. These get read over the phone and
  // copied by hand off a cracked screen.
  const ids = Array.from({ length: 200 }, (_, i) =>
    `${i.toString(16).padStart(8, "0")}-5e08-4b1d-9c33-7a2b6d4e8f01`,
  );
  for (const id of ids) {
    assert.ok(!/[ILOU]/.test(receiptReference(id)), `${receiptReference(id)} contains a confusable`);
  }
  return "200 references, none containing I, L, O or U";
});

check("a malformed payment id still produces a reference", () => {
  assert.match(receiptReference(""), /^TCM-0000-0000$/);
  return "empty id does not throw";
});

check("the receipt names the amount, the reference and the end date", () => {
  const message = receiptMessage(
    {
      reference: "TCM-ABCD-2345",
      email: "client@example.com",
      amount: 2000,
      currency: "XAF",
      paidAt: "2026-09-12T09:30:00Z",
      proUntil: "2026-10-12T09:30:00Z",
      days: 30,
    },
    "fr",
  );
  assert.ok(message.includes("TCM-ABCD-2345"), "no reference");
  assert.ok(message.includes("client@example.com"), "no account");
  // French formatting groups thousands with U+202F (narrow no-break space),
  // not an ordinary space — compare with whitespace normalised rather than
  // hard-coding an invisible character into the test.
  const flat = message.replace(/\s/g, " ");
  assert.ok(flat.includes("2 000 XAF"), `no amount in: ${flat}`);
  assert.ok(message.includes("12 octobre 2026"), "no end date");
  assert.ok(message.includes("Merci"), "no thanks");
  return "reference, account, amount, end date and thanks all present";
});

check("receipt times are shown in Douala time, not UTC", () => {
  // 23:30 UTC is 00:30 the next day in Douala. Showing UTC would put the wrong
  // date on the one document meant to reassure the customer.
  const message = receiptMessage(
    {
      reference: "TCM-ABCD-2345",
      email: "c@example.com",
      amount: 2000,
      currency: "XAF",
      paidAt: "2026-09-12T23:30:00Z",
      proUntil: null,
      days: 30,
    },
    "fr",
  );
  assert.ok(message.includes("13 septembre 2026"), `wrong local date in: ${message}`);
  return "23:30 UTC shows as 13 September in Douala";
});

check("the same receipt reads correctly in English", () => {
  const message = receiptMessage(
    {
      reference: "TCM-ABCD-2345",
      email: "c@example.com",
      amount: 2000,
      currency: "XAF",
      paidAt: "2026-09-12T09:30:00Z",
      proUntil: "2026-10-12T09:30:00Z",
      days: 30,
    },
    "en",
  );
  assert.ok(message.includes("Payment receipt"), "not English");
  assert.ok(message.includes("12 October 2026"), "no end date");
  return "English receipt carries the same facts";
});

/* ---------------- phone numbers ---------------- */

check("every way a Cameroonian writes their number gives the same link", () => {
  // If this is wrong the thank-you message silently goes to nobody.
  const expected = "237652116411";
  for (const input of [
    "652116411",
    "652 11 64 11",
    "+237 652 11 64 11",
    "+237652116411",
    "00237652116411",
    "237-652-116-411",
  ]) {
    assert.equal(whatsappNumber(input), expected, `failed on ${input}`);
  }
  return "six spellings, one number";
});

check("an unusable number is refused rather than guessed at", () => {
  for (const input of ["", "123", "abc", "65211"]) {
    assert.equal(whatsappNumber(input), null, `accepted ${input}`);
  }
  return "short and empty inputs return null";
});

check("a foreign number is left alone rather than given a 237 prefix", () => {
  assert.equal(whatsappNumber("+33 6 12 34 56 78"), "33612345678");
  return "French number survives intact";
});

console.log("");
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
