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
import { mkdtempSync, writeFileSync } from "node:fs";
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

console.log("");
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
