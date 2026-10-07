/**
 * The money code, actually executed.
 *
 *   npm run test:money
 *
 * `grantPro` and `settlePayment` are the only two functions in this codebase
 * that turn money into access. Every other test so far checked the pure
 * helpers around them — dates, receipts, signatures — while these two had
 * never been run at all.
 *
 * They are compiled from the real source and executed against an in-memory
 * stand-in for Supabase. The SQL guarantees they rely on (the unique index,
 * the conditional update) are verified for real against PostgreSQL in
 * run-db-tests.mjs; this file checks the decisions made around them, which is
 * where a customer ends up with two months or none.
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFakeClient } from "./fake-supabase.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/**
 * Compile the real payment source and point its two Next-only imports at
 * stand-ins.
 *
 * The sources are copied into a temporary directory at the start of every run
 * — copied, not duplicated by hand — so there is no version here that can
 * drift away from what the application ships. Only the Supabase client is
 * swapped.
 */
function loadCore() {
  const out = mkdtempSync(join(tmpdir(), "toolscm-money-"));
  const src = join(out, "src");
  const shim = join(out, "shim");
  mkdirSync(src, { recursive: true });
  mkdirSync(shim, { recursive: true });

  for (const name of ["core.ts", "term.ts", "tiers.ts", "plans.ts", "receipt.ts"]) {
    copyFileSync(join(root, "src", "lib", "payments", name), join(src, name));
  }

  // claims.ts is the approval queue: the code that turns "I have paid" into a
  // subscription. It reaches two modules outside this folder, both by alias,
  // so the specifiers are flattened the same mechanical way entitlement.ts is.
  writeFileSync(
    join(src, "claims.ts"),
    readFileSync(join(root, "src", "lib", "payments", "claims.ts"), "utf8")
      .replace('from "@/lib/settings"', 'from "./settings"'),
  );

  writeFileSync(
    join(src, "settings.ts"),
    readFileSync(join(root, "src", "lib", "settings.ts"), "utf8")
      .replace('from "./supabase/admin"', 'from "@/lib/supabase/admin"'),
  );

  // entitlement.ts is the read side of the same question — who is on which
  // plan — and it is what every page consults. It is copied here too, with
  // only its import specifiers adjusted for the flat layout: three
  // mechanical substitutions, no change to a line of logic.
  writeFileSync(
    join(src, "entitlement.ts"),
    readFileSync(join(root, "src", "lib", "entitlement.ts"), "utf8")
      .replace('from "./payments/tiers"', 'from "./tiers"')
      .replace('from "./supabase/admin"', 'from "@/lib/supabase/admin"')
      .replace('from "./supabase/server-client"', 'from "@/lib/supabase/session"')
      .replace('from "./auth/owner"', 'from "./owner"')
      .replace('from "./accounts"', 'from "./accounts"'),
  );

  // accounts.ts holds account status and granted access — the two things that
  // are true about a person independently of what they bought. entitlement.ts
  // now consults it before evaluating any subscription, so the checks about a
  // blocked account and about granted access run through this file.
  writeFileSync(
    join(src, "accounts.ts"),
    readFileSync(join(root, "src", "lib", "accounts.ts"), "utf8")
      .replace('import "server-only";', "")
      .replace('from "./supabase/admin"', 'from "@/lib/supabase/admin"')
      .replace('from "./payments/tiers"', 'from "./tiers"'),
  );

  // owner.ts decides who owns the platform, and entitlement.ts now asks it
  // BEFORE touching a database — so the checks about OWNER_EMAILS run through
  // this file rather than through a profile row. Copied whole: it reads only
  // process.env, so there is nothing to shim.
  writeFileSync(
    join(src, "owner.ts"),
    readFileSync(join(root, "src", "lib", "auth", "owner.ts"), "utf8")
      .replace('import "server-only";', ""),
  );

  writeFileSync(
    join(shim, "session.ts"),
    `let user: any = null;
     export function setUser(next: any) { user = next; }
     export async function currentUser(): Promise<any> { return user; }`,
  );

  // A notifier that records instead of sending. core.ts announces a settlement
  // through a dynamic import, so the shim has to exist for the real module to
  // compile at all — and having it record turns "did the customer get told"
  // from a regex over the source into something these tests can assert.
  writeFileSync(
    join(shim, "notify.ts"),
    `const sent: any[] = [];
     export function receipts(): any[] { return sent; }
     export function clearReceipts(): void { sent.length = 0; }
     export async function notifyPaymentSettled(settled: any): Promise<any> {
       sent.push(settled);
       return { sent: true, id: "shim" };
     }`,
  );

  writeFileSync(join(shim, "server-only.ts"), "export {};\n");
  // core.ts imports SupabaseClient as a type only. The shape is irrelevant
  // here — the fake is checked by the assertions, not by the compiler.
  writeFileSync(join(shim, "supabase.ts"), "export type SupabaseClient = any;\n");
  writeFileSync(
    join(shim, "admin.ts"),
    // Typed as `any` on purpose: the fake implements only the handful of query
    // builder methods the payment code actually calls, and the point of this
    // shim is to let the real code run, not to re-declare Supabase's types.
    `let client: any = null;
     export function setClient(next: any) { client = next; }
     export function adminClient(): any { return client; }
     export function requireAdminClient(): any {
       if (!client) throw new Error("no client set");
       return client;
     }`,
  );

  const build = join(out, "build");
  writeFileSync(
    join(out, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        rootDir: out,
        outDir: build,
        module: "esnext",
        target: "es2022",
        moduleResolution: "bundler",
        skipLibCheck: true,
        strict: false,
        // entitlement.ts reads OWNER_EMAILS off process.env, so the harness
        // needs Node's globals. Resolved out of the project's own
        // node_modules rather than installed again.
        types: ["node"],
        typeRoots: [join(root, "node_modules", "@types")],
        baseUrl: out,
        paths: {
          "server-only": ["shim/server-only.ts"],
          "@/lib/supabase/admin": ["shim/admin.ts"],
          "@/lib/email/notify": ["shim/notify.ts"],
          "@/lib/supabase/session": ["shim/session.ts"],
          "@supabase/supabase-js": ["shim/supabase.ts"],
        },
      },
      files: [
        "src/core.ts",
        "src/term.ts",
        "src/tiers.ts",
        "src/entitlement.ts",
        "src/owner.ts",
        "src/accounts.ts",
        "src/plans.ts",
        "src/receipt.ts",
        "src/settings.ts",
        "src/claims.ts",
        "shim/notify.ts",
      ],
    }),
  );

  try {
    execFileSync(join(root, "node_modules", ".bin", "tsc"), ["-p", join(out, "tsconfig.json")], {
      stdio: "pipe",
    });
  } catch (error) {
    // tsc reports on stdout; without this the failure arrives as a byte array.
    throw new Error(`could not compile the payment source:\n${error.stdout ?? error.message}`);
  }

  writeFileSync(join(build, "package.json"), JSON.stringify({ type: "module" }));

  // TypeScript emits extensionless relative imports; Node's ESM resolver wants
  // the extension.
  for (const file of [
    "src/core.js",
    "src/term.js",
    "src/tiers.js",
    "src/entitlement.js",
    "src/owner.js",
    "src/accounts.js",
    "src/plans.js",
    "src/receipt.js",
    "src/settings.js",
    "src/claims.js",
    "shim/admin.js",
    "shim/notify.js",
    "shim/session.js",
    "shim/server-only.js",
    "shim/supabase.js",
  ]) {
    const path = join(build, file);
    if (!existsSync(path)) continue;
    // `paths` steers the type checker, but the emitted JavaScript keeps the
    // original specifiers — so the two Next-only ones are rewritten here, and
    // relative imports get the extension Node's ESM resolver insists on.
    const rewritten = readFileSync(path, "utf8")
      .replace(/^\s*import\s+["']server-only["'];?\s*$/gm, "")
      .replace(/from\s+["']@\/lib\/supabase\/admin["']/g, 'from "../shim/admin.js"')
      .replace(/["']@\/lib\/email\/notify["']/g, '"../shim/notify.js"')
      .replace(/from\s+["']@\/lib\/supabase\/session["']/g, 'from "../shim/session.js"')
      .replace(/from\s+["']@supabase\/supabase-js["']/g, 'from "../shim/supabase.js"')
      .replace(
        /(from\s+["']\.\.?\/[^"']+)(["'])/g,
        (match, target, quote) => (target.endsWith(".js") ? match : `${target}.js${quote}`),
      );

    writeFileSync(path, rewritten);
  }

  return build;
}

const out = loadCore();
const core = await import(join(out, "src", "core.js"));
// The tier table is plain data with no Supabase in it, so it compiles and
// imports alongside core.ts and can be asserted on directly.
const { TIERS, TIER_IDS, ALL_TIER_IDS, NO_LIMIT, tierOf, tierPriceXaf, tierAtLeast, fileSizeLimit, batchLimit } =
  await import(join(out, "src", "tiers.js"));
const claims = await import(join(out, "src", "claims.js"));
const settingsModule = await import(join(out, "src", "settings.js"));
const entitlement = await import(join(out, "src", "entitlement.js"));
const stub = await import(join(out, "shim", "admin.js"));
const notify = await import(join(out, "shim", "notify.js"));
const session = await import(join(out, "shim", "session.js"));

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

/** A fresh world with one customer in it. */
function world() {
  const client = createFakeClient({
    profiles: [{ id: "user-1", email: "client@example.com", is_admin: false }],
  });
  stub.setClient(client);
  notify.clearReceipts();
  return client;
}

const days = (from, to) => Math.round((new Date(to) - new Date(from)) / 86_400_000);

/* ---------------- admin-entered payments ---------------- */

await check("activating Pro creates a subscription and records the payment", async () => {
  const client = world();

  const result = await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "MP-0001",
    amount: 2000,
    currency: "XAF",
  });

  assert.equal(result.granted, true);
  assert.equal(client.store.payments.length, 1);
  assert.equal(client.store.payments[0].status, "succeeded");
  assert.equal(client.store.subscriptions.length, 1);
  assert.equal(client.store.subscriptions[0].status, "active");
  assert.equal(days(new Date(), result.proUntil), 30);
  return "one payment, one subscription, thirty days";
});

await check("the payment is linked to the subscription it bought", async () => {
  // Without this the admin view cannot answer "what did this person pay for",
  // which is the first question asked when a payment is disputed.
  const client = world();
  await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "MP-0002",
    amount: 2000,
    currency: "XAF",
  });

  const payment = client.store.payments[0];
  assert.ok(payment.subscription_id, "the payment has no subscription attached");
  assert.equal(payment.subscription_id, client.store.subscriptions[0].id);
  return "payment → subscription";
});

await check("the same transaction id entered twice does NOT grant two months", async () => {
  // The admin is not sure whether they already processed an SMS, so they enter
  // it again. This must be safe.
  const client = world();

  const first = await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "MP-DUPLICATE",
    amount: 2000,
    currency: "XAF",
  });
  const second = await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "MP-DUPLICATE",
    amount: 2000,
    currency: "XAF",
  });

  assert.equal(first.granted, true);
  assert.equal(second.granted, false);
  assert.equal(second.duplicate, true);
  assert.equal(client.store.payments.length, 1, "a second payment row was written");
  assert.equal(client.store.subscriptions.length, 1);
  assert.equal(
    client.store.subscriptions[0].end_date,
    first.proUntil,
    "the subscription was extended by a duplicate",
  );
  return "second attempt changes nothing";
});

await check("a grant tells the customer, exactly once", async () => {
  // The site used to activate access in silence. The customer had sent money
  // from their own Mobile Money account to a phone number and had no way to
  // learn it had worked except to come back and look — which is why every
  // payment used to end in a WhatsApp message asking whether it had.
  world();

  await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "MP-RECEIPT-MAIL",
    amount: 2000,
    currency: "XAF",
    tier: "max",
    days: 90,
  });

  const sent = notify.receipts();
  assert.equal(sent.length, 1, `${sent.length} receipts for one payment`);
  assert.equal(sent[0].email, "client@example.com");
  assert.equal(sent[0].amount, 2000);
  assert.equal(sent[0].currency, "XAF");
  assert.equal(sent[0].tier, "max", "the receipt names the wrong plan");
  assert.equal(sent[0].days, 90);
  // The date on the receipt is the date access actually runs to, not a
  // recomputation of it: a receipt that disagrees with the account page is
  // worse than no receipt.
  assert.equal(days(new Date(), sent[0].proUntil), 90);

  // And a repeat of the same transaction must not produce a second one.
  await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "MP-RECEIPT-MAIL",
    amount: 2000,
    currency: "XAF",
    tier: "max",
    days: 90,
  });
  assert.equal(
    notify.receipts().length,
    1,
    "a redelivered payment sent the receipt again",
  );
  return "one receipt, with the real amount, plan and end date";
});

await check("a duplicate still returns the ORIGINAL receipt", async () => {
  // A customer asking for their receipt a second time must get the same
  // reference, or it stops being a reference.
  world();
  const first = await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "MP-RECEIPT",
    amount: 2000,
    currency: "XAF",
  });
  const second = await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "MP-RECEIPT",
    amount: 2000,
    currency: "XAF",
  });

  assert.equal(second.paymentId, first.paymentId);
  assert.equal(second.paidAt, first.paidAt);
  return "same payment id, same timestamp";
});

await check("renewing extends the existing subscription, it does not create a second", async () => {
  const client = world();

  const first = await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "MP-A",
    amount: 2000,
    currency: "XAF",
  });
  const second = await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "MP-B",
    amount: 2000,
    currency: "XAF",
  });

  assert.equal(client.store.subscriptions.length, 1, "a second subscription row appeared");
  assert.equal(days(first.proUntil, second.proUntil), 30, "the second month was not added on");
  return "one row, sixty days total";
});

await check("a longer plan grants its full length", async () => {
  world();
  const result = await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "MP-QUARTER",
    amount: 5000,
    currency: "XAF",
    days: 90,
  });
  assert.equal(days(new Date(), result.proUntil), 90);
  return "90 days for the quarterly plan";
});

/* ---------------- provider payments ---------------- */

await check("a reserved payment is pending and grants nothing on its own", async () => {
  // Abandoning checkout must not hand out access.
  const client = world();
  await core.createPendingPayment({
    userId: "user-1",
    provider: "notchpay",
    reference: "tcm_pending",
    amount: 2000,
    currency: "XAF",
    days: 30,
  });

  assert.equal(client.store.payments[0].status, "pending");
  assert.equal(client.store.subscriptions.length, 0, "a pending payment granted a subscription");
  return "reserved, nothing granted";
});

await check("settling a reserved payment grants the access it bought", async () => {
  const client = world();
  await core.createPendingPayment({
    userId: "user-1",
    provider: "notchpay",
    reference: "tcm_ok",
    amount: 2000,
    currency: "XAF",
    days: 30,
  });

  const result = await core.settlePayment({ provider: "notchpay", reference: "tcm_ok" });

  assert.equal(result.outcome, "granted");
  assert.equal(result.userId, "user-1");
  assert.equal(client.store.payments[0].status, "succeeded");
  assert.equal(client.store.subscriptions.length, 1);
  assert.equal(days(new Date(), result.proUntil), 30);
  return "granted once";
});

await check("a webhook delivered twice grants ONE month, not two", async () => {
  // Every provider re-delivers. This is the single most expensive bug this
  // code could have.
  const client = world();
  await core.createPendingPayment({
    userId: "user-1",
    provider: "notchpay",
    reference: "tcm_twice",
    amount: 2000,
    currency: "XAF",
    days: 30,
  });

  const first = await core.settlePayment({ provider: "notchpay", reference: "tcm_twice" });
  const second = await core.settlePayment({ provider: "notchpay", reference: "tcm_twice" });

  assert.equal(first.outcome, "granted");
  assert.equal(second.outcome, "already_settled");
  assert.equal(client.store.subscriptions.length, 1);
  assert.equal(
    client.store.subscriptions[0].end_date,
    first.proUntil,
    "the second delivery extended the subscription",
  );
  return "second delivery is a no-op";
});

await check("a webhook receipt goes out once, however many times it is delivered", async () => {
  // The provider path is the one that matters most here: nobody is watching
  // when a webhook lands, so a receipt that depends on an admin noticing is
  // not a receipt. And providers redeliver — three times is normal.
  world();
  await core.createPendingPayment({
    userId: "user-1",
    provider: "campay",
    reference: "tcm_mail",
    amount: 5000,
    currency: "XAF",
    days: 30,
    tier: "pro",
  });

  await core.settlePayment({ provider: "campay", reference: "tcm_mail", amount: 5000, currency: "xaf" });
  await core.settlePayment({ provider: "campay", reference: "tcm_mail" });
  await core.settlePayment({ provider: "campay", reference: "tcm_mail" });

  const sent = notify.receipts();
  assert.equal(sent.length, 1, `${sent.length} receipts for three deliveries of one payment`);
  assert.equal(sent[0].amount, 5000, "the receipt does not say what was actually paid");
  // The provider sent "xaf". A receipt showing a lowercase currency beside a
  // formatted amount looks like a bug to the person reading it.
  assert.equal(sent[0].currency, "XAF");
  return "three deliveries, one receipt, the provider's own amount";
});

await check("a reference we never issued tells nobody anything", async () => {
  // A forged webhook must not become a receipt — which would be a stranger
  // using this site to send mail about a payment that never happened.
  world();
  const result = await core.settlePayment({ provider: "campay", reference: "tcm_forged" });
  assert.equal(result.outcome, "unknown_reference");
  assert.equal(notify.receipts().length, 0, "an unknown reference produced a receipt");
  return "no row, no mail";
});

await check("the webhook and the return page racing still grant one month", async () => {
  // Both call settlePayment at once. Exactly one may win.
  const client = world();
  await core.createPendingPayment({
    userId: "user-1",
    provider: "notchpay",
    reference: "tcm_race",
    amount: 2000,
    currency: "XAF",
    days: 30,
  });

  const [a, b] = await Promise.all([
    core.settlePayment({ provider: "notchpay", reference: "tcm_race" }),
    core.settlePayment({ provider: "notchpay", reference: "tcm_race" }),
  ]);

  const outcomes = [a.outcome, b.outcome].sort();
  assert.deepEqual(outcomes, ["already_settled", "granted"]);
  assert.equal(client.store.subscriptions.length, 1);
  return "one granted, one no-op";
});

await check("the plan length survives the round trip to the provider", async () => {
  // The webhook says money arrived; it does not say what it was for. The
  // length has to come back out of the reserved row, or a customer who paid
  // for a year gets a month.
  world();
  await core.createPendingPayment({
    userId: "user-1",
    provider: "stripe",
    reference: "tcm_year",
    amount: 18_000,
    currency: "XAF",
    days: 360,
  });

  const result = await core.settlePayment({ provider: "stripe", reference: "tcm_year" });
  assert.equal(result.days, 360);
  assert.equal(days(new Date(), result.proUntil), 360);
  return "360 days, not 30";
});

await check("a reference we never issued grants nothing", async () => {
  const client = world();
  const result = await core.settlePayment({ provider: "notchpay", reference: "tcm_invented" });
  assert.equal(result.outcome, "unknown_reference");
  assert.equal(client.store.subscriptions.length, 0);
  return "unknown reference refused";
});

await check("settling records the amount the provider actually charged", async () => {
  // The reserved amount is what we asked for; the settled amount is what was
  // taken. If a provider charges something else, the record must show theirs.
  const client = world();
  await core.createPendingPayment({
    userId: "user-1",
    provider: "notchpay",
    reference: "tcm_amount",
    amount: 2000,
    currency: "XAF",
    days: 30,
  });

  await core.settlePayment({
    provider: "notchpay",
    reference: "tcm_amount",
    amount: 1950,
    currency: "xaf",
  });

  assert.equal(client.store.payments[0].amount, 1950);
  assert.equal(client.store.payments[0].currency, "XAF", "the currency was not normalised");
  return "1950 XAF recorded, currency upper-cased";
});

await check("a provider payment extends an existing subscription too", async () => {
  const client = world();
  const manual = await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "MP-FIRST",
    amount: 2000,
    currency: "XAF",
  });

  await core.createPendingPayment({
    userId: "user-1",
    provider: "notchpay",
    reference: "tcm_extend",
    amount: 2000,
    currency: "XAF",
    days: 30,
  });
  const settled = await core.settlePayment({ provider: "notchpay", reference: "tcm_extend" });

  assert.equal(client.store.subscriptions.length, 1);
  assert.equal(days(manual.proUntil, settled.proUntil), 30);
  return "mixed payment methods, one subscription";
});

await check("looking a customer up by email ignores case", async () => {
  // Nobody types their own address the same way twice.
  world();
  assert.equal(await core.findUserIdByEmail("CLIENT@Example.com"), "user-1");
  assert.equal(await core.findUserIdByEmail("  client@example.com  "), "user-1");
  assert.equal(await core.findUserIdByEmail("nobody@example.com"), null);
  return "case and whitespace tolerant";
});


// ---------------------------------------------------------------------------
// Plan tiers
// ---------------------------------------------------------------------------

await check("a Max payment grants Max, not Pro", async () => {
  // The whole point of a third tier: the money has to buy the thing it was
  // taken for. Recording every sale as "pro" would be a silent refund.
  const client = world();
  await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "max-1",
    amount: 5000,
    currency: "XAF",
    tier: "max",
  });
  assert.equal(client.store.subscriptions[0].tier, "max");
  assert.equal(client.store.payments[0].tier, "max");
  return "the subscription and the payment both say max";
});

await check("a payment with no tier named is Pro, not free", async () => {
  // Every sale made before Max existed was a Pro sale. Reading an absent tier
  // as free would take away something people already paid for.
  const client = world();
  await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "legacy-1",
    amount: 2000,
    currency: "XAF",
  });
  assert.equal(client.store.subscriptions[0].tier, "pro");
  return "an old-style grant still means Pro";
});

await check("upgrading mid-term RAISES the tier", async () => {
  const client = world();
  await core.grantPro({
    userId: "user-1", provider: "manual", transactionId: "p1",
    amount: 2000, currency: "XAF", tier: "pro",
  });
  await core.grantPro({
    userId: "user-1", provider: "manual", transactionId: "p2",
    amount: 5000, currency: "XAF", tier: "max",
  });
  assert.equal(client.store.subscriptions.length, 1);
  assert.equal(client.store.subscriptions[0].tier, "max");
  return "one subscription, now Max";
});

await check("renewing at a LOWER tier does not demote someone mid-term", async () => {
  // Somebody who bought Max and then renews monthly Pro has paid for Max
  // until a date that has not arrived. Quietly dropping them to Pro would be
  // taking back something they own.
  const client = world();
  await core.grantPro({
    userId: "user-1", provider: "manual", transactionId: "m1",
    amount: 5000, currency: "XAF", tier: "max",
  });
  await core.grantPro({
    userId: "user-1", provider: "manual", transactionId: "m2",
    amount: 2000, currency: "XAF", tier: "pro",
  });
  assert.equal(client.store.subscriptions[0].tier, "max");
  return "still Max, and the term got longer";
});

await check("the tier survives the round trip to the payment provider", async () => {
  // The provider tells us the money arrived. It does not tell us what for —
  // that has to be carried in our own record from before the customer left.
  const client = world();
  await core.createPendingPayment({
    userId: "user-1",
    provider: "campay",
    reference: "tcm_max",
    amount: 5000,
    currency: "XAF",
    days: 30,
    tier: "max",
  });
  const settled = await core.settlePayment({ provider: "campay", reference: "tcm_max" });
  assert.equal(settled.outcome, "granted");
  assert.equal(client.store.subscriptions[0].tier, "max");
  return "a webhook cannot downgrade what was bought";
});

await check("an unrecognised tier in the database is read as free, never as paid", async () => {
  for (const value of ["premium", "PRO", "", null, undefined, "admin"]) {
    assert.equal(tierOf(value), "free", `tierOf(${JSON.stringify(value)})`);
  }
  assert.equal(tierOf("pro"), "pro");
  assert.equal(tierOf("max"), "max");
  return "corrupt data fails closed";
});

await check("every limit on the pricing table is a limit the code reads", async () => {
  // A pricing page that promises a number nobody enforces is a lie that takes
  // money. These are the exact figures the comparison table renders.
  assert.equal(TIERS.free.dailyOperations, 3);
  assert.equal(TIERS.pro.dailyOperations, -1);
  assert.equal(TIERS.max.dailyOperations, -1);
  assert.equal(TIERS.free.batchFiles, 3);
  assert.equal(TIERS.pro.batchFiles, 10);
  assert.equal(TIERS.max.batchFiles, 50);
  assert.equal(TIERS.free.zipDownload, false);
  assert.equal(TIERS.pro.zipDownload, true);
  assert.ok(TIERS.max.fileSizeMultiplier > TIERS.pro.fileSizeMultiplier);
  assert.ok(TIERS.pro.fileSizeMultiplier > TIERS.free.fileSizeMultiplier);
  return "free 3/day, Pro and Max uncapped, batch 3 / 10 / 50";
});

await check("Max costs more than Pro at every plan length", async () => {
  const monthly = 2000;
  assert.equal(tierPriceXaf(monthly, "free"), 0);
  assert.equal(tierPriceXaf(monthly, "pro"), 2000);
  assert.equal(tierPriceXaf(monthly, "max"), 5000);
  // And it tracks the admin price rather than being frozen at today's figure.
  assert.ok(tierPriceXaf(4000, "max") > tierPriceXaf(4000, "pro"));
  return "2,000 and 5,000 FCFA, both derived from one admin setting";
});


/* ---------------- reading the plan back ---------------- */

/** A world where a subscription already exists, seen through entitlement.ts. */
function subscriber(tier, { missingColumns = [] } = {}) {
  const far = new Date(Date.now() + 20 * 86_400_000).toISOString();
  const client = createFakeClient(
    {
      profiles: [{ id: "user-1", email: "client@example.com", is_admin: false }],
      subscriptions: [
        { id: "sub-1", user_id: "user-1", status: "active", end_date: far, tier },
      ],
    },
    { missingColumns },
  );
  stub.setClient(client);
  session.setUser({ id: "user-1" });
  return client;
}

await check("the plan a page sees is the plan the database recorded", async () => {
  subscriber("max");
  const max = await entitlement.getEntitlement();
  assert.equal(max.tier, "max");
  assert.equal(max.isPro, true);

  subscriber("pro");
  assert.equal((await entitlement.getEntitlement()).tier, "pro");
  return "max reads as max, pro as pro";
});

await check("a customer stays paid while the tier migration has not been run", async () => {
  // Vercel redeploys the instant the code is pushed; 0002_tiers.sql is run by
  // hand afterwards. In between, the new code asks for a column that does not
  // exist. If that failure fell through to the free plan, every paying
  // customer would lose what they bought until somebody noticed.
  const client = subscriber("pro", { missingColumns: ["tier"] });

  // Prove the world really is pre-migration first. Without this the test
  // passes just as happily against a fake that forgot to refuse the column,
  // which would make it a test of nothing.
  const refused = await client.from("subscriptions").select("end_date, status, tier");
  assert.equal(refused.error?.code, "42703", "the fake did not reproduce a missing column");

  const seen = await entitlement.getEntitlement();
  assert.equal(seen.isPro, true, "a paying customer was downgraded to free");
  assert.equal(seen.tier, "pro", "a paid row with no tier column must read as Pro");
  return "asked again without the column, still Pro";
});

await check("an expired subscription is free whatever tier it says", async () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const client = createFakeClient({
    subscriptions: [
      { id: "sub-1", user_id: "user-1", status: "active", end_date: past, tier: "max" },
    ],
  });
  stub.setClient(client);
  session.setUser({ id: "user-1" });

  const seen = await entitlement.getEntitlement();
  assert.equal(seen.tier, "free");
  assert.equal(seen.isPro, false);
  // And the row is marked expired rather than being re-evaluated for ever.
  assert.equal(client.store.subscriptions[0].status, "expired");
  return "expiry beats the tier column";
});

await check("a signed-out visitor is free even with a subscription in the table", async () => {
  subscriber("max");
  session.setUser(null);
  const seen = await entitlement.getEntitlement();
  assert.equal(seen.isPro, false);
  assert.equal(seen.userId, null);
  session.setUser({ id: "user-1" });
  return "no session, no plan";
});

/* ---------------- the unlimited account ---------------- */

await check("the unlimited tier exists, is above Max, and caps nothing", async () => {
  assert.equal(TIERS.owner.dailyOperations, -1, "a daily cap on the owner");
  assert.equal(TIERS.owner.batchFiles, NO_LIMIT, "a batch cap on the owner");
  assert.equal(TIERS.owner.fileSizeMultiplier, NO_LIMIT, "a size cap on the owner");
  assert.equal(TIERS.owner.zipDownload, true);

  assert.equal(tierAtLeast("owner", "max"), true, "owner must outrank Max");
  assert.equal(tierAtLeast("max", "owner"), false, "Max must not reach owner");

  // Whatever the tool's own ceiling is, the owner is never stopped by it.
  // A 400 MB upload is well past every per-tool figure in the catalogue.
  const huge = 400 * 1024 * 1024;
  assert.ok(fileSizeLimit("owner", 25 * 1024 * 1024) > huge, "the owner hit a size ceiling");
  assert.ok(fileSizeLimit("max", 25 * 1024 * 1024) < huge, "Max was accidentally unlimited too");
  assert.ok(batchLimit("owner", true) > 10_000, "the owner hit a batch ceiling");

  // And it survives a trip through JSON, which Infinity would not: the
  // limits cross into the browser as part of the usage response, and
  // `null > size` is false — the unlimited account would have ended up with
  // the tightest limit of the four.
  const roundTripped = JSON.parse(JSON.stringify({ limit: fileSizeLimit("owner", 1024) })).limit;
  assert.equal(typeof roundTripped, "number", "the owner's limit did not survive JSON");
  assert.ok(roundTripped > huge);
  return "above Max, nothing capped, and still a number after JSON";
});

await check("unlimited cannot be bought, and no payment can reach it", async () => {
  // Not on the pricing page.
  assert.deepEqual(TIER_IDS, ["free", "pro", "max"], "owner leaked onto the pricing page");
  assert.deepEqual(ALL_TIER_IDS, ["free", "pro", "max", "owner"]);

  // Not readable out of a subscription row, however that row got there.
  assert.equal(tierOf("owner"), "free", "a subscription row saying owner granted it");
  assert.equal(tierPriceXaf(2000, "owner"), 0);

  // And a payment that names it does not produce it. This is the attack worth
  // testing: a provider webhook, or an admin typo, carrying tier: "owner".
  const client = world();
  await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "tries-to-buy-owner",
    amount: 2000,
    currency: "XAF",
    tier: "owner",
  });
  stub.setClient(client);
  session.setUser({ id: "user-1" });
  const seen = await entitlement.getEntitlement();
  assert.notEqual(seen.tier, "owner", "a payment bought the unlimited tier");
  return "absent from the pricing page, unreadable from a subscription, unbuyable";
});

await check("the owner's own account reads as unlimited, from the profile flag", async () => {
  const far = new Date(Date.now() + 20 * 86_400_000).toISOString();
  const client = createFakeClient({
    profiles: [
      { id: "user-1", email: "legendfotso@gmail.com", is_admin: true, is_unlimited: true },
    ],
    // A short Pro subscription as well, to prove the flag wins: the answer
    // must not become "Pro until the 12th" for an account that has no limits.
    subscriptions: [{ id: "sub-1", user_id: "user-1", status: "active", end_date: far, tier: "pro" }],
  });
  stub.setClient(client);
  session.setUser({ id: "user-1", email: "legendfotso@gmail.com" });

  const seen = await entitlement.getEntitlement();
  assert.equal(seen.tier, "owner", "the flag did not grant unlimited");
  assert.equal(seen.isPro, true, "unlimited must pass every paid gate");
  assert.equal(seen.proUntil, null, "unlimited must not look like it expires");
  return "the flag wins over the subscription, and never expires";
});

await check("OWNER_EMAILS sets the flag once, and only for the address named", async () => {
  const client = createFakeClient({
    profiles: [
      { id: "user-1", email: "legendfotso@gmail.com", is_admin: true, is_unlimited: false },
      { id: "user-2", email: "someone@example.com", is_admin: false, is_unlimited: false },
    ],
  });
  stub.setClient(client);

  const before = process.env.OWNER_EMAILS;
  try {
    // Written with the wrong case and a stray space on purpose: people do not
    // type their own address the same way twice.
    process.env.OWNER_EMAILS = " LegendFotso@Gmail.com ";

    session.setUser({ id: "user-1", email: "legendfotso@gmail.com" });
    assert.equal((await entitlement.getEntitlement()).tier, "owner", "the owner was not promoted");
    assert.equal(client.store.profiles[0].is_unlimited, true, "the flag was not persisted");

    session.setUser({ id: "user-2", email: "someone@example.com" });
    const other = await entitlement.getEntitlement();
    assert.equal(other.tier, "free", "somebody else was given unlimited access");
    assert.equal(client.store.profiles[1].is_unlimited, false);

    // Clearing the variable must not take the access away: the column is the
    // authority once it has been written, which is what makes the variable
    // safe to delete after the first sign-in.
    delete process.env.OWNER_EMAILS;
    session.setUser({ id: "user-1", email: "legendfotso@gmail.com" });
    assert.equal((await entitlement.getEntitlement()).tier, "owner", "clearing the env revoked it");
  } finally {
    if (before === undefined) delete process.env.OWNER_EMAILS;
    else process.env.OWNER_EMAILS = before;
    session.setUser({ id: "user-1" });
  }
  return "case-insensitive, one address only, and the column outlives the variable";
});

await check("an account with no flag column is simply not unlimited", async () => {
  // The window between pushing the code and running 0003 by hand in the
  // Supabase SQL editor. Before this was handled, every read of the column
  // failed — and a failed read must not become a granted plan, nor take away
  // a subscription somebody paid for.
  const far = new Date(Date.now() + 20 * 86_400_000).toISOString();
  const client = createFakeClient(
    {
      profiles: [{ id: "user-1", email: "client@example.com", is_admin: false }],
      subscriptions: [
        { id: "sub-1", user_id: "user-1", status: "active", end_date: far, tier: "max" },
      ],
    },
    { missingColumns: ["is_unlimited"] },
  );
  stub.setClient(client);
  session.setUser({ id: "user-1", email: "client@example.com" });

  const refused = await client.from("profiles").select("is_unlimited");
  assert.equal(refused.error?.code, "42703", "the fake did not reproduce a missing column");

  const seen = await entitlement.getEntitlement();
  assert.equal(seen.tier, "max", "a pre-migration database lost a paid plan");
  return "pre-migration: not unlimited, and Max is still Max";
});

await check("the upload box shows the ceiling this person has, not the tool's own", async () => {
  /**
   * The bug Fortune found on his own site, signed in, on 1 October 2026: the
   * upload box printed "PDF jusqu'à 50,0 Mo" — the tool's own figure — to
   * everybody. To a Max subscriber whose real ceiling is 200 MB, and to the
   * owner, who has none. Nobody tries a 120 MB file when the page has just
   * told them the limit is 50, so the thing they paid for is invisible.
   */
  const { displayedFileSizeLimit, canUpgrade } = await import(join(out, "src", "tiers.js"));
  const tool = 50 * 1024 * 1024; // compress-pdf

  assert.equal(displayedFileSizeLimit("free", tool), tool, "free should see the tool's figure");
  assert.equal(displayedFileSizeLimit("pro", tool), tool * 2, "Pro is shown the free limit");
  assert.equal(displayedFileSizeLimit("max", tool), tool * 4, "Max is shown the free limit");
  assert.equal(displayedFileSizeLimit("owner", tool), null, "the owner is shown a number at all");

  // null means "say there is no limit", not "say zero" — a 0 would render as
  // "jusqu'à 0 o", which is worse than the bug being fixed.
  assert.notEqual(displayedFileSizeLimit("owner", tool), 0);

  // And the upgrade button is for the people who can still upgrade.
  assert.equal(canUpgrade("free"), true);
  for (const tier of ["pro", "max", "owner"]) {
    assert.equal(canUpgrade(tier), false, `${tier} is still being sold an upgrade`);
  }
  return "50 / 100 / 200 MB and no limit at all; the upgrade button only for free";
});

await check("an administrator is told so, and the flag never comes from the browser", async () => {
  /**
   * /admin had existed and worked for days, and nothing on the site pointed
   * at it: the only way to reach the one screen listing every account was to
   * type the address. The same thing had already happened to /signin in
   * September — "Google sign-in does not exist" meant "nothing links to it".
   * A page nobody can navigate to does not exist, however well it works.
   *
   * So the entitlement now carries `isAdmin`, read from the SAME profile row
   * as the unlimited flag rather than a second query, and the account menu
   * uses it to draw the way in. It is a signpost and nothing more: /admin
   * still answers notFound() to anybody the server does not recognise.
   */
  const client = createFakeClient({
    profiles: [
      { id: "user-1", email: "legendfotso@gmail.com", is_admin: true, is_unlimited: true },
      { id: "user-2", email: "paying@example.com", is_admin: false, is_unlimited: false },
    ],
    subscriptions: [
      {
        id: "sub-1",
        user_id: "user-2",
        status: "active",
        end_date: new Date(Date.now() + 20 * 86_400_000).toISOString(),
        tier: "max",
      },
    ],
  });
  stub.setClient(client);

  session.setUser({ id: "user-1", email: "legendfotso@gmail.com" });
  const owner = await entitlement.getEntitlement();
  assert.equal(owner.isAdmin, true, "the owner is not told they are an administrator");
  assert.equal(owner.tier, "owner", "and the two flags must come back together");

  // A paying customer is not one — the admin flag has nothing to do with the
  // plan, and Max must not become a way in.
  session.setUser({ id: "user-2", email: "paying@example.com" });
  const paying = await entitlement.getEntitlement();
  assert.equal(paying.tier, "max");
  assert.equal(paying.isAdmin, false, "a Max subscriber was made an administrator");

  // Signed out: no.
  session.setUser(null);
  assert.equal((await entitlement.getEntitlement()).isAdmin, false);

  // And a pre-migration database loses neither flag's meaning: the admin flag
  // still reads, because the order of the code deploy and the hand-run
  // migration must not decide who can reach /admin.
  const old = createFakeClient(
    { profiles: [{ id: "user-1", email: "legendfotso@gmail.com", is_admin: true }] },
    { missingColumns: ["is_unlimited"] },
  );
  stub.setClient(old);
  session.setUser({ id: "user-1", email: "legendfotso@gmail.com" });
  const before = await entitlement.getEntitlement();
  assert.equal(before.isAdmin, true, "an administrator lost /admin while 0003 was not yet run");
  assert.equal(before.tier, "free", "and must not be unlimited before the column exists");

  session.setUser({ id: "user-1" });
  return "the owner is told, a Max subscriber is not, and a pre-migration database keeps the flag";
});

/* ---------------- the approval queue ---------------- */

/** A world with one customer, one admin, and the settings the queue prices from. */
function queueWorld() {
  const client = createFakeClient({
    profiles: [
      { id: "user-1", email: "client@example.com", is_admin: false },
      { id: "admin-1", email: "legendfotso@gmail.com", is_admin: true },
    ],
  });
  stub.setClient(client);
  settingsModule.invalidateSettingsCache();
  return client;
}

await check("a claim is priced by the server, not by what was sent", async () => {
  const client = queueWorld();

  const created = await claims.createClaim({
    userId: "user-1",
    tier: "max",
    plan: "monthly",
    transactionId: "MP260930.1432.A1",
    operator: "MTN",
    phone: "677000000",
    // Deliberately present and deliberately absurd. `createClaim` takes no
    // amount at all, so this must be ignored rather than stored.
    amount: 1,
  });

  assert.equal(created.ok, true, "a good claim was refused");
  const row = client.store.payment_claims[0];
  assert.equal(row.amount, tierPriceXaf(2000, "max"), "the browser set the price");
  assert.equal(row.amount, 5000);
  assert.equal(row.tier, "max");
  assert.equal(row.days, 30);
  assert.equal(row.status, "pending", "a claim must grant nothing on arrival");

  // Nothing has been granted yet. This is the whole promise of the row.
  assert.equal(client.store.payments.length, 0, "a claim created a payment");
  assert.equal(client.store.subscriptions.length, 0, "a claim created a subscription");
  return "5,000 FCFA from the server's own settings; no payment, no subscription";
});

await check("the same reference cannot be claimed twice", async () => {
  const client = queueWorld();
  const first = await claims.createClaim({
    userId: "user-1",
    tier: "pro",
    plan: "monthly",
    transactionId: "MP260930.1432.A1",
  });
  assert.equal(first.ok, true);

  // Decide it, so "already pending" is not what refuses the second one.
  await claims.approveClaim(client.store.payment_claims[0].id, "admin-1");

  // Same reference, different case and padding — the index is on
  // lower(btrim(...)), so this is the same payment being claimed again.
  const again = await claims.createClaim({
    userId: "user-1",
    tier: "max",
    plan: "yearly",
    transactionId: "  mp260930.1432.a1  ",
  });
  assert.equal(again.ok, false, "a reference was reused");
  assert.equal(again.reason, "duplicate_reference");
  assert.equal(client.store.payment_claims.length, 1);
  return "one row, whatever the case or the spacing";
});

await check("one open request at a time", async () => {
  const client = queueWorld();
  await claims.createClaim({ userId: "user-1", tier: "pro", plan: "monthly", transactionId: "ref-1" });
  const second = await claims.createClaim({
    userId: "user-1",
    tier: "pro",
    plan: "monthly",
    transactionId: "ref-2",
  });
  assert.equal(second.ok, false, "a second request was queued while the first was waiting");
  assert.equal(second.reason, "already_pending");
  assert.equal(client.store.payment_claims.length, 1);
  return "a waiting customer does not need two places in the queue";
});

await check("approving a claim grants the term under the customer's own reference", async () => {
  const client = queueWorld();
  await claims.createClaim({
    userId: "user-1",
    tier: "max",
    plan: "quarterly",
    transactionId: "MP-REAL-REF",
    operator: "Orange",
    phone: "699000000",
  });
  const claimId = client.store.payment_claims[0].id;

  const decided = await claims.approveClaim(claimId, "admin-1", "vu sur le relevé");
  assert.equal(decided.ok, true, "approving failed");
  assert.equal(decided.status, "approved");
  assert.equal(decided.duplicate, false);

  // The payment is recorded under the Mobile Money reference, so it can be
  // reconciled against a real statement rather than against a number we made
  // up — and so a second approval cannot grant a second term.
  assert.equal(client.store.payments.length, 1);
  assert.equal(client.store.payments[0].transaction_id, "MP-REAL-REF");
  assert.equal(client.store.payments[0].provider, "manual");
  assert.equal(client.store.payments[0].tier, "max");
  assert.equal(client.store.payments[0].amount, tierPriceXaf(2000, "max") * 2.5);

  // 3 months of Max, and the row says Max.
  assert.equal(client.store.subscriptions.length, 1);
  assert.equal(client.store.subscriptions[0].tier, "max");
  assert.equal(days(new Date(), client.store.subscriptions[0].end_date), 90);

  const row = client.store.payment_claims[0];
  assert.equal(row.status, "approved");
  assert.equal(row.reviewed_by, "admin-1", "the decision was not attributed to anybody");
  assert.ok(row.reviewed_at, "the decision has no timestamp");
  assert.equal(row.payment_id, client.store.payments[0].id, "the claim does not point at its payment");
  assert.ok(decided.receipt?.reference, "no receipt reference for an approved payment");

  session.setUser({ id: "user-1" });
  assert.equal((await entitlement.getEntitlement()).tier, "max", "the customer did not get Max");
  return "90 days of Max, recorded under MP-REAL-REF, attributed to the admin who approved it";
});

await check("approving twice grants one term, not two", async () => {
  const client = queueWorld();
  await claims.createClaim({ userId: "user-1", tier: "pro", plan: "monthly", transactionId: "ref-double" });
  const claimId = client.store.payment_claims[0].id;

  const first = await claims.approveClaim(claimId, "admin-1");
  assert.equal(first.ok, true);
  const end = client.store.subscriptions[0].end_date;

  // Two admins on the queue at once, or one double tap on a phone.
  const second = await claims.approveClaim(claimId, "admin-1");
  assert.equal(second.ok, false, "a decided claim was approved again");
  assert.equal(second.reason, "not_pending");

  assert.equal(client.store.payments.length, 1, "a second payment row was written");
  assert.equal(client.store.subscriptions[0].end_date, end, "the term was extended twice");
  return "the second press is refused and nothing moves";
});

await check("refusing a claim grants nothing and keeps the reason", async () => {
  const client = queueWorld();
  await claims.createClaim({ userId: "user-1", tier: "pro", plan: "monthly", transactionId: "ref-bad" });
  const claimId = client.store.payment_claims[0].id;

  const decided = await claims.rejectClaim(claimId, "admin-1", "référence absente du relevé");
  assert.equal(decided.ok, true);
  assert.equal(decided.status, "rejected");

  assert.equal(client.store.payments.length, 0, "a refused claim recorded a payment");
  assert.equal(client.store.subscriptions.length, 0, "a refused claim granted access");

  const row = client.store.payment_claims[0];
  assert.equal(row.status, "rejected");
  // The reason is for the customer, who otherwise cannot tell a typo from a
  // refusal and gives up on the site instead of correcting it.
  assert.equal(row.decision_note, "référence absente du relevé");

  // And it cannot then be approved after the fact.
  const late = await claims.approveClaim(claimId, "admin-1");
  assert.equal(late.ok, false);
  assert.equal(late.reason, "not_pending");
  return "nothing granted, the reason kept, and no approving it afterwards";
});

await check("the queue is oldest first, and only what is waiting", async () => {
  const client = queueWorld();
  const now = Date.now();
  client.store.payment_claims.push(
    { id: "c-new", user_id: "user-1", tier: "pro", days: 30, amount: 2000, currency: "XAF",
      transaction_id: "r-new", status: "pending", created_at: new Date(now).toISOString() },
    { id: "c-old", user_id: "user-1", tier: "pro", days: 30, amount: 2000, currency: "XAF",
      transaction_id: "r-old", status: "pending", created_at: new Date(now - 86_400_000).toISOString() },
    { id: "c-done", user_id: "user-1", tier: "pro", days: 30, amount: 2000, currency: "XAF",
      transaction_id: "r-done", status: "approved", created_at: new Date(now - 2 * 86_400_000).toISOString() },
  );

  const pending = await claims.listClaims("pending");
  assert.deepEqual(pending.map((claim) => claim.id), ["c-old", "c-new"],
    "the queue is not in the order people have been waiting in");

  const done = await claims.listClaims("approved");
  assert.deepEqual(done.map((claim) => claim.id), ["c-done"]);
  return "whoever has waited longest is at the top";
});


// ---------------------------------------------------------------------------
// Account status and granted access (0005)
// ---------------------------------------------------------------------------

/** A world with grants and a status column, as 0005 leaves it. */
function grantWorld({ status = "active", grants = [], subscription = null } = {}) {
  const tables = {
    profiles: [
      { id: "user-1", email: "client@example.com", is_admin: false, is_unlimited: false, status, deleted_at: null },
    ],
    entitlement_grants: grants.map((grant, index) => ({
      id: `grant-${index}`,
      user_id: "user-1",
      tier: grant.tier,
      kind: grant.kind ?? "admin",
      reason: grant.reason ?? null,
      starts_at: grant.startsAt ?? new Date(Date.now() - 86_400_000).toISOString(),
      expires_at: grant.expiresAt ?? null,
      granted_by: null,
      revoked_at: grant.revokedAt ?? null,
      created_at: new Date().toISOString(),
    })),
    subscriptions: subscription ? [{ user_id: "user-1", status: "active", ...subscription }] : [],
  };
  return createFakeClient(tables);
}

await check("a blocked account loses its access, whatever it paid for", async () => {
  // The case that matters: somebody with a live, valid Max subscription who
  // has been blocked. Evaluating the subscription first would answer "Max" for
  // a person who may not use the site at all — and every gate in the
  // application asks for an entitlement, so that answer would let them
  // straight back in.
  const far = new Date(Date.now() + 20 * 86_400_000).toISOString();
  for (const status of ["blocked", "suspended"]) {
    stub.setClient(grantWorld({ status, subscription: { end_date: far, tier: "max" } }));
    session.setUser({ id: "user-1", email: "client@example.com" });
    const seen = await entitlement.getEntitlement();
    assert.equal(seen.tier, "free", `a ${status} account kept its tier`);
    assert.equal(seen.isPro, false, `a ${status} account still read as paid`);
    assert.equal(seen.status, status, "the reason is not reported");
  }

  // And an active account with the same subscription is unaffected, so the
  // check above is testing the status and not something else.
  stub.setClient(grantWorld({ status: "active", subscription: { end_date: far, tier: "max" } }));
  session.setUser({ id: "user-1", email: "client@example.com" });
  assert.equal((await entitlement.getEntitlement()).tier, "max");
  return "blocked and suspended both drop to free; active is untouched";
});

await check("a granted tier counts, expires on its own, and can be revoked", async () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

  // Lifetime.
  stub.setClient(grantWorld({ grants: [{ tier: "max" }] }));
  session.setUser({ id: "user-1", email: "client@example.com" });
  let seen = await entitlement.getEntitlement();
  assert.equal(seen.tier, "max", "a live grant did not apply");
  assert.equal(seen.source, "grant", "a grant was reported as a sale");
  assert.equal(seen.proUntil, null, "a lifetime grant reported an end date");

  // Temporary, still running.
  stub.setClient(grantWorld({ grants: [{ tier: "pro", expiresAt: tomorrow }] }));
  seen = await entitlement.getEntitlement();
  assert.equal(seen.tier, "pro");
  assert.equal(seen.proUntil, tomorrow, "the expiry is not shown to the customer");

  // Expired — evaluated against the clock, not against a status column that
  // nothing on this deployment would have updated.
  stub.setClient(grantWorld({ grants: [{ tier: "max", expiresAt: yesterday }] }));
  assert.equal((await entitlement.getEntitlement()).tier, "free", "an expired grant still applied");

  // Revoked.
  stub.setClient(grantWorld({ grants: [{ tier: "max", revokedAt: yesterday }] }));
  assert.equal((await entitlement.getEntitlement()).tier, "free", "a revoked grant still applied");

  // Not yet started.
  stub.setClient(grantWorld({ grants: [{ tier: "max", startsAt: tomorrow }] }));
  assert.equal((await entitlement.getEntitlement()).tier, "free", "a future grant applied early");
  return "lifetime, temporary, expired, revoked and not-yet-started all behave";
});

await check("the stronger of a grant and a subscription wins, and says which", async () => {
  // The priority the brief sets is OWNER, UNLIMITED, MAX, PRO, FREE — and the
  // part that is easy to get wrong is that a grant must not TAKE AWAY what
  // somebody bought. A promotional Pro handed to a paying Max customer would
  // otherwise downgrade them, which is the worst possible direction for a
  // mistake: they paid, and a gift cost them something.
  const far = new Date(Date.now() + 20 * 86_400_000).toISOString();

  stub.setClient(grantWorld({
    grants: [{ tier: "pro", kind: "promotional" }],
    subscription: { end_date: far, tier: "max" },
  }));
  session.setUser({ id: "user-1", email: "client@example.com" });
  let seen = await entitlement.getEntitlement();
  assert.equal(seen.tier, "max", "a weaker grant downgraded a paying customer");
  assert.equal(seen.source, "subscription", "the paid plan was reported as a gift");
  assert.equal(seen.proUntil, far, "the paid term was replaced by the grant's");

  // And the other way: a granted Max over a bought Pro.
  stub.setClient(grantWorld({
    grants: [{ tier: "max" }],
    subscription: { end_date: far, tier: "pro" },
  }));
  seen = await entitlement.getEntitlement();
  assert.equal(seen.tier, "max", "the stronger grant did not apply");
  assert.equal(seen.source, "grant");

  // An unlimited grant reads as the uncapped tier, but it is a GRANT — not
  // ownership of the platform, which comes from the environment alone.
  stub.setClient(grantWorld({ grants: [{ tier: "unlimited" }] }));
  seen = await entitlement.getEntitlement();
  assert.equal(seen.tier, "owner", "an unlimited grant did not lift the caps");
  assert.equal(seen.source, "grant", "a grant was reported as platform ownership");
  return "stronger wins either way, and the source names which";
});

await check("missing 0005 tables leave everyone exactly as they were", async () => {
  // The code deploy and the hand-run SQL land at different moments, in either
  // order. A missing table has to mean "nobody has been granted anything yet"
  // — never "every paying customer is now free", and never "every account is
  // blocked", which is the direction a careless default would take it.
  const far = new Date(Date.now() + 20 * 86_400_000).toISOString();
  const client = createFakeClient({
    profiles: [{ id: "user-1", email: "client@example.com", is_admin: false, is_unlimited: false }],
    subscriptions: [{ user_id: "user-1", status: "active", end_date: far, tier: "max" }],
  });
  // No entitlement_grants table at all, and no status column on profiles.
  stub.setClient(client);
  session.setUser({ id: "user-1", email: "client@example.com" });
  const seen = await entitlement.getEntitlement();
  assert.equal(seen.tier, "max", "a customer lost their plan to a missing table");
  assert.equal(seen.status, "active", "a missing status column locked an account out");
  return "a pre-migration database keeps every customer on the plan they bought";
});


// ---------------------------------------------------------------------------
// Payments that did not succeed (phase 5)
// ---------------------------------------------------------------------------

await check("a refused payment is written off, and a settled one never is", async () => {
  // `failed` existed in the enum from the first migration and nothing ever
  // wrote it. A customer who opened a checkout page and closed it left a row
  // that stayed `pending` for ever — so "what is pending right now", the one
  // reading that tells you a provider has gone quiet, stopped being answerable
  // after a few hundred visitors.
  const client = world();

  await core.createPendingPayment({
    userId: "user-1",
    provider: "campay",
    reference: "REF-REFUSED",
    amount: 2000,
    currency: "XAF",
    days: 30,
    tier: "pro",
  });

  assert.equal(
    await core.markPaymentFailed({ provider: "campay", reference: "REF-REFUSED", reason: "FAILED" }),
    "marked",
  );
  const refused = client.store.payments.find((row) => row.transaction_id === "REF-REFUSED");
  assert.equal(refused.status, "failed", "a refused payment is still pending");

  // And a payment that already succeeded must never be walked back by a late
  // failure notification — which is exactly the shape of a provider retrying
  // an old event.
  await core.grantPro({
    userId: "user-1",
    provider: "manual",
    transactionId: "REF-PAID",
    amount: 2000,
    currency: "XAF",
    days: 30,
    tier: "pro",
  });
  assert.equal(
    await core.markPaymentFailed({ provider: "manual", reference: "REF-PAID", reason: "late" }),
    "already_settled",
    "a settled payment was walked back",
  );
  const paid = client.store.payments.find((row) => row.transaction_id === "REF-PAID");
  assert.equal(paid.status, "succeeded", "a succeeded payment was marked failed");

  // An unknown reference is told apart from a settled one: one is a mistake,
  // the other is a race that already resolved the right way.
  assert.equal(
    await core.markPaymentFailed({ provider: "campay", reference: "NEVER-EXISTED" }),
    "unknown_reference",
  );
  return "pending becomes failed; succeeded stays succeeded; unknown says so";
});

await check("abandoned checkouts stop claiming to be undecided", async () => {
  const client = world();

  await core.createPendingPayment({
    userId: "user-1",
    provider: "stripe",
    reference: "REF-OLD",
    amount: 500,
    currency: "USD",
    days: 30,
    tier: "pro",
  });
  await core.createPendingPayment({
    userId: "user-1",
    provider: "stripe",
    reference: "REF-FRESH",
    amount: 500,
    currency: "USD",
    days: 30,
    tier: "pro",
  });

  // Age the first one by a day.
  const old = client.store.payments.find((row) => row.transaction_id === "REF-OLD");
  old.created_at = new Date(Date.now() - 24 * 3_600_000).toISOString();

  const closed = await core.expireStalePayments(12);
  assert.equal(closed, 1, "the wrong number of payments were written off");
  assert.equal(old.status, "failed", "the abandoned payment is still pending");

  const fresh = client.store.payments.find((row) => row.transaction_id === "REF-FRESH");
  assert.equal(
    fresh.status,
    "pending",
    "a payment still in flight was written off — a Mobile Money confirmation " +
      "held up overnight must not be lost",
  );
  return "a day-old checkout is closed, a minute-old one is left alone";
});

console.log("");
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
