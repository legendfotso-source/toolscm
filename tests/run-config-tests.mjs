/**
 * Configuration that must survive being half filled in.
 *
 *   npm run test:config
 *
 * Every check here exists because of a real failure. A hosting dashboard
 * invites you to create a variable and leave the box empty, and `??` does not
 * catch that — it falls back only on null and undefined, so an empty string
 * sails straight through. The first deployment of this project died on exactly
 * that: `NEXT_PUBLIC_SITE_URL` existed, was blank, and `new URL("")` threw
 * "Invalid URL" from a stack trace pointing at layout.tsx rather than at the
 * empty setting.
 *
 * The rule these tests enforce: a missing or blank setting degrades to a
 * sensible default. It never fails a build, and it never silently erases
 * something the site needs — like the phone number people are supposed to pay.
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/**
 * site.ts reads process.env at module load, so each case needs a fresh module.
 * Compiled once; imported many times with a changing cache-busting query.
 */
function compile(relative = join("src", "lib", "site.ts"), name = "site.js") {
  const out = mkdtempSync(join(tmpdir(), "toolscm-config-"));
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
    ],
    { stdio: "pipe" },
  );
  writeFileSync(join(out, "package.json"), JSON.stringify({ type: "module" }));

  // `import "server-only"` is a Next build-time guard — it exists to make a
  // client component importing a server module fail at build. Node has no such
  // package, so the line is stripped from the compiled copy rather than the
  // module being excluded from the tests: the guard is the thing we WANT in
  // the real file, and a test that could not run because of it would push
  // somebody to remove it.
  // tsc emits every file the entry point imports, and leaves the specifiers
  // extensionless — which Node's ESM resolver refuses. Both fixes are applied
  // to every emitted file rather than only the entry point, so a module that
  // gains an import tomorrow does not break this harness.
  for (const emitted of readdirSync(out)) {
    if (!emitted.endsWith(".js")) continue;
    const path = join(out, emitted);
    writeFileSync(
      path,
      readFileSync(path, "utf8")
        .replace(/^\s*import\s+["']server-only["'];?\s*$/gm, "")
        .replace(
          /(from\s+["']\.\.?\/[^"']+)(["'])/g,
          (match, target, quote) => (target.endsWith(".js") ? match : `${target}.js${quote}`),
        ),
    );
  }
  return join(out, name);
}

const compiled = compile();
let generation = 0;

/** Load site.ts fresh with exactly this environment. */
async function loadWith(env) {
  const original = { ...process.env };

  // Clear every variable the module reads, so one case cannot leak into the next.
  for (const key of [
    "NEXT_PUBLIC_SITE_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "VERCEL_URL",
    "NEXT_PUBLIC_SUPPORT_EMAIL",
    "NEXT_PUBLIC_MTN_NUMBER",
    "NEXT_PUBLIC_MTN_NAME",
    "NEXT_PUBLIC_ORANGE_NUMBER",
    "NEXT_PUBLIC_ORANGE_NAME",
    "NEXT_PUBLIC_SUPPORT_WHATSAPP",
  ]) {
    delete process.env[key];
  }
  Object.assign(process.env, env);

  generation += 1;
  const loaded = await import(`${compiled}?v=${generation}`);

  process.env = original;
  return loaded;
}

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

/* ---------------- the bug that broke the first deployment ---------------- */

await check("an EMPTY site URL still builds a valid address", async () => {
  // The exact failure: the variable exists, the box was left blank.
  const site = await loadWith({ NEXT_PUBLIC_SITE_URL: "" });
  assert.ok(site.SITE_URL, "SITE_URL is empty");
  assert.doesNotThrow(() => new URL(site.SITE_URL), "new URL() would throw at build time");
  return site.SITE_URL;
});

await check("a whitespace-only site URL is treated as not set", async () => {
  const site = await loadWith({ NEXT_PUBLIC_SITE_URL: "   " });
  assert.doesNotThrow(() => new URL(site.SITE_URL));
  assert.equal(site.SITE_URL, "https://tools.cm");
  return "falls back rather than building a broken URL";
});

await check("a missing site URL falls back to the real domain", async () => {
  const site = await loadWith({});
  assert.equal(site.SITE_URL, "https://tools.cm");
  return site.SITE_URL;
});

await check("an explicit site URL wins, with any trailing slashes removed", async () => {
  // Trailing slashes matter: absoluteUrl would otherwise produce "//pricing".
  const site = await loadWith({ NEXT_PUBLIC_SITE_URL: "https://tools.cm///" });
  assert.equal(site.SITE_URL, "https://tools.cm");
  assert.equal(site.absoluteUrl("/pricing"), "https://tools.cm/pricing");
  return "no double slash in the canonical URL";
});

await check("a preview deployment uses the URL the host provides", async () => {
  const site = await loadWith({ VERCEL_URL: "toolscm-abc123.vercel.app" });
  assert.equal(site.SITE_URL, "https://toolscm-abc123.vercel.app");
  return site.SITE_URL;
});

await check("the production domain beats the per-deployment URL", async () => {
  const site = await loadWith({
    VERCEL_PROJECT_PRODUCTION_URL: "tools.cm",
    VERCEL_URL: "toolscm-abc123.vercel.app",
  });
  assert.equal(site.SITE_URL, "https://tools.cm");
  return "canonical URLs point at the real domain, not the preview";
});

/* ---------------- the same trap elsewhere ---------------- */

await check("an empty Mobile Money number does not erase the number", async () => {
  // This one would not crash. It would quietly publish payment instructions
  // with nothing to pay to, which is worse than a failed build.
  const site = await loadWith({ NEXT_PUBLIC_MTN_NUMBER: "", NEXT_PUBLIC_MTN_NAME: "  " });
  const mtn = site.MOMO_ACCOUNTS.find((a) => a.operator === "MTN");
  assert.ok(mtn, "the MTN account disappeared entirely");
  assert.ok(mtn.number.trim(), "the MTN number is blank");
  assert.ok(mtn.name.trim(), "the MTN name is blank");
  return `${mtn.number} still shown`;
});

await check("both operators are offered by default", async () => {
  const site = await loadWith({});
  assert.equal(site.MOMO_ACCOUNTS.length, 2);
  assert.deepEqual(
    site.MOMO_ACCOUNTS.map((a) => a.operator).sort(),
    ["MTN", "Orange"],
  );
  assert.ok(site.isManualPaymentAvailable());
  return "MTN and Orange";
});

await check("a custom number replaces the default", async () => {
  const site = await loadWith({ NEXT_PUBLIC_MTN_NUMBER: "+237 600 00 00 00" });
  const mtn = site.MOMO_ACCOUNTS.find((a) => a.operator === "MTN");
  assert.equal(mtn.number, "+237 600 00 00 00");
  return "override works";
});

await check("an empty support email does not become an empty mailto link", async () => {
  const site = await loadWith({ NEXT_PUBLIC_SUPPORT_EMAIL: "" });
  assert.ok(site.SUPPORT_EMAIL.includes("@"), `got "${site.SUPPORT_EMAIL}"`);
  return site.SUPPORT_EMAIL;
});

await check("an empty WhatsApp number falls back rather than breaking the link", async () => {
  const site = await loadWith({ NEXT_PUBLIC_SUPPORT_WHATSAPP: "" });
  assert.ok(site.SUPPORT_WHATSAPP.length >= 11, `got "${site.SUPPORT_WHATSAPP}"`);
  return site.SUPPORT_WHATSAPP;
});

await check("a WhatsApp number written with spaces and + still works", async () => {
  const site = await loadWith({ NEXT_PUBLIC_SUPPORT_WHATSAPP: "+237 652 11 64 11" });
  assert.equal(site.SUPPORT_WHATSAPP, "237652116411");
  return "punctuation stripped for the wa.me link";
});

/* ---------------- the promise the visitor counting makes ---------------- */

/**
 * These four checks are the whole reason page_views is allowed to exist.
 *
 * The privacy policy tells visitors, in plain French, that we can count how
 * many people came today but cannot tell who came back yesterday. That is a
 * claim about a hash function, and a claim about a hash function is either
 * tested or it is decoration.
 */
const hash = await import(compile(join("src", "lib", "usage", "hash.ts"), "hash.js"));

const IP = "102.244.17.9";
const AGENT = "Mozilla/5.0 (Linux; Android 10; TECNO KE5)";

await check("the same visitor on the same day counts as one person", async () => {
  const a = hash.dailyFingerprint("salt", "2026-09-12", IP, AGENT);
  const b = hash.dailyFingerprint("salt", "2026-09-12", IP, AGENT);
  assert.equal(a, b);
  return "repeat visits increment a row rather than inventing a visitor";
});

await check("the same visitor TOMORROW is a different, unlinkable value", async () => {
  // This is the property the privacy policy describes. If it ever stopped
  // holding, the site would quietly be keeping browsing histories.
  const today = hash.dailyFingerprint("salt", "2026-09-12", IP, AGENT);
  const tomorrow = hash.dailyFingerprint("salt", "2026-09-13", IP, AGENT);
  assert.notEqual(today, tomorrow, "the day is not part of the hash");
  return "no history can be assembled across days";
});

await check("the fingerprint gives away nothing about the address", async () => {
  const digest = hash.dailyFingerprint("salt", "2026-09-12", IP, AGENT);
  assert.ok(!digest.includes(IP), "the raw IP is in the output");
  assert.ok(!digest.includes("102"), "part of the raw IP is in the output");
  assert.ok(!digest.includes("Android"), "part of the user agent is in the output");
  assert.match(digest, /^[A-Za-z0-9_-]{32}$/, `unexpected shape: ${digest}`);
  return "an opaque 32-character digest";
});

await check("rotating the salt invalidates every stored fingerprint", async () => {
  const before = hash.dailyFingerprint("salt", "2026-09-12", IP, AGENT);
  const after = hash.dailyFingerprint("a new salt", "2026-09-12", IP, AGENT);
  assert.notEqual(before, after);
  return "changing USAGE_HASH_SALT really does start again from nothing";
});

await check("the anti-abuse fingerprint is stable, unlike the visitor one", async () => {
  // The two must not be confused: the daily allowance would reset at midnight
  // UTC for everyone if the ceiling used the forgetful hash, and the audience
  // figures would become a browsing history if it used the stable one.
  const monday = hash.stableFingerprint("salt", IP, AGENT);
  const tuesday = hash.stableFingerprint("salt", IP, AGENT);
  assert.equal(monday, tuesday);
  assert.notEqual(monday, hash.dailyFingerprint("salt", "2026-09-12", IP, AGENT));
  return "two fingerprints, two different jobs";
});

/* ---------------- metadata that must not repeat itself ---------------- */

await check("no page title repeats the site name the template already adds", async () => {
  // The root layout sets `template: "%s — Tools.cm"`, which Next.js applies to
  // every CHILD segment. A page that also writes "— Tools.cm" into its own
  // title therefore ships "Connexion — Tools.cm — Tools.cm" to Google. That is
  // what the live site did on its first successful deployment.
  //
  // app/page.tsx is deliberately exempt: it sits in the SAME segment as the
  // root layout, so the template does not apply to it and it has to spell the
  // site name out itself.
  const { readdirSync, readFileSync, statSync } = await import("node:fs");

  const appDir = join(root, "src", "app");
  const offenders = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/^page\.tsx$/.test(entry)) continue;
      if (full === join(appDir, "page.tsx")) continue; // same segment as the layout

      const source = readFileSync(full, "utf8");
      for (const match of source.matchAll(/title:\s*"([^"]*)"/g)) {
        if (match[1].includes("Tools.cm")) {
          offenders.push(`${full.slice(root.length + 1)} → "${match[1]}"`);
        }
      }
    }
  };
  walk(appDir);

  assert.deepEqual(offenders, [], `titles that double the suffix:\n  ${offenders.join("\n  ")}`);
  return "the template is the only place the site name is appended";
});

await check("the root layout still supplies the title template", async () => {
  // If this ever disappears, the check above would pass while every page lost
  // its site name entirely — a silent regression in the opposite direction.
  const { readFileSync } = await import("node:fs");
  const layout = readFileSync(join(root, "src", "app", "layout.tsx"), "utf8");
  assert.match(layout, /template:\s*"%s — Tools\.cm"/, "the title template is gone");
  return "%s — Tools.cm";
});

/* ---------------- who may use a tool ---------------- */

const access = await import(compile(join("src", "lib", "auth", "access.ts"), "access.js"));

await check("a signed-out visitor is refused whenever accounts exist", () => {
  assert.equal(access.signInGate(true, null), "sign_in_required");
  assert.equal(access.signInGate(true, "user-1"), "ok");
  // With no Supabase there are no accounts to sign in to. Requiring one would
  // lock everybody out of a site that has no way to let them in.
  assert.equal(access.signInGate(false, null), "ok");
  return "no session + accounts on = refused";
});

await check("the way back after signing in can only be a page on this site", () => {
  const ok = ["/tool/merge-pdf", "/pricing", "/account?tab=receipts"];
  for (const path of ok) assert.equal(access.safeNext(path), path);

  // Every one of these is read by some browser or URL parser as ANOTHER
  // website, or is not a path at all.
  const hostile = [
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "evil.example",
    "",
    null,
    undefined,
  ];
  for (const value of hostile) {
    assert.equal(access.safeNext(value), "/account", `accepted ${JSON.stringify(value)}`);
  }
  assert.equal(access.signInHref("//evil.example"), "/signin?next=%2F");
  return `${ok.length} kept, ${hostile.length} refused`;
});


// ---------------------------------------------------------------------------
// The contact form (phase 3)
// ---------------------------------------------------------------------------

await check("the email check keeps real addresses and refuses unusable ones", async () => {
  // Deliberately not an RFC 5322 regex. On a contact form, over-strict
  // validation turns away the customer who most wants to reach you, and the
  // only thing worth asserting is the shape that makes a REPLY possible.
  const contact = await import(
    `file://${compile(join("src", "lib", "email", "address.ts"), "address.js")}`
  );

  const real = [
    "legendfotso@gmail.com",
    "a@b.cm",
    "jean-pierre.ndjock+devis@orange.cm",
    "KOUOKAM.Simo@possa-tech.co.uk",
    "service_client@tools.africa",
  ];
  for (const address of real) {
    assert.equal(contact.looksLikeEmail(address), true, `refused a real address: ${address}`);
  }

  const unusable = [
    "",
    "   ",
    "legendfotso",
    "legendfotso@",
    "@gmail.com",
    "legendfotso@gmail",          // no dot: nothing to deliver to
    "two@@gmail.com",
    "with space@gmail.com",
    "a@b.c d",
    `${"x".repeat(330)}@gmail.com`,
  ];
  for (const address of unusable) {
    assert.equal(
      contact.looksLikeEmail(address),
      false,
      `accepted an address we could never reply to: ${JSON.stringify(address)}`,
    );
  }
  return `${real.length} kept, ${unusable.length} refused`;
});

await check("contact messages go where the server says, never where the body says", async () => {
  // An endpoint that emails wherever the request asks is an open relay with a
  // nice form on it. The recipient is read from the environment, and the route
  // never passes anything from the body into it.
  const mailer = await import(
    `file://${compile(join("src", "lib", "email", "mailer.ts"), "mailer.js")}`
  );

  const previous = process.env.CONTACT_TO_EMAIL;
  try {
    delete process.env.CONTACT_TO_EMAIL;
    assert.equal(mailer.contactRecipient(), "legendfotso@gmail.com", "wrong default recipient");
    process.env.CONTACT_TO_EMAIL = "someone-else@example.com";
    assert.equal(mailer.contactRecipient(), "someone-else@example.com");
  } finally {
    if (previous === undefined) delete process.env.CONTACT_TO_EMAIL;
    else process.env.CONTACT_TO_EMAIL = previous;
  }

  // And the route must not read a recipient from the request at all.
  const source = readFileSync(join(root, "src", "app", "api", "contact", "route.ts"), "utf8");
  for (const needle of ["body.to", "input.to", "parsed.data.to"]) {
    assert.equal(source.includes(needle), false, `the route reads ${needle} from the request`);
  }
  // And the schema has no recipient field to read in the first place.
  assert.equal(/\bto:\s*z\./.test(source), false, "the request schema accepts a recipient");
  return "default is legendfotso@gmail.com, overridable only by the server";
});

await check("no mail provider means no false confirmation", async () => {
  // The worst possible behaviour here is a stub that pretends to send: the
  // site would tell a customer "message sent" when the message reached nobody,
  // and nothing anywhere would say so. With no key configured, send() reports
  // failure and the row records it.
  const mailer = await import(
    `file://${compile(join("src", "lib", "email", "mailer.ts"), "mailer.js")}?v=2`
  );
  const previous = process.env.RESEND_API_KEY;
  try {
    delete process.env.RESEND_API_KEY;
    mailer.resetMailer();
    assert.equal(mailer.mailConfigured(), false, "claimed a mailer with no key");
    const result = await mailer.send({ to: "a@b.cm", subject: "x", text: "y" });
    assert.equal(result.ok, false, "reported success with no provider configured");
    assert.equal(result.reason, "no_mail_provider");
  } finally {
    if (previous === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous;
    mailer.resetMailer();
  }
  return "send() fails honestly rather than pretending";
});


await check("every admin page and endpoint gates on the role, in its own file", async () => {
  // A structural check, and it exists because the behavioural one cannot work.
  //
  // The access suite runs against a build with no database, so /admin/user/:id
  // answers 404 whether or not it checks the role — the account lookup returns
  // nothing either way. Deleting the gate from that page therefore passes
  // every behavioural test, which makes this the one invariant that has to be
  // asserted structurally.
  //
  // What it really protects is the NEXT admin screen. Somebody adding
  // /admin/payments in six months copies an existing file; if they copy one
  // without a gate, nothing anywhere notices until a stranger reads it.
  const roots = [
    join(root, "src", "app", "admin"),
    join(root, "src", "app", "api", "admin"),
  ];

  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  for (const dir of roots) walk(dir);

  assert.ok(files.length >= 5, `expected several admin files, found ${files.length}`);

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const where = file.slice(root.length + 1);

    // Either gate is acceptable; what is not acceptable is neither.
    const gated = /currentRole\(\)/.test(source) || /isAdmin\(\)/.test(source);
    assert.ok(gated, `${where} has no role check at all`);

    // And the role must be COMPARED, not merely computed.
    //
    // The first version of this check looked for a refusal anywhere in the
    // file, which let the real mutation through: deleting the gate from the
    // detail page leaves a `notFound()` further down — the one for an account
    // that does not exist — so the file still looked as if it refused
    // somebody. It refused the wrong somebody.
    const compares =
      /!\(await isAdmin\(\)\)/.test(source) ||
      /===\s*"user"/.test(source) ||
      /!==\s*"user"/.test(source) ||
      /roleAtLeast\(/.test(source);
    assert.ok(
      compares,
      `${where} works out the role and never compares it to anything`,
    );

    const refuses =
      /notFound\(\)/.test(source) ||
      /status:\s*404/.test(source) ||
      /status:\s*403/.test(source);
    assert.ok(refuses, `${where} compares the role but never refuses anybody`);
  }
  return `${files.length} admin files, every one gated`;
});


await check("the Stripe return verifies, and a missed webhook is survivable", async () => {
  // The worst open defect in the payment flow, and it was one discarded value.
  //
  // `retrieveSession` takes STRIPE's session id, not our reference. The
  // checkout route received the id and threw it away, so the return page had
  // nothing to ask about and the verify route answered "pending" for Stripe
  // unconditionally. Entitlement then rested entirely on the webhook: with
  // STRIPE_WEBHOOK_SECRET unset, or the endpoint misconfigured, or one
  // delivery lost, the customer was charged and never upgraded — and nothing
  // in the application recovered it.
  //
  // Asserted on the source rather than by driving Stripe: the shape of this
  // bug is an omission, and an omission is exactly what a source check sees.
  const checkout = readFileSync(join(root, "src", "app", "api", "checkout", "route.ts"), "utf8");
  assert.ok(
    /attachProviderRef\(\s*"stripe"/.test(checkout),
    "the checkout route does not store the Stripe session id — the return page " +
      "will have nothing to verify against",
  );

  const stripe = readFileSync(
    join(root, "src", "lib", "payments", "providers", "stripe.ts"),
    "utf8",
  );
  assert.ok(
    /sessionId/.test(stripe),
    "createCheckoutSession does not return the session id",
  );

  const verify = readFileSync(
    join(root, "src", "app", "api", "payments", "verify", "route.ts"),
    "utf8",
  );
  assert.ok(
    /retrieveSession\(/.test(verify),
    "the verify route never asks Stripe anything — a missed webhook is unrecoverable",
  );
  // And the session it asks about must be proven to be this payment's.
  assert.ok(
    /verified\.reference\s*!==\s*reference/.test(verify),
    "the verify route settles on a Stripe session without checking it belongs " +
      "to the reference being verified",
  );

  // A terminal refusal must be recorded, and an UNKNOWN status must not be.
  assert.ok(
    /markPaymentFailed\(/.test(verify),
    "a refused payment is never written off; it polls for ever",
  );
  assert.ok(
    /isTerminalFailure/.test(verify),
    "refusal is decided inline rather than by a named, auditable list",
  );
  return "the id is stored, the return verifies, and the session must match";
});

await check("the daily job is actually scheduled, and the code it calls exists", async () => {
  // Phase 5 wrote expireStalePayments() and never called it. The function was
  // correct, tested, and did nothing, which is the quietest possible way to
  // ship nothing — so this check is about the WIRING, not the logic.
  const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  const crons = config.crons ?? [];
  assert.equal(crons.length, 1, `${crons.length} cron entries, expected 1`);

  const [cron] = crons;
  const route = join(root, "src", "app", cron.path.replace(/^\//, ""), "route.ts");
  // A schedule pointing at a path that does not exist is a schedule that runs
  // a 404 every morning, for ever, silently.
  assert.ok(existsSync(route), `${cron.path} is scheduled but ${route} does not exist`);

  // Five fields, and not more often than daily: the platform's free tier
  // allows one run a day, and a schedule it refuses is a schedule that never
  // runs at all.
  const fields = String(cron.schedule).trim().split(/\s+/);
  assert.equal(fields.length, 5, `"${cron.schedule}" is not a 5-field cron expression`);
  assert.ok(!fields[0].includes("*"), `"${cron.schedule}" runs every minute of the hour`);
  assert.ok(!fields[1].includes("*"), `"${cron.schedule}" runs every hour`);

  // And the work itself must be reachable from the route.
  // Import lines are stripped first. Searching the whole file for the NAME
  // passes on a file that imports a function and never calls it, which is the
  // exact defect this check exists to catch — the first version of it did
  // precisely that, and a mutation walked straight through.
  const scheduled = readFileSync(join(root, "src", "lib", "scheduled.ts"), "utf8")
    .split("\n")
    .filter((line) => !/^\s*import\b/.test(line))
    .join("\n");
  for (const called of ["expireStalePayments", "sweepOldHits", "reminderMessage"]) {
    assert.ok(new RegExp(`\\b${called}\\s*\\(`).test(scheduled), `${called} is never called`);
  }
  return `${cron.schedule} → ${cron.path}`;
});

await check("with no CRON_SECRET set, nobody may run the scheduled job", async () => {
  // The failure that would matter: an endpoint which sends mail to customers
  // and writes to the database, left open because nobody had configured a
  // secret yet. "Not configured" must mean shut, never mean open.
  const guard = await import(
    `${compile(join("src", "lib", "cron-auth.ts"), "cron-auth.js")}?v=guard`
  );
  const { bearerMatches } = guard;

  const SECRET = "a-long-random-cron-secret-value";

  for (const empty of ["", "   ", undefined, null]) {
    assert.equal(
      bearerMatches(`Bearer ${SECRET}`, empty),
      false,
      `an unset secret let a request through (${JSON.stringify(empty)})`,
    );
  }
  // Not even an empty bearer against an empty secret.
  assert.equal(bearerMatches("Bearer ", ""), false);
  assert.equal(bearerMatches("Bearer", ""), false);

  // And with a secret set, only the exact value passes.
  assert.equal(bearerMatches(`Bearer ${SECRET}`, SECRET), true, "the real secret was refused");
  assert.equal(bearerMatches(`bearer ${SECRET}`, SECRET), false, "the scheme is case-sensitive");
  assert.equal(bearerMatches(SECRET, SECRET), false, "the scheme is not required");
  assert.equal(bearerMatches(`Bearer ${SECRET}x`, SECRET), false, "a longer token passed");
  assert.equal(bearerMatches(`Bearer ${SECRET.slice(0, -1)}`, SECRET), false, "a prefix passed");
  assert.equal(
    bearerMatches(`Bearer ${SECRET.slice(0, -1)}X`, SECRET), false,
    "a same-length near miss passed — the comparison stops early",
  );
  return "unset means shut; set means exact";
});

console.log("");
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
