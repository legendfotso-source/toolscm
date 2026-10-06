/**
 * Run the real migration against a real PostgreSQL server, then check what it
 * actually guarantees.
 *
 *   npm run test:db
 *
 * Why this exists. Everything that decides who has paid and who has used their
 * allowance lives in SQL — the daily limit, the idempotency index, the row
 * level security policies, the grants. Until now none of it had ever been
 * executed anywhere except the production project, and "it ran once in the
 * dashboard" is not a test you can repeat before a deploy.
 *
 * A throwaway cluster is created, the untouched `0001_init.sql` is applied on
 * top of a small stand-in for the Supabase-specific pieces (the four roles,
 * `auth.users`, `auth.uid()`), and `db-checks.sql` asserts the guarantees. The
 * cluster is destroyed afterwards, pass or fail.
 *
 * Skips cleanly with exit 0 when no PostgreSQL server binaries are installed,
 * so it never blocks anyone who just wants to work on the tools.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { PASTE_FILE, buildPasteFile } from "../scripts/build-paste-file.mjs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/** Find the server binaries. `psql` alone is not enough — that is just a client. */
function findBinDir() {
  const candidates = [
    process.env.PG_BIN_DIR,
    "/usr/lib/postgresql/17/bin",
    "/usr/lib/postgresql/16/bin",
    "/usr/lib/postgresql/15/bin",
    "/usr/local/opt/postgresql@16/bin",
    "/opt/homebrew/opt/postgresql@16/bin",
    "/usr/bin",
  ].filter(Boolean);

  for (const dir of candidates) {
    if (existsSync(join(dir, "initdb")) && existsSync(join(dir, "pg_ctl"))) return dir;
  }
  return null;
}

const bin = findBinDir();
if (!bin) {
  console.log(
    "PostgreSQL server binaries not found — skipping the database checks.\n" +
      "Install postgresql (or set PG_BIN_DIR) to run them.",
  );
  process.exit(0);
}

/**
 * PostgreSQL refuses to run as root, and CI containers often are root. When
 * that happens, drop to an unprivileged account rather than failing — but only
 * to one that already exists, and never by creating one.
 */
const asRoot = typeof process.getuid === "function" && process.getuid() === 0;
const dropTo = asRoot
  ? ["claude", "postgres", "nobody"].find(
      (name) => spawnSync("id", ["-u", name], { stdio: "ignore" }).status === 0,
    )
  : null;

if (asRoot && !dropTo) {
  console.log(
    "Running as root and no unprivileged account to drop to — skipping the database checks.\n" +
      "PostgreSQL will not start as root. Run this as a normal user.",
  );
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "toolscm-db-"));
const data = join(dir, "data");
const PORT = process.env.PG_TEST_PORT ?? "55433";

/** Run a command, as the unprivileged user when we had to drop privileges. */
function run(command, { quiet = false } = {}) {
  const full = `export PATH="${bin}:$PATH"; ${command}`;
  const args = dropTo ? ["-s", "/bin/sh", dropTo, "-c", full] : ["-c", full];
  const file = dropTo ? "su" : "/bin/sh";

  return execFileSync(file, args, {
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"],
  });
}

const BOOTSTRAP = `
-- Stand-ins for the Supabase-specific pieces the migration depends on. These
-- all exist in a real project; recreating them here is what lets the REAL
-- migration run untouched against a plain PostgreSQL server.
-- Roles are cluster-wide, not per-database, so this file has to be safe to
-- run a second time against a second database on the same server.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin;
  end if;
end $$;

create schema if not exists auth;
-- created_at is here because the real auth.users has it, and a stand-in
-- that is missing a column passes queries the real database rejects. A file
-- selecting it compiled fine here and died in the Supabase SQL editor.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

-- Supabase's auth.uid() reads a JWT claim. A settable parameter stands in for
-- it, so the policies can be exercised as different signed-in users.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.user_id', true), '')::uuid;
$$;
`;

let failed = false;
let standalone = 0;

try {
  if (dropTo) {
    // Done as root, before dropping: the unprivileged user cannot chown a
    // directory it does not yet own, and mkdtemp creates it 0700.
    execFileSync("chown", ["-R", dropTo, dir]);
    execFileSync("chmod", ["755", dir]);
  }

  run(`initdb -D ${data} -U postgres --auth=trust`, { quiet: true });
  run(`pg_ctl -D ${data} -o "-p ${PORT} -k ${dir}" -l ${dir}/log start`, { quiet: true });

  // Give the postmaster a moment to accept connections.
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      run(`psql -h ${dir} -p ${PORT} -U postgres -tAc "select 1"`, { quiet: true });
      break;
    } catch {
      execFileSync("sleep", ["0.4"]);
    }
  }

  writeFileSync(join(dir, "bootstrap.sql"), BOOTSTRAP);

  const psql = `psql -h ${dir} -p ${PORT} -U postgres -v ON_ERROR_STOP=1 -q`;
  run(`${psql} -f ${dir}/bootstrap.sql`, { quiet: true });

  // EVERY migration, in order, read off the directory rather than listed here
  // — a list written by hand is correct until somebody adds a migration and
  // forgets to add it, which is how 0002 and 0003 went untested for a while
  // and how `plan_tier` ended up being a type this suite had never seen.
  const migrations = readdirSync(join(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of migrations) {
    console.log(`Applying supabase/migrations/${name} to a fresh database...`);
    run(`${psql} -f ${join(root, "supabase/migrations", name)}`, { quiet: true });
  }

  // Applied twice, start to finish. Every one of these files claims to be
  // safe to re-run, and that claim is the whole reason it is safe to paste one
  // into the Supabase SQL editor when you are not sure whether you already
  // did. Asserting it costs one more pass.
  for (const name of migrations) {
    run(`${psql} -f ${join(root, "supabase/migrations", name)}`, { quiet: true });
  }
  console.log(`Applied cleanly, twice — ${migrations.length} migrations.\n`);

  // And each one applied ALONE, onto nothing but 0001.
  //
  // Because that is what actually happens. On 1 October 2026 the live project
  // had 0001 and nothing else: 0002 was written, tested, committed — and never
  // run. Pasting 0003 into the SQL editor died halfway through with
  // `type "public.plan_tier" does not exist`, in a database that by then had
  // already been half-changed by the statements above the failure.
  //
  // A migration that only works when every earlier one was remembered is a
  // migration that will one day be run without them. So each is applied to its
  // own fresh database holding only 0001, and has to succeed there.
  console.log("Applying each migration alone, onto a database with only 0001...");
  for (const name of migrations.filter((file) => !file.startsWith("0001"))) {
    const alone = `alone_${name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}`;
    run(`${psql} -c "create database ${alone}"`, { quiet: true });
    const into = `psql -h ${dir} -p ${PORT} -U postgres -v ON_ERROR_STOP=1 -q -d ${alone}`;
    run(`${into} -f ${dir}/bootstrap.sql`, { quiet: true });
    run(`${into} -f ${join(root, "supabase/migrations/0001_init.sql")}`, { quiet: true });
    try {
      run(`${into} -f ${join(root, "supabase/migrations", name)}`, { quiet: true });
      console.log(`\u001b[32mPASS  ${name} applies on its own\u001b[0m`);
      standalone += 1;
    } catch (error) {
      console.log(`\u001b[31mFAILED: ${name} needs an earlier migration that was not run\u001b[0m`);
      console.log(String(error.stdout ?? error.message).split("\n").slice(-6).join("\n"));
      failed = true;
    }
  }

  // The single file handed to Fortune to paste into the Supabase SQL editor,
  // run against a database in the exact state his live project is in: 0001
  // and nothing else. Checking the pieces and not the thing he actually
  // pastes is how the type error reached him in the first place.
  const combined = PASTE_FILE;
  if (readFileSync(combined, "utf8") !== buildPasteFile()) {
    console.log(
      "\u001b[31mFAILED: supabase/PASTE-INTO-SUPABASE.sql no longer matches the " +
        "migrations it was built from. Run `npm run paste-file`.\u001b[0m",
    );
    failed = true;
  } else {
    console.log("\u001b[32mPASS  the pasted file is exactly the migrations, in order\u001b[0m");
    standalone += 1;
  }
  {
    run(`${psql} -c "create database combined_paste"`, { quiet: true });
    const into = `psql -h ${dir} -p ${PORT} -U postgres -v ON_ERROR_STOP=1 -q -d combined_paste`;
    run(`${into} -f ${dir}/bootstrap.sql`, { quiet: true });
    run(`${into} -f ${join(root, "supabase/migrations/0001_init.sql")}`, { quiet: true });
    try {
      run(`${into} -f ${combined}`, { quiet: true });
      run(`${into} -f ${combined}`, { quiet: true });   // and again, as promised
      console.log("\u001b[32mPASS  the combined paste applies on a database with only 0001, twice\u001b[0m");
      standalone += 1;
    } catch (error) {
      console.log("\u001b[31mFAILED: the file handed to Fortune does not apply\u001b[0m");
      console.log(String(error.stdout ?? error.message).split("\n").slice(-6).join("\n"));
      failed = true;
    }
  }
  // No psql meta-commands in anything a human pastes into the Supabase SQL
  // editor.
  //
  // `\set ON_ERROR_STOP on` is a psql instruction, not SQL. psql here eats it
  // happily, so every check in this suite passed while the file Fortune was
  // told to paste died on its first line with
  // `syntax error at or near "\"`. The suite has to refuse what the editor
  // refuses, not what psql tolerates.
  {
    const pasted = [PASTE_FILE, join(root, "supabase/MAKE-ME-SUPERADMIN.sql")];
    const offenders = pasted.filter((file) =>
      readFileSync(file, "utf8").split("\n").some((line) => line.trimStart().startsWith("\\")),
    );
    if (offenders.length === 0) {
      console.log("\u001b[32mPASS  no psql-only command in anything meant to be pasted\u001b[0m");
      standalone += 1;
    } else {
      console.log(
        `\u001b[31mFAILED: ${offenders.join(", ")} contains a backslash command the ` +
          "Supabase SQL editor cannot read\u001b[0m",
      );
      failed = true;
    }
  }

  // MAKE-ME-SUPERADMIN.sql, run for real.
  //
  // It is the file that turns Fortune's account into the owner's, and it is
  // the one piece of SQL here that a person runs when something is already
  // wrong — so "it reported Success and did nothing" is the failure that
  // costs the most. Both halves are checked: that it refuses loudly when the
  // account does not exist, and that it sets both flags when it does.
  {
    run(`${psql} -c "create database superadmin_test"`, { quiet: true });
    const into = `psql -h ${dir} -p ${PORT} -U postgres -v ON_ERROR_STOP=1 -q -d superadmin_test`;
    run(`${into} -f ${dir}/bootstrap.sql`, { quiet: true });
    for (const name of migrations) {
      run(`${into} -f ${join(root, "supabase/migrations", name)}`, { quiet: true });
    }
    const script = join(root, "supabase/MAKE-ME-SUPERADMIN.sql");

    let refused = false;
    try {
      run(`${into} -f ${script}`, { quiet: true });
    } catch {
      refused = true;
    }
    if (refused) {
      console.log("\u001b[32mPASS  it refuses, loudly, when the account does not exist yet\u001b[0m");
      standalone += 1;
    } else {
      console.log("\u001b[31mFAILED: it reported success on an account that is not there\u001b[0m");
      failed = true;
    }

    // Now the situation that actually happened, in full.
    //
    // TWO accounts for the same address — Supabase makes a second one when
    // somebody has signed in once by email and once with Google — one of them
    // with an empty profile email because the trigger's copy never arrived,
    // and a THIRD with an auth.users row and no profile row at all.
    //
    // On 1 October 2026 the results grid said "administrateur: true" while
    // /admin answered 404, because the script set the flag on one row with
    // `limit 1` and Fortune's session was on the other. Every row has to be
    // set, and the missing profile has to be created, or the file reports
    // success for an account the person is not signed in as.
    const ids = [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "33333333-3333-3333-3333-333333333333",
    ];
    run(
      `${into} -c "insert into auth.users (id, email) values ` +
        `('${ids[0]}', ' LegendFotso@Gmail.com '), ` +
        `('${ids[1]}', 'legendfotso@gmail.com'), ` +
        `('${ids[2]}', 'legendfotso@gmail.com')"`,
      { quiet: true },
    );
    // The first profile loses its email; the third never gets a profile row.
    run(`${into} -c "update public.profiles set email = '' where id = '${ids[0]}'"`, { quiet: true });
    run(`${into} -c "delete from public.profiles where id = '${ids[2]}'"`, { quiet: true });

    try {
      run(`${into} -f ${script}`, { quiet: true });
      run(`${into} -f ${script}`, { quiet: true });   // twice, as promised

      const rows = run(
        `${into} -tAc "select id, email, is_admin, is_unlimited from public.profiles ` +
          `where id in ('${ids.join("','")}') order by id"`,
        { quiet: true },
      ).trim().split("\n").filter(Boolean);

      const allSet = rows.length === 3 && rows.every((row) => {
        const [, email, admin, unlimited] = row.split("|");
        // The address as the person typed it, minus the stray spaces: a
        // trailing space is an address nobody will find by searching.
        return (
          admin === "t" &&
          unlimited === "t" &&
          email === email.trim() &&
          email.toLowerCase() === "legendfotso@gmail.com"
        );
      });

      if (allSet) {
        console.log(
          "\u001b[32mPASS  every account on that address is set, including one with no " +
            "profile row and one with no email\u001b[0m",
        );
        standalone += 1;
      } else {
        console.log(`\u001b[31mFAILED: ${rows.length} of 3 rows; got ${JSON.stringify(rows)}\u001b[0m`);
        failed = true;
      }
    } catch (error) {
      console.log("\u001b[31mFAILED: MAKE-ME-SUPERADMIN.sql did not run\u001b[0m");
      console.log(String(error.stdout || error.stderr || error.message).split("\n").slice(-8).join("\n"));
      failed = true;
    }
  }

  console.log("");

  // The checks print their own PASS lines; a failure raises and psql exits
  // non-zero, which throws here.
  const output = run(`${psql} -f ${join(here, "db-checks.sql")} 2>&1`, { quiet: true });
  const lines = output
    .split("\n")
    .filter((line) => /PASS |FAILED|ERROR/.test(line))
    .map((line) => line.replace(/^psql:.*?(NOTICE|ERROR):\s*/, "").trimEnd());

  for (const line of lines) {
    console.log(line.startsWith("PASS") ? `[32m${line}[0m` : `[31m${line}[0m`);
  }

  const passed = lines.filter((line) => line.startsWith("PASS")).length;
  failed = lines.some((line) => !line.startsWith("PASS"));
  console.log("");
  console.log(`${passed + standalone} database guarantee${passed + standalone === 1 ? "" : "s"} verified`);
} catch (error) {
  failed = true;
  const detail = error.stdout || error.stderr || error.message;
  console.error(String(detail).split("\n").slice(-25).join("\n"));
} finally {
  try {
    run(`pg_ctl -D ${data} -m immediate stop`, { quiet: true });
  } catch {
    /* already down */
  }
  rmSync(dir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
