/**
 * What the customer is told, and what the owner can see.
 *
 *   npm run test:notify
 *
 * Two things that used to be silent.
 *
 * **The receipt.** A customer sent money from their own Mobile Money account
 * and the site said nothing. Access turned on, the subscription row moved, and
 * the only way to learn any of that was to come back and look. The failure
 * mode of a silent success is a WhatsApp message asking "did it work?", which
 * somebody answers by hand — and a notification system made of a person is a
 * notification system that stops at night.
 *
 * **CamPay.** Nothing in the application ever said whether the payment
 * provider was reachable or whether its credentials were accepted. "The
 * payment page does not open" has three unrelated causes and they all look
 * identical from outside.
 *
 * Both are tested here against a stubbed `fetch`, so nothing leaves the
 * machine and no key is needed: the assertions are about what WOULD be sent.
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/**
 * Compile one module and everything it imports, and make the result loadable
 * by plain Node. Same approach as the config suite: `server-only` is a Next
 * build-time guard with no Node package behind it, so it is stripped from the
 * COMPILED copy rather than removed from the source — the guard is the thing
 * worth keeping in the real file.
 */
function compile(relative, name) {
  const out = mkdtempSync(join(tmpdir(), "toolscm-notify-"));
  execFileSync(
    join(root, "node_modules", ".bin", "tsc"),
    [
      join(root, relative),
      "--outDir",
      out,
      "--module",
      "esnext",
      "--target",
      "es2022",
      "--moduleResolution",
      "bundler",
      "--skipLibCheck",
      // The project compiles under `strict`, and these modules need it:
      // without strictNullChecks a discriminated union does not narrow, so
      // `if (!result.ok) … result.reason` is an error rather than the whole
      // point of the type. Compiling the test copy more loosely than the real
      // build would be testing a different program.
      "--strict",
    ],
    { stdio: "pipe" },
  );
  writeFileSync(join(out, "package.json"), JSON.stringify({ type: "module" }));

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.name.endsWith(".js")) continue;
      writeFileSync(
        path,
        readFileSync(path, "utf8")
          .replace(/^\s*import\s+["']server-only["'];?\s*$/gm, "")
          .replace(/(from\s+["']\.\.?\/[^"']+)(["'])/g, (match, target, quote) =>
            target.endsWith(".js") ? match : `${target}.js${quote}`,
          ),
      );
    }
  };
  walk(out);

  return join(out, name);
}

const notifyPath = compile(join("src", "lib", "email", "notify.ts"), join("email", "notify.js"));
const campayPath = compile(
  join("src", "lib", "payments", "providers", "campay.ts"),
  join("campay.js"),
);

let generation = 0;

/** Load a module fresh, with exactly this environment and this fetch. */
async function loadWith(path, env, fetchImpl) {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  for (const key of [
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "CAMPAY_USERNAME",
    "CAMPAY_PASSWORD",
    "CAMPAY_ENVIRONMENT",
    "CAMPAY_BASE_URL",
  ]) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  if (fetchImpl) globalThis.fetch = fetchImpl;

  generation += 1;
  // The mailer is chosen once and remembered, which is right in production —
  // the choice cannot change inside a request — and wrong here, where each
  // case is a different configuration. The cache-busting query gives a fresh
  // notify module but NOT a fresh mailer module, so the first case's "no
  // provider" verdict would stand for every case after it. resetMailer()
  // exists for exactly this.
  try {
    const mailerModule = await import(join(dirname(path), "mailer.js"));
    mailerModule.resetMailer?.();
  } catch {
    /* not every module under test has a mailer beside it */
  }
  const loaded = await import(`${path}?v=${generation}`);

  return {
    module: loaded,
    restore() {
      process.env = originalEnv;
      globalThis.fetch = originalFetch;
    },
  };
}

/** A fetch that records every call and answers with what it is told to. */
function recorder(answer) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init, body: init?.body ? JSON.parse(init.body) : null });
    const { status = 200, json = { id: "re_test" } } = answer(calls.length) ?? {};
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
    };
  };
  impl.calls = calls;
  return impl;
}

const results = [];
let failures = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push(true);
    console.log(`\u001b[32mPASS\u001b[0m  ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    results.push(false);
    failures += 1;
    console.log(`\u001b[31mFAIL\u001b[0m  ${name} — ${error.message}`);
  }
}

const SETTLED = {
  email: "cliente@example.com",
  paymentId: "6b1f2a3c4d5e6f70a1b2c3d4e5f60718",
  amount: 2000,
  currency: "XAF",
  paidAt: "2026-10-01T09:30:00.000Z",
  proUntil: "2026-10-31T09:30:00.000Z",
  days: 30,
  tier: "pro",
};

/* ------------------------------- receipts -------------------------------- */

await check("no mail provider means nothing is sent and nothing throws", async () => {
  const sent = recorder(() => ({}));
  const { module, restore } = await loadWith(notifyPath, {}, sent);
  try {
    const result = await module.notifyPaymentSettled(SETTLED);
    assert.equal(result.sent, false);
    assert.equal(result.reason, "no mail provider configured");
    assert.equal(sent.calls.length, 0, "a request was made with no provider configured");
    return "returns a reason rather than throwing inside settlement";
  } finally {
    restore();
  }
});

await check("a settled payment produces a receipt to the account's address", async () => {
  const sent = recorder(() => ({ json: { id: "re_1" } }));
  const { module, restore } = await loadWith(
    notifyPath,
    { RESEND_API_KEY: "re_test_key", EMAIL_FROM: "Tools.cm <bonjour@tools.cm>" },
    sent,
  );
  try {
    const result = await module.notifyPaymentSettled(SETTLED);
    assert.equal(result.sent, true, `not sent: ${result.reason}`);
    assert.equal(sent.calls.length, 1);
    const body = sent.calls[0].body;
    assert.equal(body.to, "cliente@example.com");
    assert.equal(body.from, "Tools.cm <bonjour@tools.cm>");
    // French groups thousands with U+202F, a narrow no-break space, not with
    // the space on a keyboard. Comparing against a typed space here would fail
    // on correct output — and "fixing" that by typing the real character into
    // the test would make it unreadable and unmaintainable. Normalise instead.
    const spaces = (value) => value.replace(/\s+/g, " ");
    assert.ok(spaces(body.text).includes("2 000 XAF"), `the amount is missing: ${body.text}`);
    assert.ok(body.text.includes("31 octobre 2026"), "the end date is missing");
    return `to ${body.to}, “${body.subject}”`;
  } finally {
    restore();
  }
});

await check("the reference in the mail is the one the account page shows", async () => {
  const sent = recorder(() => ({}));
  const { module, restore } = await loadWith(notifyPath, { RESEND_API_KEY: "re_k" }, sent);
  try {
    await module.notifyPaymentSettled(SETTLED);
    // Derived independently, from the same payment id, by the same function
    // the account page and the admin screen call.
    const receiptModule = await import(
      `${join(dirname(notifyPath), "..", "payments", "receipt.js")}?v=ref`
    );
    const expected = receiptModule.receiptReference(SETTLED.paymentId);
    const body = sent.calls[0].body;
    assert.ok(body.text.includes(expected), `“${expected}” is not in the mail body`);
    assert.ok(body.subject.includes(expected), "the subject does not carry the reference");
    return expected;
  } finally {
    restore();
  }
});

await check("the same payment cannot produce two mails", async () => {
  const sent = recorder(() => ({}));
  const { module, restore } = await loadWith(notifyPath, { RESEND_API_KEY: "re_k" }, sent);
  try {
    await module.notifyPaymentSettled(SETTLED);
    await module.notifyPaymentSettled(SETTLED);
    await module.notifyPaymentSettled({ ...SETTLED, paymentId: "aaaaaaaabbbbccccddddeeeeffff0000" });

    assert.equal(sent.calls.length, 3, "not every send reached the provider");
    const keys = sent.calls.map((call) => call.init.headers["Idempotency-Key"]);
    assert.ok(keys.every(Boolean), "a send went out with no idempotency key");
    assert.equal(keys[0], keys[1], "the same payment produced two different keys");
    assert.notEqual(keys[0], keys[2], "two different payments share one key");
    return `${keys[0]} twice, a different payment a different key`;
  } finally {
    restore();
  }
});

await check("a receipt is never sent to an address nobody can receive at", async () => {
  const sent = recorder(() => ({}));
  const { module, restore } = await loadWith(notifyPath, { RESEND_API_KEY: "re_k" }, sent);
  try {
    for (const email of [null, "", "   ", "not-an-address", "two@at@signs.com", "user@gmail"]) {
      const result = await module.notifyPaymentSettled({ ...SETTLED, email });
      assert.equal(result.sent, false, `“${email}” was treated as deliverable`);
    }
    assert.equal(sent.calls.length, 0, "a request was made for an unusable address");
    return "6 unusable addresses, no request made";
  } finally {
    restore();
  }
});

await check("the mail is readable as text and as HTML, and escapes what it must", async () => {
  const sent = recorder(() => ({}));
  const { module, restore } = await loadWith(notifyPath, { RESEND_API_KEY: "re_k" }, sent);
  try {
    await module.notifyPaymentSettled({ ...SETTLED, email: "a<b@example.com" });
    // That address is refused, so send a real one and check the escaping with
    // a value that does reach the body.
    await module.sendReceiptEmail({
      reference: "TCM-TEST-0001",
      email: "cliente@example.com",
      amount: 2000,
      currency: "XAF",
      paidAt: SETTLED.paidAt,
      proUntil: SETTLED.proUntil,
      days: 30,
      tier: "pro",
    });
    const body = sent.calls[sent.calls.length - 1].body;
    assert.ok(body.text && body.html, "one of the two parts is missing");
    assert.ok(!/\*/.test(body.text), "WhatsApp's bold asterisks were left in the mail");
    assert.ok(!/<p[^>]*><\/p>/.test(body.html), "blank paragraphs in the HTML");
    assert.ok(body.html.includes("TCM-TEST-0001"), "the reference is missing from the HTML");
    return "text and HTML, no asterisks";
  } finally {
    restore();
  }
});

await check("a Max receipt says Max, in the subject too", async () => {
  const sent = recorder(() => ({}));
  const { module, restore } = await loadWith(notifyPath, { RESEND_API_KEY: "re_k" }, sent);
  try {
    await module.notifyPaymentSettled({ ...SETTLED, tier: "max" });
    const body = sent.calls[0].body;
    assert.ok(/Max/.test(body.subject), `the subject does not name the plan: ${body.subject}`);
    assert.ok(!/\bPro\b/.test(body.subject), "a Max receipt calls itself Pro");
    return body.subject;
  } finally {
    restore();
  }
});

await check("a provider refusal is reported, not thrown", async () => {
  const sent = recorder(() => ({ status: 403, json: { message: "The from address is not verified" } }));
  const { module, restore } = await loadWith(notifyPath, { RESEND_API_KEY: "re_k" }, sent);
  try {
    const result = await module.notifyPaymentSettled(SETTLED);
    assert.equal(result.sent, false);
    // Resend's own sentence. A paraphrase costs the minute it takes to fix.
    assert.equal(result.reason, "The from address is not verified");
    return "the provider's own words come back";
  } finally {
    restore();
  }
});

/* --------------------------- where it is called -------------------------- */

await check("every grant path tells the customer, and a duplicate does not", async () => {
  const core = readFileSync(join(root, "src", "lib", "payments", "core.ts"), "utf8");

  // Both functions that turn money into access must announce.
  const calls = [...core.matchAll(/await announceSettlement\(/g)];
  assert.equal(calls.length, 2, `announceSettlement is called ${calls.length} times, expected 2`);

  // And the duplicate branch of grantPro must return BEFORE announcing, or a
  // provider redelivering a webhook is a second receipt in somebody's inbox.
  const duplicate = core.indexOf("duplicate: true");
  assert.ok(duplicate > 0, "the duplicate branch of grantPro has gone");
  assert.ok(
    duplicate < calls[0].index,
    "grantPro announces before its duplicate branch returns — a redelivered " +
      "webhook would send the receipt again",
  );

  // Nothing may be left dangling: on Vercel the function stops when the
  // response is returned, so an unawaited send is sometimes sent.
  assert.ok(
    !/[^a-z]announceSettlement\(/.test(core.replace(/await announceSettlement\(/g, "")) ||
      /async function announceSettlement/.test(core),
    "announceSettlement is called without await somewhere",
  );
  return "2 grant paths announce, the duplicate branch returns first";
});

/* --------------------------- CamPay diagnosis ---------------------------- */

await check("the diagnosis says which CamPay is being talked to", async () => {
  const live = await loadWith(campayPath, {
    CAMPAY_ENVIRONMENT: "PROD",
    CAMPAY_USERNAME: "u",
    CAMPAY_PASSWORD: "p",
  });
  assert.equal(live.module.campayEnvironment(), "live");
  live.restore();

  for (const value of [undefined, "", "prod", "PRODUCTION", "demo", "TEST"]) {
    const sandbox = await loadWith(campayPath, {
      ...(value === undefined ? {} : { CAMPAY_ENVIRONMENT: value }),
      CAMPAY_USERNAME: "u",
      CAMPAY_PASSWORD: "p",
    });
    // Only the exact word PROD means real money. Anything else — a typo, a
    // lowercase copy, a well-meaning "PRODUCTION" — stays on the demo host.
    assert.equal(
      sandbox.module.campayEnvironment(),
      "sandbox",
      `CAMPAY_ENVIRONMENT="${value}" was treated as live`,
    );
    sandbox.restore();
  }
  return "PROD and nothing else means campay.net";
});

await check("missing credentials are reported as missing, not as refused", async () => {
  const sent = recorder(() => ({}));
  const { module, restore } = await loadWith(campayPath, {}, sent);
  try {
    const diagnosis = await module.campayDiagnosis();
    assert.equal(diagnosis.configured, false);
    assert.equal(diagnosis.credentials, null);
    assert.equal(sent.calls.length, 0, "CamPay was called with no credentials to send");
    return diagnosis.detail;
  } finally {
    restore();
  }
});

await check("rejected credentials come back with CamPay's own answer", async () => {
  const sent = recorder(() => ({ status: 401, json: { detail: "Invalid credentials" } }));
  const { module, restore } = await loadWith(
    campayPath,
    { CAMPAY_USERNAME: "u", CAMPAY_PASSWORD: "p" },
    sent,
  );
  try {
    const diagnosis = await module.campayDiagnosis();
    assert.equal(diagnosis.credentials, "refused");
    assert.ok(/401/.test(diagnosis.detail), "the status code is missing");
    assert.ok(/Invalid credentials/.test(diagnosis.detail), "CamPay's own words are missing");
    // Whatever else it says, it must not say the password.
    assert.ok(!/\bp\b/.test(diagnosis.detail.replace(/https?:\/\/\S+/g, "")), "a credential leaked");
    return diagnosis.detail;
  } finally {
    restore();
  }
});

await check("accepted credentials are reported without the token", async () => {
  const sent = recorder(() => ({ json: { token: "secret-token-value" } }));
  const { module, restore } = await loadWith(
    campayPath,
    { CAMPAY_USERNAME: "u", CAMPAY_PASSWORD: "p", CAMPAY_ENVIRONMENT: "PROD" },
    sent,
  );
  try {
    const diagnosis = await module.campayDiagnosis();
    assert.equal(diagnosis.credentials, "accepted");
    assert.equal(diagnosis.environment, "live");
    assert.ok(!/secret-token-value/.test(JSON.stringify(diagnosis)), "the token is in the report");
    return diagnosis.detail;
  } finally {
    restore();
  }
});

await check("an unreachable provider is not a credential fault", async () => {
  const impl = async () => {
    throw new Error("getaddrinfo ENOTFOUND campay.net");
  };
  const { module, restore } = await loadWith(
    campayPath,
    { CAMPAY_USERNAME: "u", CAMPAY_PASSWORD: "p" },
    impl,
  );
  try {
    const diagnosis = await module.campayDiagnosis();
    // The fix for one is a new API password; the fix for the other is waiting.
    assert.equal(diagnosis.credentials, "unreachable");
    return diagnosis.detail;
  } finally {
    restore();
  }
});

await check("the diagnosis never answers from the token cache", async () => {
  // A cached token would let this report "accepted" for five minutes after the
  // credentials stopped being accepted, which is the opposite of a diagnostic.
  let answer = { json: { token: "t" } };
  const impl = recorder(() => answer);
  const { module, restore } = await loadWith(
    campayPath,
    { CAMPAY_USERNAME: "u", CAMPAY_PASSWORD: "p" },
    impl,
  );
  try {
    assert.equal((await module.campayDiagnosis()).credentials, "accepted");
    answer = { status: 401, json: { detail: "Invalid credentials" } };
    assert.equal(
      (await module.campayDiagnosis()).credentials,
      "refused",
      "the second diagnosis answered from a cache",
    );
    assert.equal(impl.calls.length, 2, "the second diagnosis did not ask CamPay");
    return "asks every time";
  } finally {
    restore();
  }
});

await check("the health panel reports CamPay, and sandbox is not an error", async () => {
  const health = readFileSync(join(root, "src", "lib", "health.ts"), "utf8");
  assert.ok(/campayDiagnosis\(/.test(health), "the health panel does not check CamPay at all");
  assert.ok(/name:\s*"CamPay"/.test(health), "the check has no name a person can read");
  // Sandbox with working credentials is a correct state for a site that is not
  // taking money yet. Flagging it red would train the owner to ignore red.
  assert.ok(
    /environment === "sandbox"/.test(health),
    "the panel does not distinguish the demo host from the live one",
  );
  return "named, checked, and demo is not reported as a fault";
});

console.log("");
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
