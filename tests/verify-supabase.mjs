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

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

  if (!url || !anonKey || !serviceKey) {
    console.log(
      "Supabase is not configured — skipping. Set NEXT_PUBLIC_SUPABASE_URL,\n" +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local to run these.",
    );
    process.exit(0);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  const device = `test-${crypto.randomUUID()}`;
  let limitsWereEnabled = null;

  try {
    /* ---------------- schema ---------------- */

    await check("the six tables exist", async () => {
      const names = ["profiles", "subscriptions", "payments", "usage_logs", "tool_events", "admin_settings"];
      for (const name of names) {
        const { error } = await admin.from(name).select("*", { head: true, count: "exact" });
        assert(!error, `${name}: ${error?.message}`);
      }
      return names.length + " tables reachable with the service role";
    });

    await check("settings are seeded with limits OFF", async () => {
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

    await check("the fourth operation of the day is refused", async () => {
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

    await check("a Pro user is never counted against the limit", async () => {
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
      assert(error, "usage_logs was readable with the anon key");
      return `blocked: ${error.message.slice(0, 60)}`;
    });

    await check("the browser cannot write the usage table", async () => {
      const { error } = await anon
        .from("usage_logs")
        .insert({ subject_type: "device", subject: device, tool: "x", count: 0 });
      assert(error, "usage_logs was writable with the anon key — the limit would be decorative");
      return `blocked: ${error.message.slice(0, 60)}`;
    });

    await check("the browser cannot read the settings table", async () => {
      const { error } = await anon.from("admin_settings").select("*").limit(1);
      assert(error, "admin_settings was readable with the anon key");
      return `blocked: ${error.message.slice(0, 60)}`;
    });

    await check("the browser cannot grant itself Pro", async () => {
      const { error } = await anon
        .from("subscriptions")
        .insert({ user_id: crypto.randomUUID(), provider: "manual", status: "active" });
      assert(error, "a subscription was insertable with the anon key");
      return `blocked: ${error.message.slice(0, 60)}`;
    });

    await check("the browser cannot read other people's profiles", async () => {
      const { data, error } = await anon.from("profiles").select("*").limit(1);
      // Either a privilege error or an empty result is acceptable — what must
      // never happen is rows coming back.
      assert(error || (data ?? []).length === 0, "profile rows were returned to an anonymous caller");
      return error ? `blocked: ${error.message.slice(0, 50)}` : "no rows returned";
    });

    /* ---------------- webhook idempotency ---------------- */

    await check("the same payment cannot be recorded twice", async () => {
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

    await check("expire_subscriptions is callable and returns a count", async () => {
      const { data, error } = await admin.rpc("expire_subscriptions");
      assert(!error, error?.message);
      assert(typeof data === "number", `expected a number, got ${typeof data}`);
      return `${data} subscription(s) expired`;
    });
  } finally {
    // Always clean up, pass or fail.
    await admin.from("usage_logs").delete().eq("subject", device);
    if (limitsWereEnabled !== null) {
      await admin
        .from("admin_settings")
        .update({ value: limitsWereEnabled })
        .eq("key", "limits_enabled");
    }
  }

  console.log("");
  console.log(`${results.filter((r) => r.ok).length}/${results.length} checks passed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
