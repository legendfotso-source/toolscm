import "server-only";

import { adminClient } from "./supabase/admin";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase/config";
import { ownerEmails } from "./auth/owner";
import { contactRecipient } from "./email/mailer";

/**
 * What is actually working, named plainly.
 *
 * This exists because of a specific afternoon. The service-role key stopped
 * being accepted, and the site's answer to that was: /admin returns 404, the
 * usage endpoint reports `reason: "disabled"`, limits silently stop applying,
 * and every signed-in account reads as free. Four symptoms, none of which says
 * "the server cannot reach the database", and all of which look like bugs in
 * four different features. The fault was found by reading source code, which
 * is not a diagnostic procedure.
 *
 * Every check here answers one question with one of three words, and the
 * failure text is the provider's own message rather than a rephrasing of it:
 * "Invalid API key" is the sentence that solves this in a minute, and any
 * paraphrase of it costs the minute back.
 *
 * Nothing here returns a secret. Keys are reported by LENGTH and prefix only —
 * enough to tell "unset" from "set but wrong" and to spot a key pasted with a
 * quote around it, which is the commonest way a value is both present and
 * useless. The page that renders this is owner-only, but a check that only
 * behaves when nobody is looking is a check nobody should trust, so the rule
 * holds here rather than at the page.
 */

export type Health = "ok" | "warn" | "fail";

export type Check = {
  name: string;
  state: Health;
  /** One line a person can act on. Never a stack trace. */
  detail: string;
  /** What to do about it, when there is something to do. */
  fix?: string;
};

/** A key's shape, with nothing of the key in it. */
function shapeOf(value: string | undefined): string {
  const raw = value ?? "";
  if (!raw) return "unset";
  const trimmed = raw.trim();
  const notes: string[] = [`${trimmed.length} characters`];
  // The two ways a value is present and wrong, both invisible in a dashboard.
  if (trimmed.length !== raw.length) notes.push("has surrounding whitespace");
  if (/^["']|["']$/.test(trimmed)) notes.push("wrapped in quotes");
  const prefix = trimmed.split("_").slice(0, 2).join("_");
  if (prefix && prefix.length < trimmed.length) notes.push(`starts ${prefix}_…`);
  return notes.join(", ");
}

export async function runHealthChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  checks.push({
    name: "Supabase URL",
    state: SUPABASE_URL ? "ok" : "fail",
    detail: SUPABASE_URL || "NEXT_PUBLIC_SUPABASE_URL is not set",
    fix: SUPABASE_URL ? undefined : "Set NEXT_PUBLIC_SUPABASE_URL in Vercel, then redeploy.",
  });

  checks.push({
    name: "Supabase anon key",
    state: SUPABASE_ANON_KEY ? "ok" : "fail",
    detail: shapeOf(SUPABASE_ANON_KEY),
    fix: SUPABASE_ANON_KEY ? undefined : "Set NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel, then redeploy.",
  });

  // The one that matters. A key can be present and still rejected — rotated,
  // copied from another project, or saved as a Vercel Secret that was created
  // empty. So this does not check that the variable exists; it asks the
  // database a question and reports the answer.
  const serviceShape = shapeOf(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const client = adminClient();
  if (!client) {
    checks.push({
      name: "Database (service role)",
      state: "fail",
      detail: `SUPABASE_SERVICE_ROLE_KEY: ${serviceShape}`,
      fix:
        "Supabase → Settings → API Keys → Secret keys → copy the 'default' key. " +
        "In Vercel, clear the field completely before pasting, save as a plain " +
        "Environment Variable (not a Secret), then redeploy.",
    });
  } else {
    const { error } = await client.from("profiles").select("id").limit(1);

    // Which role did this key actually arrive as?
    //
    // The question that ended a week of looking in the wrong place. The error
    // above said "permission denied for table profiles", not "Invalid API
    // key" — and those are two completely different faults whose fixes have
    // nothing in common. Permission denied means the key WORKED: it was
    // accepted, the project is right, the network is fine. What is wrong is
    // the role it maps to, and no amount of re-copying the key changes a
    // role. So the database is asked outright.
    let role = "";
    try {
      const { data } = await client.rpc("whoami");
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.role_name) {
        role = row.bypasses_rls
          ? `connected as ${row.role_name} (bypasses RLS)`
          : `connected as ${row.role_name} — this role does NOT bypass row level security`;
      }
    } catch {
      /* 0006 not applied yet; the error message below still stands alone. */
    }

    const denied = (error?.message ?? "").toLowerCase().includes("permission denied");
    checks.push({
      name: "Database (service role)",
      state: error ? "fail" : "ok",
      detail: [
        error ? error.message : "reachable",
        `key is ${serviceShape}`,
        role,
      ]
        .filter(Boolean)
        .join(" — "),
      fix: !error
        ? undefined
        : denied
          ? "The key is VALID — it was accepted and the connection worked. What it " +
            "lacks is privileges, which means it is not the service-role key. " +
            "Re-copying it will not help. In Supabase → Settings → API Keys, use the " +
            "key whose role is service_role (the legacy 'service_role' JWT under " +
            "Project API keys is always one), and paste THAT into Vercel."
          : "If this says 'Invalid API key', the value is wrong rather than missing: " +
            "re-copy it from Supabase → Settings → API Keys and paste it into Vercel " +
            "with the field cleared first.",
    });
  }

  // Migration state, asked rather than assumed. The 1 October failure was a
  // code deploy that ran ahead of a hand-run migration, and the symptom was a
  // type error from Postgres in a log nobody was reading.
  if (client) {
    for (const [column, since] of [
      ["is_admin", "0001"],
      ["is_unlimited", "0003"],
    ] as const) {
      const { error } = await client.from("profiles").select(column).limit(1);
      checks.push({
        name: `profiles.${column}`,
        state: error ? "fail" : "ok",
        detail: error ? error.message : "present",
        fix: error
          ? `Run supabase/PASTE-INTO-SUPABASE.sql — migration ${since} has not been applied.`
          : undefined,
      });
    }
    const claims = await client.from("payment_claims").select("id").limit(1);
    checks.push({
      name: "payment_claims",
      state: claims.error ? "fail" : "ok",
      detail: claims.error ? claims.error.message : "present",
      fix: claims.error ? "Run supabase/PASTE-INTO-SUPABASE.sql." : undefined,
    });
  }

  // Email. Added the day the contact form stopped being a mailto: link —
  // without a check here, "nobody is writing in" and "every message silently
  // failed to send" look identical from the outside, which is exactly the
  // class of silent fault this panel exists to end.
  const mailKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.EMAIL_FROM ?? "").trim();
  checks.push({
    name: "Email (contact form)",
    state: mailKey ? "ok" : "warn",
    detail: mailKey
      ? `${shapeOf(mailKey)} → ${contactRecipient()}` +
        (from ? `, from ${from}` : ", from onboarding@resend.dev (Resend's own sender)")
      : "RESEND_API_KEY is not set — messages are saved but nothing is emailed",
    fix: mailKey
      ? from
        ? undefined
        : "Without EMAIL_FROM, Resend's shared sender is used, which only delivers to " +
          "the address that owns the Resend account. That is fine for the contact " +
          "form. To email customers, verify a domain in Resend and set EMAIL_FROM."
      : "Create a key at resend.com → API Keys and set RESEND_API_KEY in Vercel. " +
        "Until then the contact form still works — messages land in /admin — but " +
        "you will only see them by looking.",
  });

  const owners = ownerEmails();
  checks.push({
    name: "Owner account",
    state: owners.length ? "ok" : "fail",
    detail: owners.length
      ? `${owners.length} configured: ${owners.join(", ")}`
      : "OWNER_EMAILS is not set — nobody can reach /admin if the database is unreachable",
    fix: owners.length ? undefined : "Set OWNER_EMAILS in Vercel, then redeploy.",
  });

  // A salt that silently falls back to a published constant is a salt that
  // does nothing: anybody can recompute the hashes it protects.
  const salt = (process.env.USAGE_HASH_SALT ?? "").trim();
  checks.push({
    name: "Usage hash salt",
    state: salt ? "ok" : "warn",
    detail: salt ? shapeOf(salt) : "unset — falling back to the public default",
    fix: salt
      ? undefined
      : "Set USAGE_HASH_SALT to any long random string. Until then the per-device " +
        "hashes are computed with a value that is in the source code.",
  });

  return checks;
}

/** The worst state among the checks — what the badge at the top says. */
export function overall(checks: Check[]): Health {
  if (checks.some((check) => check.state === "fail")) return "fail";
  if (checks.some((check) => check.state === "warn")) return "warn";
  return "ok";
}
