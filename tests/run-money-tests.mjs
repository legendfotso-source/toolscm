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

  for (const name of ["core.ts", "term.ts"]) {
    copyFileSync(join(root, "src", "lib", "payments", name), join(src, name));
  }

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
        baseUrl: out,
        paths: {
          "server-only": ["shim/server-only.ts"],
          "@/lib/supabase/admin": ["shim/admin.ts"],
          "@supabase/supabase-js": ["shim/supabase.ts"],
        },
      },
      files: ["src/core.ts", "src/term.ts"],
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
    "shim/admin.js",
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
const stub = await import(join(out, "shim", "admin.js"));

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

console.log("");
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(failures > 0 ? 1 : 0);
