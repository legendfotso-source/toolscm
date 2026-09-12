/**
 * Proves the business layer actually enforces what it claims.
 *
 * Runs against a live Supabase project. Reads NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY from .env.local,
 * and skips cleanly (exit 0) when they are absent, so it is safe in CI.
 *
 *   node tests/verify-supabase.mjs
 *
 * It leaves the database exactly as it found it: the limit switch is restored
 * and every row it wrote is deleted, whether the checks pass or fail.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));

const results = [];
let failures = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "[32mPASS[0m" : "[31mFAIL[0m"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function check(name, fn) {
  try {
    record(name, true, await fn());
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

let skipped = 0;

/** A check that needs the secret key. Skipped, loudly, when it is absent. */
async function checkPrivileged(enabled, name, fn) {
  if (!enabled) {
    skipped += 1;
    console.log(`[33mSKIP[0m  ${name} — needs SUPABASE_SERVICE_ROLE_KEY`);
    return;
  }
  await check(name, fn);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * A "blocked" result only counts if the DATABASE did the blocking.
 *
 * This matters more than it looks. `assert(error, ...)` would happily pass on a
 * DNS failure, an offline laptop or a proxy that never let the request out —
 * turning "we could not reach Supabase" into "Supabase refused us", which is
 * the exact opposite conclusion. A genuine refusal always carries a
 * Postgres/PostgREST code; a transport failure never does.
 */
function assertDatabaseRefused(error, message) {
  assert(error, message);

  const code = error.code ?? "";
  const transport =
    !code ||
    /fetch failed|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|allowlist|proxy/i.test(
      error.message ?? "",
    );

  if (transport) {
    throw new Error(
      `the request never reached the database, so this proves nothing: ${error.message}`,
    );
  }

  // 42501 = insufficient privilege; PGRST1xx/2xx = not exposed / no policy.
  assert(
    code === "42501" || code.startsWith("PGRST"),
    `expected a permission error, got ${code}: ${error.message}`,
  );
  return `refused by the database (${code})`;
}

/** Minimal .env.local reader — no dependency, no shell. */
async function loadEnv() {
  try {
    const text = await readFile(join(here, "..", ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const value = match[2].replace(/^["']|["']$/g, "");
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  } catch {
    /* no .env.local — environment variables may still be set */
  }
}

async function main() {
  await loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    console.log(
      "Supabase is not configured — skipping. Set NEXT_PUBLIC_SUPABASE_URL and\n" +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local to run these.",
    );
    process.exit(0);
  }

  // The lockdown checks — the ones that prove a visitor's browser cannot cheat —
  // need nothing but the publishable key, which is public by design. They are the
  // half of this suite that matters most, so they run on their own. The
  // privileged checks below need the secret key and are skipped without it, which
  // means this suite can be run without ever handling that key.
  const privileged = Boolean(serviceKey);
  const admin = privileged
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : null;
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  const device = `test-${crypto.randomUUID()}`;
  let limitsWereEnabled = null;

  try {
    /* ---------------- schema ---------------- */

    await checkPrivileged(privileged, "the six tables exist", async () => {
      const names = ["profiles", "subscriptions", "payments", "usage_logs", "tool_events", "admin_settings"];
      for (const name of names) {
        const { error } = await admin.from(name).select("*", { head: true, count: "exact" });
        assert(!error, `${name}: ${error?.message}`);
      }
      return names.length + " tables reachable with the service role";
    });

    await checkPrivileged(privileged, "settings are seeded with limits OFF", async () => {
      const { data, error } = await admin.from("admin_settings").select("key, value");
      assert(!error, error?.message);
      const map = Object.fromEntries(data.map((row) => [row.key, row.value]));
      limitsWereEnabled = map.limits_enabled;
      assert(map.free_daily_limit === 3, `free_daily_limit is ${map.free_daily_limit}`);
      assert(map.limits_enabled === false, "limits_enabled should ship as false");
      assert(map.payments_enabled === false, "payments_enabled should ship as false");
      return "free_daily_limit=3, limits and payments both off";
    });

    /* ---------------- the limit actually limits ---------------- */

    await checkPrivileged(privileged, "the fourth operation of the day is refused", async () => {
      const verdicts = [];
      for (let i = 0; i < 4; i += 1) {
        const { data, error } = await admin.rpc("consume_operation", {
          p_subject_type: "device",
          p_subject: device,
          p_tool: "compress-pdf",
          p_limit: 3,
        });
        assert(!error, error?.message);
        verdicts.push(Array.isArray(data) ? data[0] : data);
      }

      assert(verdicts[0].allowed === true, "the first operation was refused");
      assert(verdicts[2].allowed === true, "the third operation was refused");
      assert(verdicts[3].allowed === false, "the fourth operation was allowed");
      assert(verdicts[2].remaining === 0, `remaining after three should be 0, got ${verdicts[2].remaining}`);
      return "allowed, allowed, allowed, refused";
    });

    await checkPrivileged(privileged, "a Pro user is never counted against the limit", async () => {
      // -1 is how the server expresses "no limit applies".
      const { data, error } = await admin.rpc("consume_operation", {
        p_subject_type: "device",
        p_subject: device,
        p_tool: "compress-pdf",
        p_limit: -1,
      });
      assert(!error, error?.message);
      const row = Array.isArray(data) ? data[0] : data;
      assert(row.allowed === true, "an unlimited caller was refused");

      const { data: used } = await admin.rpc("peek_usage", {
        p_subject_type: "device",
        p_subject: device,
      });
      assert(used === 4, `unlimited calls must not increment the counter (it is ${used})`);
      return "no counter movement for an unlimited caller";
    });

    /* ---------------- the browser cannot cheat ---------------- */

    await check("the browser cannot read the usage table", async () => {
      const { error } = await anon.from("usage_logs").select("*").limit(1);
      return assertDatabaseRefused(error, "usage_logs was readable with the anon key");
    });

    await check("the browser cannot write the usage table", async () => {
      const { error } = await anon
        .from("usage_logs")
        .insert({ subject_type: "device", subject: device, tool: "x", count: 0 });
      return assertDatabaseRefused(
        error,
        "usage_logs was writable with the anon key — the limit would be decorative",
      );
    });

    await check("the browser cannot read the settings table", async () => {
      const { error } = await anon.from("admin_settings").select("*").limit(1);
      return assertDatabaseRefused(error, "admin_settings was readable with the anon key");
    });

    await check("the browser cannot grant itself Pro", async () => {
      const { error } = await anon
        .from("subscriptions")
        .insert({ user_id: crypto.randomUUID(), provider: "manual", status: "active" });
      return assertDatabaseRefused(error, "a subscription was insertable with the anon key");
    });

    await check("the browser cannot read other people's profiles", async () => {
      const { data, error } = await anon.from("profiles").select("*").limit(1);
      // Either a privilege error or an empty result is acceptable — what must
      // never happen is rows coming back. A transport failure is neither.
      if (error) return assertDatabaseRefused(error, "unreachable");
      assert((data ?? []).length === 0, "profile rows were returned to an anonymous caller");
      return "reached the database, no rows returned";
    });

    /* ---------------- the security definer bypass ---------------- */

    // These exist because locking the tables was not enough. The functions are
    // `security definer`, so they ignore table grants and row level security
    // entirely — and PostgreSQL had granted EXECUTE on them to PUBLIC by
    // default. A visitor could write usage_logs through consume_operation even
    // though usage_logs itself was unreachable. Never assume a revoke worked;
    // ask the database.
    await check("the browser cannot call consume_operation", async () => {
      const { error } = await anon.rpc("consume_operation", {
        p_subject_type: "device",
        p_subject: `probe-${crypto.randomUUID()}`,
        p_tool: "compress-pdf",
        p_limit: -1,
      });
      return assertDatabaseRefused(
        error,
        "consume_operation was callable anonymously — the daily limit could be bypassed entirely",
      );
    });

    await check("the browser cannot call peek_usage", async () => {
      const { error } = await anon.rpc("peek_usage", {
        p_subject_type: "device",
        p_subject: "probe",
      });
      return assertDatabaseRefused(error, "peek_usage was callable anonymously");
    });

    await check("the browser cannot call expire_subscriptions", async () => {
      const { error } = await anon.rpc("expire_subscriptions");
      return assertDatabaseRefused(error, "expire_subscriptions was callable anonymously");
    });

    await check("the browser cannot call has_active_subscription", async () => {
      const { error } = await anon.rpc("has_active_subscription", {
        p_user_id: crypto.randomUUID(),
      });
      return assertDatabaseRefused(error, "has_active_subscription was callable anonymously");
    });

    /* ---------------- webhook idempotency ---------------- */

    await checkPrivileged(privileged, "the same payment cannot be recorded twice", async () => {
      const transaction = `verify-${crypto.randomUUID()}`;
      const row = {
        provider: "manual",
        amount: 2000,
        currency: "XAF",
        transaction_id: transaction,
        status: "succeeded",
      };

      const first = await admin.from("payments").insert(row);
      assert(!first.error, `the first insert failed: ${first.error?.message}`);

      // Exactly what a provider re-delivering a webhook would cause.
      const second = await admin.from("payments").insert(row);
      assert(second.error, "a duplicate payment was accepted — Pro could be granted twice");

      await admin.from("payments").delete().eq("transaction_id", transaction);
      return `duplicate rejected: ${second.error.message.slice(0, 50)}`;
    });

    /* ---------------- subscription expiry ---------------- */

    await checkPrivileged(privileged, "expire_subscriptions is callable and returns a count", async () => {
      const { data, error } = await admin.rpc("expire_subscriptions");
      assert(!error, error?.message);
      assert(typeof data === "number", `expected a number, got ${typeof data}`);
      return `${data} subscription(s) expired`;
    });
  } finally {
    // Always clean up, pass or fail.
    if (admin) await admin.from("usage_logs").delete().eq("subject", device);
    if (admin && limitsWereEnabled !== null) {
      await admin
        .from("admin_settings")
        .update({ value: limitsWereEnabled })
        .eq("key", "limits_enabled");
    }
  }

  console.log("");
  console.log(
    `${results.filter((r) => r.ok).length}/${results.length} checks passed` +
      (skipped ? `, ${skipped} skipped (no secret key present)` : ""),
  );
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
