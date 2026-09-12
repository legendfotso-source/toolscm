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
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

  // TypeScript emits bundler-style imports (`from "./term"`). Node's ESM
  // resolver requires the extension, so add it to the emitted files rather
  // than changing how the application itself is written.
  for (const file of files) {
    const emitted = join(out, file.replace(/\.ts$/, ".js"));
    writeFileSync(
      emitted,
      readFileSync(emitted, "utf8").replace(
        /(from\s+["']\.\.?\/[^"']+)(["'])/g,
        (match, path, quote) => (path.endsWith(".js") ? match : `${path}.js${quote}`),
      ),
    );
  }

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

const out = compile("term.ts", "receipt.ts", "signatures.ts", "plans.ts", "reminders.ts");
const { nextEndDate, TERM_DAYS } = await import(join(out, "term.js"));
const { receiptReference, receiptMessage, whatsappNumber } = await import(
  join(out, "receipt.js")
);
const { verifyNotchpaySignature, verifyStripeSignature } = await import(
  join(out, "signatures.js")
);
const { plans, getPlan } = await import(join(out, "plans.js"));
const { daysUntil, reminderMessage, REMIND_WITHIN_DAYS } = await import(
  join(out, "reminders.js")
);
const { createHmac } = await import("node:crypto");

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

/* ---------------- webhook signatures ---------------- */
/*
 * This is the code standing between a stranger with curl and a free
 * subscription. Every one of these tests is a way someone would try to get
 * past it.
 */

const SECRET = "whsec_test_secret_value";
const BODY = JSON.stringify({ event: "payment.complete", data: { reference: "tcm_abc" } });

const notchSig = (body, secret = SECRET) =>
  createHmac("sha256", secret).update(body, "utf8").digest("hex");

check("a genuine NotchPay signature is accepted", () => {
  assert.equal(verifyNotchpaySignature(BODY, notchSig(BODY), SECRET), true);
  return "valid HMAC passes";
});

check("a tampered NotchPay body is rejected", () => {
  // The attack that matters: take a real notification for 500 FCFA and change
  // the amount, or point it at someone else's reference.
  const signature = notchSig(BODY);
  const tampered = BODY.replace("tcm_abc", "tcm_xyz");
  assert.equal(verifyNotchpaySignature(tampered, signature, SECRET), false);
  return "changing one character invalidates it";
});

check("a NotchPay signature made with the wrong secret is rejected", () => {
  assert.equal(verifyNotchpaySignature(BODY, notchSig(BODY, "not-the-secret"), SECRET), false);
  return "wrong key fails";
});

check("NotchPay verification fails closed with no secret configured", () => {
  // The dangerous default. An unconfigured secret must reject everything, not
  // wave everything through.
  assert.equal(verifyNotchpaySignature(BODY, notchSig(BODY), ""), false);
  return "no secret means no grants";
});

check("a missing or malformed NotchPay signature is rejected", () => {
  for (const signature of [null, undefined, "", "not-hex", "abc"]) {
    assert.equal(verifyNotchpaySignature(BODY, signature, SECRET), false, `accepted ${signature}`);
  }
  return "five malformed headers, all refused";
});

const stripeHeader = (body, secondsAgo = 0, secret = SECRET) => {
  const t = Math.floor(Date.now() / 1000) - secondsAgo;
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
};

check("a genuine Stripe signature is accepted", () => {
  assert.equal(verifyStripeSignature(BODY, stripeHeader(BODY), SECRET), true);
  return "valid header passes";
});

check("a Stripe signature over the body alone is rejected", () => {
  // The classic implementation bug: signing the body without the timestamp
  // prefix. If this passed, our verifier would not be checking what Stripe
  // actually signs.
  const t = Math.floor(Date.now() / 1000);
  const wrong = createHmac("sha256", SECRET).update(BODY, "utf8").digest("hex");
  assert.equal(verifyStripeSignature(BODY, `t=${t},v1=${wrong}`, SECRET), false);
  return "the timestamp must be part of the signed payload";
});

check("an old Stripe signature cannot be replayed", () => {
  // Without the timestamp check, one captured signature grants Pro forever.
  assert.equal(verifyStripeSignature(BODY, stripeHeader(BODY, 10), SECRET), true);
  assert.equal(verifyStripeSignature(BODY, stripeHeader(BODY, 3600), SECRET), false);
  return "10s accepted, 1h refused";
});

check("Stripe accepts either signature during a secret rotation", () => {
  const t = Math.floor(Date.now() / 1000);
  const good = createHmac("sha256", SECRET).update(`${t}.${BODY}`, "utf8").digest("hex");
  const old = createHmac("sha256", "old-secret").update(`${t}.${BODY}`, "utf8").digest("hex");
  assert.equal(verifyStripeSignature(BODY, `t=${t},v1=${old},v1=${good}`, SECRET), true);
  return "two v1 entries, one matching";
});

check("Stripe verification fails closed on junk headers", () => {
  for (const header of [null, "", "v1=abc", "t=notanumber,v1=abc", "garbage"]) {
    assert.equal(verifyStripeSignature(BODY, header, SECRET), false, `accepted ${header}`);
  }
  assert.equal(verifyStripeSignature(BODY, stripeHeader(BODY), ""), false, "accepted empty secret");
  return "five junk headers and an empty secret, all refused";
});

/* ---------------- plans ---------------- */

check("the card price honours the same discount as the FCFA price", () => {
  // The plan selector shows ONE discount badge, computed from the FCFA price.
  // A card customer charged full price while the button says −25% is a promise
  // the checkout does not keep — which is exactly what happened before the
  // dollar amount was derived from the same plan.
  for (const plan of plans(2000, 500)) {
    const months = plan.days / 30;
    const fullXaf = 2000 * months;
    const fullUsd = 500 * months;

    const xafDiscount = 1 - plan.amountXaf / fullXaf;
    const usdDiscount = 1 - plan.amountUsdCents / fullUsd;

    assert.ok(
      Math.abs(xafDiscount - usdDiscount) < 0.03,
      `${plan.id}: ${(xafDiscount * 100).toFixed(0)}% off in FCFA but ${(usdDiscount * 100).toFixed(0)}% off on card`,
    );
  }
  return "both currencies discount alike";
});

check("card prices land on a round half-dollar", () => {
  for (const plan of plans(2000, 500)) {
    assert.equal(plan.amountUsdCents % 50, 0, `${plan.id} is ${plan.amountUsdCents} cents`);
  }
  return "12.50 and 45.00, not 12.47";
});

check("longer plans cost less per month and are priced in round numbers", () => {
  const [monthly, quarterly, yearly] = plans(2000);
  assert.equal(monthly.amountXaf, 2000);
  assert.equal(quarterly.days, 90);
  assert.equal(yearly.days, 360);
  assert.ok(quarterly.amountXaf < 2000 * 3, "quarterly is not a discount");
  assert.ok(yearly.amountXaf < 2000 * 12, "yearly is not a discount");
  for (const plan of [quarterly, yearly]) {
    // A price of 4,833 FCFA is one nobody can pay in cash and nobody trusts.
    assert.equal(plan.amountXaf % 500, 0, `${plan.id} is not a round number`);
  }
  return `${quarterly.amountXaf} for 3 months, ${yearly.amountXaf} for 12`;
});

check("changing the monthly price moves every plan with it", () => {
  const cheap = getPlan(1000, "yearly");
  const dear = getPlan(4000, "yearly");
  assert.ok(dear.amountXaf > cheap.amountXaf * 3, "yearly did not follow the monthly price");
  return `${cheap.amountXaf} vs ${dear.amountXaf}`;
});

check("an unknown plan id falls back to monthly rather than throwing", () => {
  // Inside a payment path, a wrong-but-safe answer beats an exception.
  assert.equal(getPlan(2000, "nonsense").id, "monthly");
  return "falls back safely";
});

/* ---------------- renewal reminders ---------------- */

check("days left counts calendar days, not 24-hour blocks", () => {
  // Access ending at 08:00 tomorrow is "1 day left". Counting whole 24-hour
  // periods would call that 0 and tell a paying customer they had expired.
  const now = new Date("2026-09-12T18:00:00Z"); // 19:00 in Douala
  assert.equal(daysUntil("2026-09-13T08:00:00Z", now), 1);
  // 20:00 UTC is 21:00 in Douala — still the same day there, so zero days
  // left. (23:00 UTC would already be past midnight in Douala and count as
  // tomorrow, which is exactly the boundary this offset exists to get right.)
  assert.equal(daysUntil("2026-09-12T20:00:00Z", now), 0);
  assert.equal(daysUntil("2026-09-12T23:00:00Z", now), 1);
  assert.equal(daysUntil("2026-09-15T02:00:00Z", now), 3);
  return "counted in Douala, so the midnight boundary lands correctly";
});

check("an already-expired subscription reads as negative or zero", () => {
  const now = new Date("2026-09-12T12:00:00Z");
  assert.ok(daysUntil("2026-09-09T12:00:00Z", now) < 0);
  return "past dates do not wrap around";
});

check("a malformed end date does not throw", () => {
  assert.equal(daysUntil("not-a-date"), 0);
  return "returns 0 rather than NaN";
});

check("the reminder says when access ends and what it costs", () => {
  const message = reminderMessage(
    { daysLeft: 3, proUntil: "2026-10-12T09:00:00Z" },
    "2 000 FCFA",
    "fr",
  );
  assert.ok(message.includes("3 jours"), "no countdown");
  assert.ok(message.includes("12 octobre"), "no date");
  assert.ok(message.includes("2 000 FCFA"), "no price");
  return "countdown, date and price all present";
});

check("the reminder reads naturally at one day and at zero", () => {
  const tomorrow = reminderMessage(
    { daysLeft: 1, proUntil: "2026-10-12T09:00:00Z" },
    "2 000 FCFA",
    "fr",
  );
  const expired = reminderMessage(
    { daysLeft: 0, proUntil: "2026-10-12T09:00:00Z" },
    "2 000 FCFA",
    "fr",
  );
  assert.ok(tomorrow.includes("demain"), "does not say tomorrow");
  assert.ok(!tomorrow.includes("1 jours"), "says '1 jours'");
  assert.ok(expired.includes("a expiré"), "does not say expired");
  return "demain, and a expiré — no '1 jours'";
});

check("the reminder window is short enough not to pester", () => {
  assert.ok(REMIND_WITHIN_DAYS >= 1 && REMIND_WITHIN_DAYS <= 7);
  return `${REMIND_WITHIN_DAYS} days`;
});

console.log("");
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
